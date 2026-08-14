import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");

const ABANDONED_CART_SUMMARY = "saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)";
const ABANDONED_CART_LIST = "saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)";
const ABANDONED_CART_GET = "saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)";
const CHECKOUT_COMPLETE = "saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)";
const CHECKOUT_RETURNING_CUSTOMER_IDENTITY = "saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb)";

const MIGRATIONS = Object.freeze([
  Object.freeze({
    code: "cart_tables",
    up: "202607220030_abandoned_carts.up.sql",
    assertions: "202607220030_abandoned_carts_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regclass('saas.abandoned_carts') IS NOT NULL
        OR pg_catalog.to_regclass('saas.abandoned_cart_items') IS NOT NULL
        OR pg_catalog.to_regclass('saas.abandoned_cart_operations') IS NOT NULL AS has_objects,
      pg_catalog.to_regclass('saas.abandoned_carts') IS NOT NULL
        AND pg_catalog.to_regclass('saas.abandoned_cart_items') IS NOT NULL
        AND pg_catalog.to_regclass('saas.abandoned_cart_operations') IS NOT NULL
        AND EXISTS(
          SELECT 1 FROM pg_catalog.pg_class relation
          WHERE relation.oid='saas.abandoned_carts'::pg_catalog.regclass
            AND relation.relrowsecurity AND relation.relforcerowsecurity
        ) AS ready`,
  }),
  Object.freeze({
    code: "api",
    up: "202607220031_abandoned_cart_api.up.sql",
    assertions: "202607220031_abandoned_cart_api_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('${ABANDONED_CART_SUMMARY}') IS NOT NULL
        OR pg_catalog.to_regprocedure('${ABANDONED_CART_LIST}') IS NOT NULL
        OR pg_catalog.to_regprocedure('${ABANDONED_CART_GET}') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('${ABANDONED_CART_SUMMARY}') IS NOT NULL
        AND pg_catalog.to_regprocedure('${ABANDONED_CART_LIST}') IS NOT NULL
        AND pg_catalog.to_regprocedure('${ABANDONED_CART_GET}') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_SUMMARY}'),'EXECUTE')
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_LIST}'),'EXECUTE')
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_GET}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "capture",
    up: "202607220032_abandoned_cart_capture.up.sql",
    assertions: "202607220032_abandoned_cart_capture_assertions.sql",
    probe: `SELECT
      pg_catalog.to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL AS has_objects,
      pg_catalog.to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)') IS NOT NULL
        AND pg_catalog.has_function_privilege(
          'celebix_saas_workflow',
          pg_catalog.to_regprocedure('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)'),
          'EXECUTE'
        ) AS ready`,
  }),
  Object.freeze({
    code: "durable_projection",
    up: "202608120101_durable_abandoned_cart_integration.up.sql",
    assertions: "202608120101_durable_abandoned_cart_integration_assertions.sql",
    probe: `SELECT
      EXISTS(
        SELECT 1 FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.abandoned_carts'::pg_catalog.regclass
          AND attribute.attname='source_cart_id' AND NOT attribute.attisdropped
      )
        OR pg_catalog.to_regprocedure('saas.sync_durable_abandoned_cart(uuid,uuid,timestamp with time zone)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.reconcile_durable_abandoned_carts(uuid,timestamp with time zone)') IS NOT NULL
        OR EXISTS(
          SELECT 1 FROM pg_catalog.pg_trigger trigger_info
          WHERE trigger_info.tgname IN ('durable_abandoned_cart_sync','durable_abandoned_cart_item_sync')
            AND NOT trigger_info.tgisinternal
        ) AS has_objects,
      EXISTS(
        SELECT 1 FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.abandoned_carts'::pg_catalog.regclass
          AND attribute.attname='source_cart_id' AND NOT attribute.attisdropped
      )
        AND pg_catalog.to_regprocedure('saas.sync_durable_abandoned_cart(uuid,uuid,timestamp with time zone)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.reconcile_durable_abandoned_carts(uuid,timestamp with time zone)') IS NOT NULL
        AND EXISTS(
          SELECT 1 FROM pg_catalog.pg_trigger trigger_info
          WHERE trigger_info.tgrelid='saas.storefront_carts'::pg_catalog.regclass
            AND trigger_info.tgname='durable_abandoned_cart_sync' AND NOT trigger_info.tgisinternal
        )
        AND EXISTS(
          SELECT 1 FROM pg_catalog.pg_trigger trigger_info
          WHERE trigger_info.tgrelid='saas.storefront_cart_items'::pg_catalog.regclass
            AND trigger_info.tgname='durable_abandoned_cart_item_sync' AND NOT trigger_info.tgisinternal
        )
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_SUMMARY}'),'EXECUTE')
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_LIST}'),'EXECUTE')
        AND pg_catalog.has_function_privilege('celebix_saas_app',pg_catalog.to_regprocedure('${ABANDONED_CART_GET}'),'EXECUTE') AS ready`,
  }),
  Object.freeze({
    code: "product_customer_identity",
    up: "202608120103_abandoned_cart_product_customer_identity.up.sql",
    assertions: "202608120103_abandoned_cart_product_customer_identity_assertions.sql",
    probe: `SELECT
      EXISTS(
        SELECT 1 FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.abandoned_carts'::pg_catalog.regclass
          AND attribute.attname='customer_id' AND NOT attribute.attisdropped
      )
        OR pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)') IS NOT NULL
        OR pg_catalog.to_regprocedure('saas.storefront_verified_customer_from_candidates(uuid,timestamp with time zone,jsonb)') IS NOT NULL AS has_objects,
      EXISTS(
        SELECT 1 FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.abandoned_carts'::pg_catalog.regclass
          AND attribute.attname='customer_id' AND NOT attribute.attisdropped
      )
        AND pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)') IS NOT NULL
        AND pg_catalog.to_regprocedure('saas.storefront_verified_customer_from_candidates(uuid,timestamp with time zone,jsonb)') IS NOT NULL
        AND pg_catalog.has_function_privilege(
          'celebix_saas_host_resolver',
          pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer,jsonb)'),
          'EXECUTE'
        ) AS ready`,
  }),
  Object.freeze({
    code: "checkout_returning_customer_identity",
    up: "202608140105_storefront_checkout_returning_customer_identity.up.sql",
    assertions: "202608140105_storefront_checkout_returning_customer_identity_assertions.sql",
    probe: `WITH checkout_wrapper AS (
      SELECT CASE
        WHEN pg_catalog.to_regprocedure('${CHECKOUT_COMPLETE}') IS NULL THEN ''
        ELSE pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('${CHECKOUT_COMPLETE}'))
      END AS definition
    )
    SELECT
      pg_catalog.to_regprocedure('${CHECKOUT_RETURNING_CUSTOMER_IDENTITY}') IS NOT NULL
        OR pg_catalog.strpos(definition,'storefront_checkout_reconcile_customer_identity_v105')>0 AS has_objects,
      pg_catalog.to_regprocedure('${CHECKOUT_RETURNING_CUSTOMER_IDENTITY}') IS NOT NULL
        AND pg_catalog.strpos(definition,'storefront_checkout_reconcile_customer_identity_v105')>0
        AND pg_catalog.strpos(definition,'public_checkout_complete_without_available_stock_v090')>0
        AND pg_catalog.has_function_privilege(
          'celebix_saas_host_resolver',
          pg_catalog.to_regprocedure('${CHECKOUT_COMPLETE}'),
          'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'celebix_saas_app',
          pg_catalog.to_regprocedure('${CHECKOUT_RETURNING_CUSTOMER_IDENTITY}'),
          'EXECUTE'
        )
        AND NOT pg_catalog.has_function_privilege(
          'celebix_saas_host_resolver',
          pg_catalog.to_regprocedure('${CHECKOUT_RETURNING_CUSTOMER_IDENTITY}'),
          'EXECUTE'
        ) AS ready
    FROM checkout_wrapper`,
  }),
]);

const BACKFILL = Object.freeze({
  code: "backfill",
  up: "202608120102_durable_abandoned_cart_rollout_backfill.up.sql",
  assertions: "202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql",
});

export function resolveAbandonedCartMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("abandoned_cart_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("abandoned_cart_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("abandoned_cart_staging_database_invalid"); }
  const urlDatabaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || databaseName !== urlDatabaseName
    || !databaseName.includes("staging")
  ) throw new Error("abandoned_cart_staging_database_invalid");

  return Object.freeze({ databaseUrl, databaseName });
}

async function runMigrationQuery(client, sql, migrationCode, phase) {
  try {
    return await client.query(sql);
  } catch (error) {
    const ownedCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`abandoned_cart_staging_${migrationCode}_${ownedCode}`);
  }
}

export async function runAbandonedCartMigrations({ client, databaseName, readSql, write }) {
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
    ) throw new Error("abandoned_cart_staging_authority_invalid");

    for (const migration of MIGRATIONS) {
      const probe = await runMigrationQuery(client, migration.probe, migration.code, "probe");
      const state = probe.rowCount === 1 ? probe.rows[0] : null;
      if (state?.has_objects === true && state.ready !== true) {
        throw new Error(`abandoned_cart_staging_${migration.code}_partial`);
      }
      if (state?.ready !== true) {
        await runMigrationQuery(client, readSql(migration.up), migration.code, "apply");
      }
      await runMigrationQuery(client, readSql(migration.assertions), migration.code, "assertions");
      write(`abandoned_cart_migration_${migration.code}=${state?.ready === true ? "already_applied" : "applied"}`);
    }

    await runMigrationQuery(client, readSql(BACKFILL.up), BACKFILL.code, "apply");
    await runMigrationQuery(client, readSql(BACKFILL.assertions), BACKFILL.code, "assertions");
    write("abandoned_cart_migration_backfill=applied");
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveAbandonedCartMigrationConfiguration();
  const { default: pg } = await import("pg");
  const { Client } = pg;
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-abandoned-cart-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runAbandonedCartMigrations({
    client,
    databaseName: config.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^abandoned_cart_staging_[a-z_]+$/u.test(error.message)
      ? error.message
      : "abandoned_cart_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
