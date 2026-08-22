import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const MIGRATION = Object.freeze({
  code: "homepage_product_order",
  up: "202608220114_homepage_sold_out_product_order.up.sql",
  assertions: "202608220114_homepage_sold_out_product_order_assertions.sql",
  probe: `SELECT
    pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)') IS NOT NULL AS has_objects,
    pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)') IS NOT NULL
      AND pg_catalog.has_function_privilege(
        'celebix_saas_host_resolver',
        'saas.public_starter_retail_home(uuid,text,timestamp with time zone)',
        'EXECUTE'
      )
      AND pg_catalog.strpos(COALESCE((
        SELECT procedure.prosrc
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid=pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)')
      ), ''), 'pg_catalog.jsonb_array_elements(items) WITH ORDINALITY') > 0
      AND pg_catalog.strpos(COALESCE((
        SELECT procedure.prosrc
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid=pg_catalog.to_regprocedure('saas.public_starter_retail_home(uuid,text,timestamp with time zone)')
      ), ''), 'WHERE COALESCE((filtered.value->>''available'')::boolean,false)') = 0 AS ready`,
});

export function resolveHomepageProductOrderMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("homepage_product_order_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("homepage_product_order_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("homepage_product_order_staging_database_invalid"); }
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || decodeURIComponent(parsed.pathname.slice(1)) !== databaseName
    || !databaseName.includes("staging")
  ) throw new Error("homepage_product_order_staging_database_invalid");

  return Object.freeze({ activationId, databaseName, databaseUrl });
}

async function runMigrationQuery(client, sql, phase) {
  try {
    return await client.query(sql);
  } catch (error) {
    const ownedCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`homepage_product_order_staging_${MIGRATION.code}_${ownedCode}`);
  }
}

export async function runHomepageProductOrderMigration({ client, databaseName, readSql, write }) {
  await client.connect();
  try {
    const preflight = await client.query(`SELECT
      current_database() = $1 AS database_matches,
      current_setting('server_version_num')::integer / 10000 = 16 AS postgres_matches,
      current_setting('celebix.deployment_tier', true) = 'isolated_staging' AS tier_matches,
      NOT pg_catalog.pg_is_in_recovery() AS writable_primary,
      current_setting('transaction_read_only') = 'off' AS writable_transaction,
      pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member`, [databaseName]);
    const authority = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (
      authority?.database_matches !== true
      || authority.postgres_matches !== true
      || authority.tier_matches !== true
      || authority.writable_primary !== true
      || authority.writable_transaction !== true
      || authority.owner_member !== true
    ) throw new Error("homepage_product_order_staging_authority_invalid");

    const probe = await runMigrationQuery(client, MIGRATION.probe, "probe");
    const state = probe.rowCount === 1 ? probe.rows[0] : null;
    if (state?.has_objects !== true) throw new Error("homepage_product_order_staging_base_missing");
    if (state.ready !== true) {
      await runMigrationQuery(client, readSql(MIGRATION.up), "apply");
    }
    await runMigrationQuery(client, readSql(MIGRATION.assertions), "assertions");
    write(`homepage_product_order_migration=${state.ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const configuration = resolveHomepageProductOrderMigrationConfiguration();
  const client = new Client({
    connectionString: configuration.databaseUrl,
    application_name: `celebix-staging-homepage-product-order-${configuration.activationId}`,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runHomepageProductOrderMigration({
    client,
    databaseName: configuration.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^homepage_product_order_staging_[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : "homepage_product_order_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
