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
    code: "responsive_layout",
    up: "202608090097_responsive_category_showcase_layout.up.sql",
    assertions: "202608090097_responsive_category_showcase_layout_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_add_default(jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_strip(jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamp with time zone,boolean)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_add_default(jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_strip(jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamp with time zone,boolean)') IS NOT NULL AS ready`,
  }),
  Object.freeze({
    code: "empty_homepage",
    up: "202608090098_empty_homepage_sections.up.sql",
    assertions: "202608090098_empty_homepage_sections_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NOT NULL AS ready`,
  }),
  Object.freeze({
    code: "single_authority",
    up: "202608100099_single_authority_category_showcase.up.sql",
    assertions: "202608100099_single_authority_category_showcase_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamp with time zone,boolean)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamp with time zone,boolean)') IS NOT NULL AS ready`,
  }),
]);

export function resolveCategoryShowcaseMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("category_showcase_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("category_showcase_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("category_showcase_staging_database_invalid"); }
  const urlDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || databaseName !== urlDatabaseName
    || !databaseName.includes("staging")
  ) throw new Error("category_showcase_staging_database_invalid");

  return Object.freeze({ databaseUrl, databaseName });
}

async function runMigrationQuery(client, sql, migrationCode, phase) {
  try {
    return await client.query(sql);
  } catch (error) {
    const ownedCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`category_showcase_staging_${migrationCode}_${ownedCode}`);
  }
}

export async function runCategoryShowcaseMigrations({ client, databaseName, readSql, write }) {
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
    ) throw new Error("category_showcase_staging_authority_invalid");

    for (const migration of MIGRATIONS) {
      const probe = await runMigrationQuery(client, migration.probe, migration.code, "probe");
      const state = probe.rowCount === 1 ? probe.rows[0] : null;
      if (state?.has_objects === true && state.ready !== true) {
        throw new Error(`category_showcase_staging_${migration.code}_partial`);
      }
      if (state?.ready !== true) {
        await runMigrationQuery(client, readSql(migration.up), migration.code, "apply");
      }
      await runMigrationQuery(client, readSql(migration.assertions), migration.code, "assertions");
      write(`category_showcase_migration_${migration.code}=${state?.ready === true ? "already_applied" : "applied"}`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveCategoryShowcaseMigrationConfiguration();
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-category-showcase-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runCategoryShowcaseMigrations({
    client,
    databaseName: config.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^category_showcase_staging_[a-z_]+$/.test(error.message)
      ? error.message
      : "category_showcase_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
