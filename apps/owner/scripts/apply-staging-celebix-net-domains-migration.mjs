import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const UP_FILE = "202609230147_celebix_net_staging_admin_domain_management.up.sql";
const ASSERTIONS_FILE = "202609230147_celebix_net_staging_admin_domain_management_assertions.sql";
const STOREFRONT_UP_FILE = "202609230148_celebix_net_staging_starter_storefront.up.sql";
const STOREFRONT_ASSERTIONS_FILE = "202609230148_celebix_net_staging_starter_storefront_assertions.sql";

export function resolveCelebixNetDomainsMigrationConfiguration(source = process.env) {
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging" ||
    source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging" ||
    source.CELEBIX_PANEL_ORIGIN !== "https://panel.saas-staging.celebix.net" ||
    source.CELEBIX_PLATFORM_DOMAIN_SUFFIX !== "saas-staging.celebix.net"
  ) throw new Error("celebix_net_staging_migration_not_approved");

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  let parsed;
  try { parsed = new URL(databaseUrl); }
  catch { throw new Error("celebix_net_staging_migration_database_url_invalid"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) {
    throw new Error("celebix_net_staging_migration_database_url_invalid");
  }
  if (source.CELEBIX_SAAS_DATABASE_NAME && parsed.pathname !== `/${source.CELEBIX_SAAS_DATABASE_NAME}`) {
    throw new Error("celebix_net_staging_migration_database_name_mismatch");
  }
  return Object.freeze({ databaseUrl });
}

export async function runCelebixNetDomainsMigration({ client, readSql, write }) {
  await client.connect();
  try {
    const preflight = await client.query(`
      SELECT
        pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member,
        COALESCE(pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure('saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)')
          ),
          '.admin.saas-staging.celebix.net'
        ) > 0, false)
        AND COALESCE(pg_catalog.strpos(
          pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure('saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)')
          ),
          'management, status, canonical'
        ) > 0, false) AS migration_ready,
        pg_catalog.to_regprocedure('saas.provision_celebix_net_starter_storefront(uuid)') IS NOT NULL
          AS storefront_ready
    `);
    const row = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (row?.owner_member !== true) throw new Error("celebix_net_staging_migration_authority_invalid");
    if (row.migration_ready !== true) await client.query(readSql(UP_FILE));
    await client.query(readSql(ASSERTIONS_FILE));
    write(`celebix_net_staging_admin_domain_management=${row.migration_ready === true ? "already_applied" : "applied"}`);
    if (row.storefront_ready !== true) await client.query(readSql(STOREFRONT_UP_FILE));
    await client.query(readSql(STOREFRONT_ASSERTIONS_FILE));
    write(`celebix_net_staging_starter_storefront=${row.storefront_ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveCelebixNetDomainsMigrationConfiguration();
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-net-admin-domain-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    lock_timeout: 5_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runCelebixNetDomainsMigration({
    client,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^celebix_net_staging_migration_[a-z_]+$/.test(error.message)
      ? error.message
      : "celebix_net_staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
