import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCategoryShowcaseMigrationConfiguration,
  runCategoryShowcaseMigrations,
} from "./apply-staging-category-showcase-migrations.mjs";

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth01",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth01",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:secret@database.internal/celebix_saas_staging_auth01",
});

test("category showcase staging migration rejects production, wrong activation, and database mismatch", () => {
  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "production_other" },
    { ...approved, CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { ...approved, CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "production" },
  ]) assert.throws(() => resolveCategoryShowcaseMigrationConfiguration(source), /category_showcase_staging_/);

  assert.deepEqual(resolveCategoryShowcaseMigrationConfiguration(approved), {
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

test("category showcase staging migration applies 097, 098, and 099 in order with assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values) {
      calls.push({ sql, values });
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
    },
  };
  const lines = [];

  await runCategoryShowcaseMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  assert.deepEqual(
    calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql),
    [
      "-- 202608090097_responsive_category_showcase_layout.up.sql",
      "-- 202608090097_responsive_category_showcase_layout_assertions.sql",
      "-- 202608090098_empty_homepage_sections.up.sql",
      "-- 202608090098_empty_homepage_sections_assertions.sql",
      "-- 202608100099_single_authority_category_showcase.up.sql",
      "-- 202608100099_single_authority_category_showcase_assertions.sql",
    ],
  );
  assert.deepEqual(lines, [
    "category_showcase_migration_responsive_layout=applied",
    "category_showcase_migration_empty_homepage=applied",
    "category_showcase_migration_single_authority=applied",
  ]);
  assert.equal(calls.at(-1), "end");
});

test("category showcase staging migration is idempotent and still runs assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql, values) {
      calls.push({ sql, values });
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: true }] };
    },
  };

  await runCategoryShowcaseMigrations({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: () => undefined,
  });

  const sql = calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql);
  assert.equal(sql.some((entry) => entry.endsWith(".up.sql")), false);
  assert.equal(sql.length, 3);
  assert.equal(sql.every((entry) => entry.endsWith("_assertions.sql")), true);
  assert.equal(calls.at(-1), "end");
});

test("category showcase staging migration fails closed on partial schema", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
    },
  };

  await assert.rejects(
    runCategoryShowcaseMigrations({ client, databaseName: approved.CELEBIX_SAAS_DATABASE_NAME, readSql: () => "", write: () => undefined }),
    /category_showcase_staging_responsive_layout_partial/,
  );
  assert.equal(calls.at(-1), "end");
});

test("category showcase staging migration exposes only a bounded migration-owned failure code", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      if (String(sql).startsWith("SELECT")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      if (String(sql).includes("202608090098_empty_homepage_sections.up.sql")) {
        throw new Error("EMPTY_HOMEPAGE_SECTIONS_PRECONDITION_FAILED");
      }
      return { rowCount: null, rows: [] };
    },
  };

  await assert.rejects(
    runCategoryShowcaseMigrations({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: (name) => `-- ${name}`,
      write: () => undefined,
    }),
    /category_showcase_staging_empty_homepage_empty_homepage_sections_precondition_failed/,
  );
});
