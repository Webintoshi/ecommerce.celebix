import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveShippingMigrationConfiguration,
  runShippingMigrations,
} from "./apply-staging-shipping-migrations.mjs";

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth01",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth01",
  CELEBIX_SAAS_DATABASE_URL: "postgres://owner:secret@database.internal/celebix_saas_staging_auth01",
});

test("shipping staging migration rejects production, wrong activation, and database mismatch", () => {
  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "staging_other" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "production" },
  ]) assert.throws(() => resolveShippingMigrationConfiguration(source), /shipping_staging_/);

  const resolved = resolveShippingMigrationConfiguration(approved);
  assert.deepEqual(resolved, {
    databaseName: "celebix_saas_staging_auth01",
    databaseUrl: approved.CELEBIX_SAAS_DATABASE_URL,
  });
});

test("shipping staging migration applies 093 then 094 and verifies both contracts", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values) {
      calls.push({ sql, values });
      if (values) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      if (String(sql).startsWith("SELECT")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: null, rows: [] };
    },
  };
  const lines = [];
  await runShippingMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  const sql = calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql);
  assert.deepEqual(sql, [
    "-- 202608060093_shipping_provider_foundation.up.sql",
    "-- 202608060093_shipping_provider_foundation_assertions.sql",
    "-- 202608060094_shipping_fulfillment_runtime.up.sql",
    "-- 202608060094_shipping_fulfillment_runtime_assertions.sql",
  ]);
  assert.deepEqual(lines, [
    "shipping_migration_provider_foundation=applied",
    "shipping_migration_fulfillment_runtime=applied",
  ]);
  assert.equal(calls.at(-1), "end");
});

test("shipping staging migration fails closed on a partial schema and still closes the connection", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(_sql, values) {
      if (values) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
    },
  };
  await assert.rejects(
    runShippingMigrations({ client, databaseName: approved.CELEBIX_SAAS_DATABASE_NAME, readSql: () => "", write: () => {} }),
    /shipping_staging_provider_foundation_partial/,
  );
  assert.equal(calls.at(-1), "end");
});
