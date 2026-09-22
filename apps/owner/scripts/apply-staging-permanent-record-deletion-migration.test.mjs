import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePermanentDeletionMigrationConfiguration,
  runPermanentDeletionMigration,
} from "./apply-staging-permanent-record-deletion-migration.mjs";

test("permanent deletion migration requires explicit staging-only approval", () => {
  assert.throws(() => resolvePermanentDeletionMigrationConfiguration({
    CELEBIX_DEPLOYMENT_TIER: "production",
    CELEBIX_STAGING_PERMANENT_DELETION_MIGRATION_MODE: "approved_staging",
    CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://example.invalid/db",
  }), /staging_permanent_deletion_migration_not_approved/);
});

test("permanent deletion migration applies once and always verifies assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_has_role")) return { rowCount: 1, rows: [{ owner_member: true, migration_ready: false }] };
      return { rowCount: null, rows: [] };
    },
  };
  const writes = [];
  await runPermanentDeletionMigration({
    client,
    readSql: (name) => name.includes("assertions") ? "ASSERTIONS_SQL" : "UP_SQL",
    write: (line) => writes.push(line),
  });
  assert.deepEqual(calls, ["connect", calls[1], "UP_SQL", "ASSERTIONS_SQL", "end"]);
  assert.match(calls[1], /record_deletion_operations/);
  assert.deepEqual(writes, ["permanent_record_deletion_migration=applied"]);
});

test("permanent deletion migration skips DDL only when the complete RPC boundary exists", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes("pg_has_role")) return { rowCount: 1, rows: [{ owner_member: true, migration_ready: true }] };
      return { rowCount: null, rows: [] };
    },
  };
  await runPermanentDeletionMigration({ client, readSql: () => "ASSERTIONS_SQL", write() {} });
  assert.equal(calls.includes("UP_SQL"), false);
  assert.equal(calls.includes("ASSERTIONS_SQL"), true);
});
