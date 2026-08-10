import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");

const STALE_STARTER_COMPOSITION_REPAIR = `-- STALE_STARTER_COMPOSITION_REPAIR
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $stale_starter_composition_repair$
BEGIN
  PERFORM record.id
  FROM saas.merchant_admin_records record
  WHERE record.record_kind='starter_theme_composition'
    AND NOT saas.campaign_starter_composition_valid(record.config)
  FOR UPDATE OF record;

  IF EXISTS(
    SELECT 1
    FROM saas.merchant_admin_records record
    WHERE record.record_kind='starter_theme_composition'
      AND NOT saas.campaign_starter_composition_valid(record.config)
      AND (
        record.status='archived'
        OR NOT EXISTS(
          SELECT 1
          FROM saas.storefront_designs design
          WHERE design.store_id=record.store_id
            AND pg_catalog.jsonb_typeof(design.draft_config->'composition')='object'
            AND saas.campaign_starter_composition_valid(design.draft_config->'composition')
        )
      )
  ) THEN
    RAISE EXCEPTION 'STALE_STARTER_COMPOSITION_REPAIR_UNSAFE';
  END IF;

  PERFORM design.store_id
  FROM saas.storefront_designs design
  WHERE EXISTS(
    SELECT 1
    FROM saas.merchant_admin_records record
    WHERE record.store_id=design.store_id
      AND record.record_kind='starter_theme_composition'
      AND record.status<>'archived'
      AND NOT saas.campaign_starter_composition_valid(record.config)
  )
  FOR UPDATE OF design;

  UPDATE saas.merchant_admin_records record
  SET config=design.draft_config->'composition',
      version=record.version+1,
      updated_at=GREATEST(record.updated_at,pg_catalog.clock_timestamp())
  FROM saas.storefront_designs design
  WHERE record.store_id=design.store_id
    AND record.record_kind='starter_theme_composition'
    AND record.status<>'archived'
    AND NOT saas.campaign_starter_composition_valid(record.config)
    AND pg_catalog.jsonb_typeof(design.draft_config->'composition')='object'
    AND saas.campaign_starter_composition_valid(design.draft_config->'composition');

  IF EXISTS(
    SELECT 1
    FROM saas.merchant_admin_records record
    WHERE record.record_kind='starter_theme_composition'
      AND NOT saas.campaign_starter_composition_valid(record.config)
  ) THEN
    RAISE EXCEPTION 'STALE_STARTER_COMPOSITION_REPAIR_INCOMPLETE';
  END IF;
END
$stale_starter_composition_repair$;

COMMIT;`;

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
    verification: `WITH invalid_records AS (
      SELECT record.store_id
      FROM saas.merchant_admin_records record
      WHERE record.record_kind='starter_theme_composition'
        AND NOT saas.campaign_starter_composition_valid(record.config)
    ), record_authority AS (
      SELECT invalid.store_id,
        EXISTS(
          SELECT 1 FROM saas.storefront_designs design
          WHERE design.store_id=invalid.store_id
            AND pg_catalog.jsonb_typeof(design.draft_config->'composition')='object'
            AND saas.campaign_starter_composition_valid(design.draft_config->'composition')
        ) AS repairable
      FROM invalid_records invalid
    )
    SELECT
      EXISTS(SELECT 1 FROM invalid_records) AS record_invalid,
      EXISTS(SELECT 1 FROM invalid_records)
        AND NOT EXISTS(SELECT 1 FROM record_authority WHERE NOT repairable) AS record_repairable,
      EXISTS(
        SELECT 1 FROM saas.campaign_starter_publications publication
        WHERE NOT saas.campaign_starter_composition_valid(publication.config)
      ) AS publication_invalid,
      EXISTS(
        SELECT 1 FROM saas.storefront_designs design
        WHERE NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true)
           OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true)
      ) AS design_invalid`,
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
      if (migration.verification) {
        let verification = await runMigrationQuery(client, migration.verification, migration.code, "verification");
        let durable = verification.rowCount === 1 ? verification.rows[0] : null;
        if (durable?.record_invalid === true) {
          if (durable.record_repairable === true) {
            await runMigrationQuery(client, STALE_STARTER_COMPOSITION_REPAIR, migration.code, "repair");
            write(`category_showcase_repair_${migration.code}=reconciled_from_design`);
            verification = await runMigrationQuery(client, migration.verification, migration.code, "verification");
            durable = verification.rowCount === 1 ? verification.rows[0] : null;
            if (durable?.record_invalid === true) {
              throw new Error(`category_showcase_staging_${migration.code}_record_repair_failed`);
            }
          } else {
            throw new Error(`category_showcase_staging_${migration.code}_record_data_invalid`);
          }
        }
        if (durable?.publication_invalid === true) {
          throw new Error(`category_showcase_staging_${migration.code}_publication_data_invalid`);
        }
        if (durable?.design_invalid === true) {
          throw new Error(`category_showcase_staging_${migration.code}_design_data_invalid`);
        }
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
