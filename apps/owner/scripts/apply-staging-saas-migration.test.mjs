import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMigrationConfiguration,
  runStorefrontCustomDomainsMigration,
} from "./apply-staging-saas-migration.mjs";

test("staging migration configuration fails closed outside approved staging", () => {
  assert.throws(
    () => resolveMigrationConfiguration({
      CELEBIX_DEPLOYMENT_TIER: "production",
      CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
      CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://example.invalid/db",
    }),
    /staging_migration_not_approved/,
  );
});

test("staging migration configuration never exposes the connection string", () => {
  const config = resolveMigrationConfiguration({
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
    CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://secret.invalid/db",
  });

  assert.deepEqual(Object.keys(config), ["databaseUrl"]);
  assert.equal(JSON.stringify({ status: "ready" }).includes(config.databaseUrl), false);
});

test("custom-domain migration applies once and always runs assertions", async () => {
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

  await runStorefrontCustomDomainsMigration({
    client,
    readSql: (name) => name.includes("assertions") ? "ASSERTIONS_SQL" : "UP_SQL",
    write: (line) => writes.push(line),
  });

  assert.equal(calls[0], "connect");
  assert.match(calls[1], /pg_has_role/);
  assert.deepEqual(calls.slice(2), ["UP_SQL", "ASSERTIONS_SQL", "end"]);
  assert.deepEqual(writes, ["storefront_custom_domains_migration=applied"]);
});

test("custom-domain migration skips DDL when already present", async () => {
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

  await runStorefrontCustomDomainsMigration({
    client,
    readSql: (name) => name.includes("assertions") ? "ASSERTIONS_SQL" : "UP_SQL",
    write: () => undefined,
  });

  assert.equal(calls.includes("UP_SQL"), false);
  assert.equal(calls.includes("ASSERTIONS_SQL"), true);
  assert.equal(calls.at(-1), "end");
});
