import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const target = new URL("./apply-staging-homepage-product-order-migration.mjs", import.meta.url);
const source = await readFile(target, "utf8");
const {
  resolveHomepageProductOrderMigrationConfiguration,
  runHomepageProductOrderMigration,
} = await import(target.href);

const env = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_homepage_product_order01",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@db.internal:5432/saas_staging",
  CELEBIX_SAAS_DATABASE_NAME: "saas_staging",
});

test("homepage product order migration is guarded to approved isolated staging", () => {
  assert.equal(resolveHomepageProductOrderMigrationConfiguration(env).databaseName, "saas_staging");
  for (const override of [
    { CELEBIX_DEPLOYMENT_TIER: "production" },
    { CELEBIX_SAAS_AUTH_MODE: "disabled" },
    { CELEBIX_STAGING_MIGRATION_MODE: "manual" },
    { CELEBIX_STAGING_ACTIVATION_ID: "prod" },
    { CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@db.internal:5432/prod" },
  ]) {
    assert.throws(() => resolveHomepageProductOrderMigrationConfiguration({ ...env, ...override }), /homepage_product_order_staging_/u);
  }
});

test("homepage product order migration applies 114 once and verifies assertions", async () => {
  const lines = [];
  const statements = [];
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      statements.push(String(sql));
      if (String(sql).includes("current_database()")) {
        return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      }
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
      return { rowCount: 0, rows: [] };
    },
  };
  await runHomepageProductOrderMigration({
    client,
    databaseName: "saas_staging",
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });
  assert.ok(statements.some((statement) => statement.includes("-- 202608220114_homepage_sold_out_product_order.up.sql")));
  assert.ok(statements.some((statement) => statement.includes("-- 202608220114_homepage_sold_out_product_order_assertions.sql")));
  assert.deepEqual(lines, ["homepage_product_order_migration=applied"]);
});

test("homepage product order migration is idempotent after proof is already present", async () => {
  const statements = [];
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      statements.push(String(sql));
      if (String(sql).includes("current_database()")) {
        return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      }
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: true, ready: true }] };
      return { rowCount: 0, rows: [] };
    },
  };
  const lines = [];
  await runHomepageProductOrderMigration({
    client,
    databaseName: "saas_staging",
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });
  assert.deepEqual(lines, ["homepage_product_order_migration=already_applied"]);
  assert.ok(!statements.some((statement) => statement.includes("202608220114_homepage_sold_out_product_order.up.sql")));
});

test("homepage product order migration script keeps exact ordering proof and no direct secrets", () => {
  assert.match(source, /pg_catalog[.]jsonb_array_elements\(items\) WITH ORDINALITY/u);
  assert.match(source, /homepage_product_order_staging_base_missing/u);
  assert.doesNotMatch(source, /DATABASE_URL\s*=|password\s*=/iu);
});
