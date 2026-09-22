import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIRECTORY = path.join(SCRIPT_DIRECTORY, "sql", "saas");
const UP_FILE = "202609220142_permanent_record_deletion.up.sql";
const ASSERTIONS_FILE = "202609220142_permanent_record_deletion_assertions.sql";

export function resolvePermanentDeletionMigrationConfiguration(source = process.env) {
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging" ||
    source.CELEBIX_STAGING_PERMANENT_DELETION_MIGRATION_MODE !== "approved_staging"
  ) throw new Error("staging_permanent_deletion_migration_not_approved");
  const databaseUrl = source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("staging_permanent_deletion_migration_database_url_missing");
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("staging_permanent_deletion_migration_database_url_invalid"); }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error("staging_permanent_deletion_migration_database_url_invalid");
  }
  return Object.freeze({ databaseUrl });
}

export async function runPermanentDeletionMigration({ client, readSql, write }) {
  await client.connect();
  try {
    const preflight = await client.query(`
      SELECT
        pg_catalog.pg_has_role(current_user, 'celebix_saas_owner', 'MEMBER') AS owner_member,
        pg_catalog.to_regclass('saas.record_deletion_operations') IS NOT NULL
          AND pg_catalog.to_regprocedure('saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NOT NULL
          AND pg_catalog.to_regprocedure('saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NOT NULL
          AND pg_catalog.to_regprocedure('saas.delete_order_recover(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NOT NULL
          AS migration_ready
    `);
    const row = preflight.rowCount === 1 ? preflight.rows[0] : null;
    if (row?.owner_member !== true) throw new Error("staging_permanent_deletion_migration_authority_invalid");
    if (row.migration_ready !== true) await client.query(readSql(UP_FILE));
    await client.query(readSql(ASSERTIONS_FILE));
    write(`permanent_record_deletion_migration=${row.migration_ready === true ? "already_applied" : "applied"}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const config = resolvePermanentDeletionMigrationConfiguration();
  const client = new Client({
    connectionString: config.databaseUrl,
    application_name: "celebix-staging-permanent-record-deletion-migration",
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    lock_timeout: 5_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  await runPermanentDeletionMigration({
    client,
    readSql: (name) => fs.readFileSync(path.join(SQL_DIRECTORY, name), "utf8"),
    write: (line) => process.stdout.write(`${line}\n`),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error instanceof Error && /^staging_permanent_deletion_migration_[a-z_]+$/.test(error.message)
      ? error.message
      : "staging_permanent_deletion_migration_failed";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
