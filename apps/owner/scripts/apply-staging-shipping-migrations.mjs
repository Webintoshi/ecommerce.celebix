import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");

const MIGRATIONS = Object.freeze([
  Object.freeze({
    code: "provider_foundation",
    up: "202608060093_shipping_provider_foundation.up.sql",
    assertions: "202608060093_shipping_provider_foundation_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regclass('saas.shipping_provider_profiles') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.shipping_provider_preflight()') IS NOT NULL AS has_objects,
      pg_catalog.to_regclass('saas.shipping_provider_profiles') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.shipping_provider_preflight()') IS NOT NULL AS ready`,
  }),
  Object.freeze({
    code: "fulfillment_runtime",
    up: "202608060094_shipping_fulfillment_runtime.up.sql",
    assertions: "202608060094_shipping_fulfillment_runtime_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regclass('saas.shipping_shipments') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.shipping_fulfillment_runtime_preflight()') IS NOT NULL AS has_objects,
      pg_catalog.to_regclass('saas.shipping_shipments') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.shipping_fulfillment_runtime_preflight()') IS NOT NULL AS ready`,
  }),
]);

export function resolveShippingMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("shipping_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("shipping_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("shipping_staging_database_invalid"); }
  const urlDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || databaseName !== urlDatabaseName
    || !databaseName.includes("staging")
  ) throw new Error("shipping_staging_database_invalid");

  return Object.freeze({ databaseUrl, databaseName });
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function ensurePanelWorkflowMembership(client, write) {
  const candidates = await client.query(`SELECT
    candidate.rolname,
    pg_catalog.pg_has_role(candidate.oid, 'celebix_saas_workflow', 'MEMBER') AS workflow_member
  FROM pg_catalog.pg_roles AS candidate
  WHERE candidate.rolcanlogin
    AND NOT candidate.rolinherit
    AND NOT candidate.rolsuper
    AND NOT candidate.rolcreatedb
    AND NOT candidate.rolcreaterole
    AND NOT candidate.rolreplication
    AND NOT candidate.rolbypassrls
    AND pg_catalog.pg_has_role(candidate.oid, 'celebix_saas_identity', 'MEMBER')
    AND pg_catalog.pg_has_role(candidate.oid, 'celebix_saas_app', 'MEMBER')
    AND pg_catalog.pg_has_role(candidate.oid, 'celebix_saas_host_resolver', 'MEMBER')
  ORDER BY candidate.rolname`);
  if (candidates.rowCount !== 1) {
    throw new Error("shipping_staging_panel_runtime_candidate_invalid");
  }
  const candidate = candidates.rows[0];
  if (candidate.workflow_member === true) {
    write("panel_workflow_membership=already_present");
    return;
  }

  let transactionActive = false;
  try {
    await client.query("BEGIN");
    transactionActive = true;
    await client.query(`GRANT celebix_saas_workflow TO ${quoteIdentifier(candidate.rolname)}`);
    const verified = await client.query(
      "SELECT pg_catalog.pg_has_role($1, 'celebix_saas_workflow', 'MEMBER') AS workflow_member",
      [candidate.rolname],
    );
    if (verified.rowCount !== 1 || verified.rows[0]?.workflow_member !== true) {
      throw new Error("shipping_staging_panel_workflow_membership_invalid");
    }
    await client.query("COMMIT");
    transactionActive = false;
    write("panel_workflow_membership=granted");
  } catch (error) {
    if (transactionActive) {
      try { await client.query("ROLLBACK"); } catch { /* connection closes below */ }
    }
    throw error;
  }
}

export async function runShippingMigrations({ client, databaseName, readSql, write }) {
  await client.connect();
  try {
    const preflight = await client.query(`SELECT
      current_database() = $1 AS database_matches,
      current_setting('server_version_num')::integer / 10000 = 16 AS postgres_matches,
      current_setting('celebix.deployment_tier', true) = 'isolated_staging' AS tier_matches,
      NOT pg_catalog.pg_is_in_recovery() AS writable_primary,
      current_setting('transaction_read_only') = 'off' AS writable_transaction,
      pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS authority
        WHERE authority.rolname = current_user
          AND (
            authority.rolsuper
            OR authority.rolcreaterole
            OR EXISTS (
              SELECT 1
              FROM pg_catalog.pg_auth_members AS membership
              WHERE membership.roleid = 'celebix_saas_workflow'::pg_catalog.regrole
                AND membership.member = authority.oid
                AND membership.admin_option
            )
          )
      ) AS workflow_grant_authority`, [databaseName]);
    const authority = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (
      authority?.database_matches !== true
      || authority.postgres_matches !== true
      || authority.tier_matches !== true
      || authority.writable_primary !== true
      || authority.writable_transaction !== true
      || authority.owner_member !== true
      || authority.workflow_grant_authority !== true
    ) throw new Error("shipping_staging_authority_invalid");

    for (const migration of MIGRATIONS) {
      const probe = await client.query(migration.probe);
      const state = probe.rowCount === 1 ? probe.rows[0] : null;
      if (state?.has_objects === true && state.ready !== true) {
        throw new Error(`shipping_staging_${migration.code}_partial`);
      }
      if (state?.ready !== true) await client.query(readSql(migration.up));
      await client.query(readSql(migration.assertions));
      write(`shipping_migration_${migration.code}=${state?.ready === true ? "already_applied" : "applied"}`);
    }
    await ensurePanelWorkflowMembership(client, write);
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveShippingMigrationConfiguration();
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-shipping-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runShippingMigrations({
    client,
    databaseName: config.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^shipping_staging_[a-z_]+$/.test(error.message)
      ? error.message
      : "shipping_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
