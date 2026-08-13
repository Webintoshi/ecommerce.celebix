import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const UP_FILE = "202608110100_modular_homepage_builder.up.sql";
const ASSERTIONS_FILE = "202608110100_modular_homepage_builder_assertions.sql";

export function resolveModularHomepageMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("modular_homepage_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("modular_homepage_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("modular_homepage_staging_database_invalid"); }
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || decodeURIComponent(parsed.pathname.slice(1)) !== databaseName
    || !databaseName.includes("staging")
  ) throw new Error("modular_homepage_staging_database_invalid");

  return Object.freeze({ activationId, databaseName, databaseUrl });
}

async function query(client, text, phase) {
  try { return await client.query(text); }
  catch (error) {
    const owned = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`modular_homepage_staging_${owned}`);
  }
}

export async function runModularHomepageMigration({ client, databaseName, readSql, write }) {
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
    ) throw new Error("modular_homepage_staging_authority_invalid");

    const probe = await client.query(`SELECT
      pg_catalog.to_regprocedure('saas.storefront_design_document_with_home_ids(jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.storefront_theme_composition_with_home_ids(jsonb)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('saas.storefront_design_document_with_home_ids(jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.storefront_theme_composition_with_home_ids(jsonb)') IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM saas.storefront_designs WHERE schema_version <> 4) AS ready`);
    const state = probe.rowCount === 1 ? probe.rows[0] : null;
    if (state?.has_objects === true && state.ready !== true) throw new Error("modular_homepage_staging_partial");
    if (state?.ready !== true) await query(client, readSql(UP_FILE), "apply");
    await query(client, readSql(ASSERTIONS_FILE), "assertions");
    write(`modular_homepage_migration=${state?.ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const configuration = resolveModularHomepageMigrationConfiguration();
  const client = new Client({
    connectionString: configuration.databaseUrl,
    application_name: `celebix-staging-modular-homepage-${configuration.activationId}`,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runModularHomepageMigration({
    client,
    databaseName: configuration.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^modular_homepage_staging_[a-z_]+$/u.test(error.message)
      ? error.message
      : "modular_homepage_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
