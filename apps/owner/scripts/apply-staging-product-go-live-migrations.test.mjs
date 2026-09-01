import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const target = new URL("./apply-staging-product-go-live-migrations.mjs", import.meta.url);
const subject = await import(target.href).catch(() => ({}));

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth0101",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth0101",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:placeholder@database.internal/celebix_saas_staging_auth0101",
  CELEBIX_STAGING_BACKUP_ID: "staging_backup_auth0101_20260830",
  CELEBIX_STAGING_BACKUP_SHA256: "1ccd474eed88f8ed202fc202b3ee190fd655a7b1dc3a5313ccbf408ef7b13251",
  CELEBIX_STAGING_BACKUP_VERIFIED_AT: new Date(Date.now() - 60_000).toISOString(),
  CELEBIX_STAGING_BACKUP_RESTORE_STATUS: "restore_verified",
  CELEBIX_STAGING_BACKUP_DATABASE_NAME: "celebix_saas_staging_auth0101",
  CELEBIX_STAGING_BACKUP_ACTIVATION_ID: "staging_auth0101",
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

test("product go-live probes resolve optional procedures before checking privileges", async () => {
  const source = await readFile(target, "utf8");
  assert.match(source, /has_function_privilege\('celebix_saas_app',pg_catalog\.to_regprocedure\('/);
  assert.doesNotMatch(source, /has_function_privilege\('celebix_saas_app','saas\./);
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
    { ...approved, CELEBIX_STAGING_BACKUP_RESTORE_STATUS: "unverified" },
    { ...approved, CELEBIX_STAGING_BACKUP_SHA256: "not-a-digest" },
    { ...approved, CELEBIX_STAGING_BACKUP_VERIFIED_AT: "2020-01-01T00:00:00.000Z" },
    { ...approved, CELEBIX_STAGING_BACKUP_DATABASE_NAME: "other_staging" },
    { ...approved, CELEBIX_STAGING_BACKUP_ACTIVATION_ID: "staging_other" },
  ]) assert.throws(() => resolve(source), /product_go_live_staging_/);
  assert.deepEqual(resolve(approved), {
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

test("product go-live migration applies and verifies 114 through 119 in exact order", async () => {
  const sqlFiles = [];
  const lines = [];
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
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
    "202609010119_catalog_media_reorder_lifecycle_guard.up.sql",
    "202609010119_catalog_media_reorder_lifecycle_guard_assertions.sql",
  ]);
  assert.deepEqual(lines, [
    "product_go_live_migration_114=applied",
    "product_go_live_migration_115=applied",
    "product_go_live_migration_116=applied",
    "product_go_live_migration_117=applied",
    "product_go_live_migration_118=applied",
    "product_go_live_migration_119=applied",
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
      if (statement.includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
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
    "202609010119_catalog_media_reorder_lifecycle_guard_assertions.sql",
  ]);
});

test("product go-live migration fails closed before SQL mutation on partial schema", async () => {
  let ended = false;
  const client = {
    async connect() {},
    async end() { ended = true; },
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (String(sql).includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
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

test("product go-live migration probes every layer before rejecting a later partial schema", async () => {
  let sqlRead = false;
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
      if (statement.includes("AS has_objects")) return statement.includes("catalog_bulk_mutate_products")
        ? { rowCount: 1, rows: [{ has_objects: true, ready: false }] }
        : { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: 1, rows: [] };
    },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => { sqlRead = true; return ""; },
    write: () => undefined,
  }), /product_go_live_staging_117_partial/);
  assert.equal(sqlRead, false);
});

test("product go-live migration rejects non-prefix schema state before mutation", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
      if (statement.includes("AS has_objects")) return statement.includes("catalog_list_products_v2")
        ? { rowCount: 1, rows: [{ has_objects: true, ready: true }] }
        : { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: 1, rows: [] };
    },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => { throw new Error("must_not_read"); },
    write: () => undefined,
  }), /product_go_live_staging_115_out_of_order/);
});

test("product go-live migration refuses concurrent invocation before probing", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      return { rowCount: 1, rows: [{ acquired: false }] };
    },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => { throw new Error("must_not_read"); },
    write: () => undefined,
  }), /product_go_live_staging_migration_locked/);
});

test("product go-live migration never reflects arbitrary database errors", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS acquired")) return { rowCount: 1, rows: [{ acquired: true }] };
      if (statement.includes("AS has_objects")) throw new Error("SERVER_PASSWORD secret-material");
      return { rowCount: 1, rows: [] };
    },
  };
  await assert.rejects(subject.runProductGoLiveMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: () => "",
    write: () => undefined,
  }), (error) => error instanceof Error && error.message === "product_go_live_staging_114_probe_failed");
});
