import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveOrderAddressMigrationConfiguration,
  runOrderAddressMigration,
} from "./apply-staging-order-address-migration.mjs";

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth01",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth01",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@database.internal/celebix_saas_staging_auth01",
});

test("order address staging migration only accepts isolated staging authority", () => {
  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_SAAS_AUTH_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "production_other" },
    { ...approved, CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { ...approved, CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "production" },
  ]) assert.throws(() => resolveOrderAddressMigrationConfiguration(source), /order_address_staging_/u);

  assert.deepEqual(resolveOrderAddressMigrationConfiguration(approved), {
    activationId: approved.CELEBIX_STAGING_ACTIVATION_ID,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

test("order address staging migration applies once and always runs assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (String(sql).includes("AS owner_member")) {
        return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      }
      if (String(sql).includes("AS checkout_ready")) {
        return { rowCount: 1, rows: [{ checkout_ready: false, detail_ready: false, backfill_ready: false }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  const lines = [];

  await runOrderAddressMigration({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  const probeSql = calls.find((entry) => typeof entry === "object" && String(entry.sql).includes("AS checkout_ready"))?.sql;
  assert.match(String(probeSql), /saas[.]orders_detail_projection\(uuid,uuid\)/u);
  assert.match(String(probeSql), /order_row[.]source='storefront'/u);
  assert.doesNotMatch(String(probeSql), /order_source/u);

  assert.deepEqual(
    calls.filter((entry) => typeof entry === "object" && String(entry.sql).startsWith("-- ")).map((entry) => entry.sql),
    [
      "-- 202608160112_storefront_builtin_checkout_order_address.up.sql",
      "-- 202608160112_storefront_builtin_checkout_order_address_assertions.sql",
    ],
  );
  assert.deepEqual(lines, ["order_address_migration=applied"]);
  assert.equal(calls.at(-1), "end");
});

test("order address staging migration is idempotent and still verifies assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (String(sql).includes("AS owner_member")) {
        return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      }
      if (String(sql).includes("AS checkout_ready")) {
        return { rowCount: 1, rows: [{ checkout_ready: true, detail_ready: true, backfill_ready: true }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  const lines = [];

  await runOrderAddressMigration({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  const sqlFiles = calls.filter((entry) => typeof entry === "object" && String(entry.sql).startsWith("-- ")).map((entry) => entry.sql);
  assert.deepEqual(sqlFiles, ["-- 202608160112_storefront_builtin_checkout_order_address_assertions.sql"]);
  assert.deepEqual(lines, ["order_address_migration=already_applied"]);
  assert.equal(calls.at(-1), "end");
});

test("order address staging migration exposes bounded failure codes", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) {
        return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      }
      if (String(sql).includes("AS checkout_ready")) {
        return { rowCount: 1, rows: [{ checkout_ready: false, detail_ready: false, backfill_ready: false }] };
      }
      throw new Error("ORDER_ADDRESS_PROJECTION_AUTHORITY_INVALID");
    },
  };

  await assert.rejects(
    runOrderAddressMigration({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: (name) => `-- ${name}`,
      write: () => undefined,
    }),
    /order_address_staging_apply_order_address_projection_authority_invalid/u,
  );
});
