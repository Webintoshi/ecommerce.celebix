import assert from "node:assert/strict";
import test from "node:test";

const target = new URL("./apply-staging-catalog-onboarding-migration.mjs", import.meta.url);
const subject = await import(target.href).catch(() => ({}));

const approved = Object.freeze({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_SAAS_AUTH_MODE: "approved_staging",
  CELEBIX_STAGING_ACTIVATION_ID: "staging_auth0101",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth0101",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:placeholder@database.internal/celebix_saas_staging_auth0101",
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

test("catalog onboarding staging migration exposes a staging-only product service repair boundary", () => {
  assert.equal(typeof subject.resolveCatalogOnboardingMigrationConfiguration, "function");
  assert.equal(typeof subject.runCatalogOnboardingMigration, "function");
});

test("catalog onboarding staging migration rejects production, unapproved mode, and database mismatch", () => {
  const resolve = subject.resolveCatalogOnboardingMigrationConfiguration;
  assert.equal(typeof resolve, "function");

  for (const source of [
    { ...approved, CELEBIX_DEPLOYMENT_TIER: "production" },
    { ...approved, CELEBIX_SAAS_AUTH_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { ...approved, CELEBIX_STAGING_ACTIVATION_ID: "production_auth0101" },
    { ...approved, CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production" },
    { ...approved, CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgres://owner:placeholder@database.internal/other_staging" },
  ]) assert.throws(() => resolve(source), /catalog_onboarding_staging_/);

  assert.deepEqual(resolve(approved), {
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    databaseUrl: approved.CELEBIX_TOSHI_MIGRATION_DATABASE_URL,
  });
});

test("catalog onboarding staging migration applies migration 056 once and verifies all assertions", async () => {
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

  await subject.runCatalogOnboardingMigration({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: (line) => lines.push(line),
  });

  assert.deepEqual(
    calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql),
    [
      "-- 202607280056_catalog_product_onboarding.up.sql",
      "-- 202607280056_catalog_product_onboarding_assertions.sql",
    ],
  );
  assert.deepEqual(lines, ["catalog_onboarding_migration_056=applied"]);
  assert.equal(calls.at(-1), "end");
});

test("catalog onboarding staging migration is idempotent and still verifies assertions", async () => {
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

  await subject.runCatalogOnboardingMigration({
    client,
    databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
    readSql: (name) => `-- ${name}`,
    write: () => undefined,
  });

  const sql = calls.filter((entry) => typeof entry === "object" && entry.sql.startsWith("-- ")).map((entry) => entry.sql);
  assert.deepEqual(sql, ["-- 202607280056_catalog_product_onboarding_assertions.sql"]);
  assert.equal(calls.at(-1), "end");
});

test("catalog onboarding staging migration fails closed on partial product-service schema", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      return { rowCount: 1, rows: [{ has_objects: true, ready: false }] };
    },
  };

  await assert.rejects(
    subject.runCatalogOnboardingMigration({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: () => { throw new Error("must_not_read_sql_for_partial_catalog_schema"); },
      write: () => undefined,
    }),
    /catalog_onboarding_staging_056_partial/,
  );
});

test("catalog onboarding staging migration exposes only bounded migration-owned SQL failures", async () => {
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      if (String(sql).includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (String(sql).includes("AS has_objects")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      if (String(sql).includes("202607280056_catalog_product_onboarding.up.sql")) {
        throw new Error("CATALOG_PRODUCT_ONBOARDING_PRECONDITION_FAILED");
      }
      return { rowCount: null, rows: [] };
    },
  };

  await assert.rejects(
    subject.runCatalogOnboardingMigration({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: (name) => `-- ${name}`,
      write: () => undefined,
    }),
    /catalog_onboarding_staging_056_catalog_product_onboarding_precondition_failed/,
  );
});

test("catalog onboarding staging migration can probe a wholly absent schema before applying migration 056", async () => {
  let probeCount = 0;
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      const statement = String(sql);
      if (statement.includes("AS owner_member")) return { rowCount: 1, rows: [approvedAuthority()] };
      if (statement.includes("AS has_objects")) {
        probeCount += 1;
        assert.doesNotMatch(
          statement,
          /'saas\.catalog_onboarding_operations'::pg_catalog\.regclass/u,
          "initial absent-schema probe must not cast a missing relation name to regclass",
        );
        return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      }
      if (statement.includes("202607280056_catalog_product_onboarding.up.sql")) {
        throw new Error("CATALOG_PRODUCT_ONBOARDING_STOP_AFTER_SAFE_PROBE");
      }
      return { rowCount: null, rows: [] };
    },
  };

  await assert.rejects(
    subject.runCatalogOnboardingMigration({
      client,
      databaseName: approved.CELEBIX_SAAS_DATABASE_NAME,
      readSql: (name) => `-- ${name}`,
      write: () => undefined,
    }),
    /catalog_onboarding_staging_056_catalog_product_onboarding_stop_after_safe_probe/,
  );
  assert.equal(probeCount, 1);
});
