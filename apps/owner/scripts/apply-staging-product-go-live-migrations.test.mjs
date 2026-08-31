import assert from "node:assert/strict";
import test from "node:test";

const subject = await import(new URL("./apply-staging-product-go-live-migrations.mjs", import.meta.url).href).catch(() => ({}));

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth0101",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth0101",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:placeholder@database.internal/celebix_saas_staging_auth0101",
});

const approvedAuthority = () => ({
  database_matches: true,
  postgres_matches: true,
  tier_matches: true,
  writable_primary: true,
  writable_transaction: true,
  owner_member: true,
});

test("product go-live migration exposes an explicit staging-only boundary", () => {
  assert.equal(typeof subject.resolveProductGoLiveMigrationConfiguration, "function");
  assert.equal(typeof subject.runProductGoLiveMigrations, "function");
});

test("product go-live migration rejects non-staging and mismatched databases", () => {
  const resolve = subject.resolveProductGoLiveMigrationConfiguration;
  assert.equal(typeof resolve, "function");
  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "production_auth0101" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production" },
    { ...approved, CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:placeholder@database.internal/other_staging" },
  ]) assert.throws(() => resolve(source), /product_go_live_staging_/);
  assert.deepEqual(resolve(approved), {
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

test("product go-live migration applies and verifies 114 through 118 in exact order", async () => {
  const sqlFiles = [];
  const lines = [];
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: null, rows: [] };
    },
  };
  await subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => { sqlFiles.push(name); return `-- ${name}`; },
    write: (line) => lines.push(line),
  });
  assert.deepEqual(sqlFiles, [
    "202608250114_catalog_product_lifecycle_authorization.up.sql",
    "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
    "202608260115_catalog_product_list_projection.up.sql",
    "202608260115_catalog_product_list_projection_assertions.sql",
    "202608260116_catalog_product_global_query.up.sql",
    "202608260116_catalog_product_global_query_assertions.sql",
    "202608300117_catalog_product_bulk_safe_removal.up.sql",
    "202608300117_catalog_product_bulk_safe_removal_assertions.sql",
    "202608300118_catalog_media_retention_restore.up.sql",
    "202608300118_catalog_media_retention_restore_assertions.sql",
  ]);
  assert.deepEqual(lines, [
    "product_go_live_migration_114=applied",
    "product_go_live_migration_115=applied",
    "product_go_live_migration_116=applied",
    "product_go_live_migration_117=applied",
    "product_go_live_migration_118=applied",
  ]);
});

test("product go-live migration is idempotent and still runs every assertion", async () => {
  const sqlFiles = [];
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: true, ready: true }] };
      return { rowCount: null, rows: [] };
    },
  };
  await subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => { sqlFiles.push(name); return `-- ${name}`; },
    write: () => undefined,
  });
  assert.deepEqual(sqlFiles, [
    "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
    "202608260115_catalog_product_list_projection_assertions.sql",
    "202608260116_catalog_product_global_query_assertions.sql",
    "202608300117_catalog_product_bulk_safe_removal_assertions.sql",
    "202608300118_catalog_media_retention_restore_assertions.sql",
  ]);
});

test("product go-live migration fails closed before SQL mutation on partial schema", async () => {
  let ended = false;
  const client = {
    async connect() {},
    async end() { ended = true; },
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
    },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => { throw new Error("must_not_read"); },
    write: () => undefined,
  }), /product_go_live_staging_114_partial/);
  assert.equal(ended, true);
});

test("product go-live migration rejects invalid database authority", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query() { return { rowCount: 1, rows: [{ ...approvedAuthority(), tier_matches: false }] }; },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => "",
    write: () => undefined,
  }), /product_go_live_staging_authority_invalid/);
});
