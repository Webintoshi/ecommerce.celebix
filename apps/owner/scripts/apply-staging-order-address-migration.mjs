import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const UP_FILE = "202608160112_storefront_builtin_checkout_order_address.up.sql";
const ASSERTIONS_FILE = "202608160112_storefront_builtin_checkout_order_address_assertions.sql";

export function resolveOrderAddressMigrationConfiguration(source = process.env) {
  const activationId = source.CELEBIX_STAGING_ACTIVATION_ID?.trim() ?? "";
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_SAAS_AUTH_MODE !== "approved_staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
    || !/^staging_[a-z0-9_]{3,80}$/u.test(activationId)
  ) throw new Error("order_address_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  const databaseName = source.CELEBIX_SAAS_DATABASE_NAME?.trim();
  if (!databaseUrl || !databaseName) throw new Error("order_address_staging_database_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("order_address_staging_database_invalid"); }
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol)
    || !parsed.hostname
    || decodeURIComponent(parsed.pathname.slice(1)) !== databaseName
    || !databaseName.includes("staging")
  ) throw new Error("order_address_staging_database_invalid");

  return Object.freeze({ activationId, databaseName, databaseUrl });
}

async function runOrderAddressQuery(client, sql, phase) {
  try {
    return await client.query(sql);
  } catch (error) {
    const ownedCode = error instanceof Error && /^[A-Z][A-Z0-9_]{2,120}$/u.test(error.message)
      ? error.message.toLowerCase()
      : `${phase}_failed`;
    throw new Error(`order_address_staging_${phase}_${ownedCode}`);
  }
}

export async function runOrderAddressMigration({ client, databaseName, readSql, write }) {
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
    ) throw new Error("order_address_staging_authority_invalid");

    const probe = await runOrderAddressQuery(client, `WITH definitions AS (
      SELECT
        pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
          'saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'
        )) AS checkout_definition,
        pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(
          'saas.orders_detail_projection(uuid,uuid)'
        )) AS detail_definition
    )
    SELECT
      checkout_definition LIKE '%recipientName%' AND checkout_definition LIKE '%selected_customer.first_name%' AS checkout_ready,
      detail_definition LIKE '%selected_order.customer_name%' AS detail_ready,
      NOT EXISTS(
        SELECT 1
        FROM saas.orders order_row
        WHERE order_row.source='storefront'
          AND order_row.shipping_address IS NOT NULL
          AND pg_catalog.jsonb_typeof(order_row.shipping_address)='object'
          AND NULLIF(pg_catalog.btrim(order_row.shipping_address->>'recipientName'), '') IS NULL
          AND NULLIF(pg_catalog.btrim(order_row.customer_name), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(order_row.shipping_address->>'line1'), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(order_row.shipping_address->>'city'), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(order_row.shipping_address->>'country'), '') IS NOT NULL
      ) AS backfill_ready
    FROM definitions`, "probe");
    const state = probe.rowCount === 1 ? probe.rows[0] : null;
    const ready = state?.checkout_ready === true && state.detail_ready === true && state.backfill_ready === true;

    if (!ready) {
      await runOrderAddressQuery(client, readSql(UP_FILE), "apply");
    }
    await runOrderAddressQuery(client, readSql(ASSERTIONS_FILE), "assertions");
    write(`order_address_migration=${ready ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const configuration = resolveOrderAddressMigrationConfiguration();
  const client = new Client({
    connectionString: configuration.databaseUrl,
    application_name: `celebix-staging-order-address-${configuration.activationId}`,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 180_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runOrderAddressMigration({
    client,
    databaseName: configuration.databaseName,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^order_address_staging_[a-z_]+$/u.test(error.message)
      ? error.message
      : "order_address_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
