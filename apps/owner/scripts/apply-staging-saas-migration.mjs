import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const UP_FILE = "202608050088_storefront_custom_domains.up.sql";
const ASSERTIONS_FILE = "202608050088_storefront_custom_domains_assertions.sql";

export function resolveMigrationConfiguration(source = process.env) {
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging"
    || source.CELEBIX_STAGING_MIGRATION_MODE !== "approved_staging"
  ) {
    throw new Error("staging_migration_not_approved");
  }

  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("staging_migration_database_url_missing");

  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("staging_migration_database_url_invalid"); }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error("staging_migration_database_url_invalid");
  }

  return Object.freeze({ databaseUrl });
}

export async function runStorefrontCustomDomainsMigration({ client, readSql, write }) {
  await client.connect();
  try {
    const preflight = await client.query(`
      SELECT
        pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member,
        pg_catalog.to_regclass('saas.store_domain_provisioning') IS NOT NULL
          AND pg_catalog.to_regclass('saas.store_domain_operations') IS NOT NULL
          AND pg_catalog.to_regprocedure('saas.resolve_store_domain_origin_health(text,timestamp with time zone)') IS NOT NULL
          AS migration_ready
    `);
    const row = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (row?.owner_member !== true) throw new Error("staging_migration_authority_invalid");

    if (row.migration_ready !== true) await client.query(readSql(UP_FILE));
    await client.query(readSql(ASSERTIONS_FILE));
    write(`storefront_custom_domains_migration=${row.migration_ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolveMigrationConfiguration();
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-storefront-custom-domains-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    lock_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runStorefrontCustomDomainsMigration({
    client,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^staging_migration_[a-z_]+$/.test(error.message)
      ? error.message
      : "staging_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
