import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");

const CATALOG_ONBOARDING_MIGRATION = Object.freeze({
  code: "056",
  up: "202607280056_catalog_product_onboarding.up.sql",
  assertions: "202607280056_catalog_product_onboarding_assertions.sql",
  probe: `SELECT
    pg_catalog.to_regclass('saas.catalog_product_profiles') IS NOT NULL
      OR pg_catalog.to_regclass('saas.catalog_categories') IS NOT NULL
      OR pg_catalog.to_regclass('saas.catalog_product_categories') IS NOT NULL
      OR pg_catalog.to_regclass('saas.catalog_variant_commerce_profiles') IS NOT NULL
      OR pg_catalog.to_regclass('saas.catalog_product_channels') IS NOT NULL
      OR pg_catalog.to_regclass('saas.catalog_onboarding_operations') IS NOT NULL
      OR pg_catalog.to_regprocedure('saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)') IS NOT NULL
      OR pg_catalog.to_regprocedure('saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)') IS NOT NULL AS has_objects,
    pg_catalog.to_regclass('saas.catalog_product_profiles') IS NOT NULL
      AND pg_catalog.to_regclass('saas.catalog_categories') IS NOT NULL
      AND pg_catalog.to_regclass('saas.catalog_product_categories') IS NOT NULL
      AND pg_catalog.to_regclass('saas.catalog_variant_commerce_profiles') IS NOT NULL
      AND pg_catalog.to_regclass('saas.catalog_product_channels') IS NOT NULL
      AND pg_catalog.to_regclass('saas.catalog_onboarding_operations') IS NOT NULL
      AND EXISTS(
        SELECT 1 FROM pg_catalog.pg_class relation
        WHERE relation.oid=pg_catalog.to_regclass('saas.catalog_onboarding_operations')
          AND relation.relrowsecurity AND relation.relforcerowsecurity
      )
      AND pg_catalog.to_regprocedure('saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,integer)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,integer)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_list_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_list_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,jsonb)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,jsonb)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_archive_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_archive_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)','EXECUTE')
      AND pg_catalog.to_regprocedure('saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
      AND pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)','EXECUTE') AS ready`,
});

export function resolveCatalogOnboardingMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("catalog_onboarding_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("catalog_onboarding_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("catalog_onboarding_staging_database_invalid"); }
  const urlDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || databaseName !== urlDatabaseName
    || !databaseName.includes("staging")
  ) throw new Error("catalog_onboarding_staging_database_invalid");

  return Object.freeze({ databaseUrl, databaseName });
}

async function runMigrationQuery(client, sql, migrationCode, phase) {
  try {
    return await client.query(sql);
  } catch (error) {
    const ownedCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`catalog_onboarding_staging_${migrationCode}_${ownedCode}`);
  }
}

export async function runCatalogOnboardingMigration({ client, databaseName, readSql, write }) {
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
    ) throw new Error("catalog_onboarding_staging_authority_invalid");

    const probe = await runMigrationQuery(client, CATALOG_ONBOARDING_MIGRATION.probe, CATALOG_ONBOARDING_MIGRATION.code, "probe");
    const state = probe.rowCount === 1 ? probe.rows[0] : null;
    if (state?.has_objects === true && state.ready !== true) {
      throw new Error("catalog_onboarding_staging_056_partial");
    }
    if (state?.ready !== true) {
      await runMigrationQuery(client, readSql(CATALOG_ONBOARDING_MIGRATION.up), CATALOG_ONBOARDING_MIGRATION.code, "apply");
    }
    await runMigrationQuery(client, readSql(CATALOG_ONBOARDING_MIGRATION.assertions), CATALOG_ONBOARDING_MIGRATION.code, "assertions");
    write(`catalog_onboarding_migration_056=${state?.ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveCatalogOnboardingMigrationConfiguration();
  const { default: pg } = await import("pg");
  const { Client } = pg;
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-catalog-onboarding-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runCatalogOnboardingMigration({
    client,
    databaseName: config.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^catalog_onboarding_staging_[a-z0-9_]+$/u.test(error.message)
      ? error.message
      : "catalog_onboarding_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
