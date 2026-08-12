import assert from "node:assert/strict";
import test from "node:test";

const target = new URL("./apply-staging-abandoned-cart-migrations.mjs", import.meta.url);
const subject = await import(target.href).catch(() => ({}));

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth0101",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth0101",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@database.internal/celebix_saas_staging_auth0101",
});

test("abandoned-cart staging migration exposes an explicit staging-only boundary", () => {
  assert.equal(typeof subject.resolveAbandonedCartMigrationConfiguration, "function");
  assert.equal(typeof subject.runAbandonedCartMigrations, "function");
});

test("abandoned-cart staging migration rejects non-staging and mismatched database configuration", () => {
  const resolve = subject.resolveAbandonedCartMigrationConfiguration;
  assert.equal(typeof resolve, "function");
  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_SAAS_AUTH_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "production_auth0101" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production" },
    { ...approved, CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@database.internal/other_staging" },
  ]) assert.throws(() => resolve(source), /abandoned_cart_staging_/);

  assert.deepEqual(resolve(approved), {
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

function approvedAuthority() {
  return {
    database_matches: true,
    postgres_matches: true,
    tier_matches: true,
    writable_primary: true,
    writable_transaction: true,
    owner_member: true,
  };
}

test("abandoned-cart staging migration installs only wholly absent layers and verifies every layer", async () => {
  const calls = [];
  const lines = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: null, rows: [] };
    },
  };

  await subject.runAbandonedCartMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  assert.deepEqual(
    calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql),
    [
      "-- 202607220030_abandoned_carts.up.sql",
      "-- 202607220030_abandoned_carts_assertions.sql",
      "-- 202607220031_abandoned_cart_api.up.sql",
      "-- 202607220031_abandoned_cart_api_assertions.sql",
      "-- 202607220032_abandoned_cart_capture.up.sql",
      "-- 202607220032_abandoned_cart_capture_assertions.sql",
      "-- 202608120101_durable_abandoned_cart_integration.up.sql",
      "-- 202608120101_durable_abandoned_cart_integration_assertions.sql",
      "-- 202608120102_durable_abandoned_cart_rollout_backfill.up.sql",
      "-- 202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql",
    ],
  );
  assert.deepEqual(lines, [
    "abandoned_cart_migration_cart_tables=applied",
    "abandoned_cart_migration_api=applied",
    "abandoned_cart_migration_capture=applied",
    "abandoned_cart_migration_durable_projection=applied",
    "abandoned_cart_migration_backfill=applied",
  ]);
  assert.equal(calls.at(-1), "end");
});

test("abandoned-cart staging migration is idempotent while retaining assertion and reconciliation proof", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: true, ready: true }] };
      return { rowCount: null, rows: [] };
    },
  };

  await subject.runAbandonedCartMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: () => undefined,
  });

  const sql = calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql);
  assert.deepEqual(sql, [
    "-- 202607220030_abandoned_carts_assertions.sql",
    "-- 202607220031_abandoned_cart_api_assertions.sql",
    "-- 202607220032_abandoned_cart_capture_assertions.sql",
    "-- 202608120101_durable_abandoned_cart_integration_assertions.sql",
    "-- 202608120102_durable_abandoned_cart_rollout_backfill.up.sql",
    "-- 202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql",
  ]);
  assert.equal(calls.at(-1), "end");
});

test("abandoned-cart staging migration fails closed before mutation on a partial layer", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql) {
      calls.push(String(sql));
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
    },
  };

  await assert.rejects(
    subject.runAbandonedCartMigrations({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: () => { throw new Error("must_not_read_sql_for_partial_schema"); },
      write: () => undefined,
    }),
    /abandoned_cart_staging_cart_tables_partial/,
  );
  assert.equal(calls.at(-1), "end");
});

test("abandoned-cart staging migration exposes only bounded, migration-owned SQL failures", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      if (String(sql).includes("202607220031_abandoned_cart_api.up.sql")) {
        throw new Error("ABANDONED_CART_API_PRECONDITION_FAILED");
      }
      return { rowCount: null, rows: [] };
    },
  };

  await assert.rejects(
    subject.runAbandonedCartMigrations({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: (name) => `-- ${name}`,
      write: () => undefined,
    }),
    /abandoned_cart_staging_api_abandoned_cart_api_precondition_failed/,
  );
});
