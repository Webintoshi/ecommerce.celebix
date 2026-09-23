import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCelebixNetDomainsMigrationConfiguration,
  runCelebixNetDomainsMigration,
} from "./apply-staging-celebix-net-domains-migration.mjs";

const source = {
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
  CELEBIX_PANEL_ORIGIN: "https://panel.saas-staging.celebix.net",
  CELEBIX_PLATFORM_DOMAIN_SUFFIX: "saas-staging.celebix.net",
  CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgresql://staging:example@localhost:5432/celebix_staging",
};

test(".net admin-domain migration cannot target the existing .site or production authority", () => {
  assert.equal(resolveCelebixNetDomainsMigrationConfiguration(source).databaseUrl, source.CELEBIX_TOSHI_MIGRATION_DATABASE_URL);
  for (const change of [
    { CELEBIX_DEPLOYMENT_TIER: "production" },
    { CELEBIX_STAGING_MIGRATION_MODE: "disabled" },
    { CELEBIX_PANEL_ORIGIN: "https://panel.saas-staging.celebix.site" },
    { CELEBIX_PLATFORM_DOMAIN_SUFFIX: "saas-staging.celebix.site" },
  ]) {
    assert.throws(() => resolveCelebixNetDomainsMigrationConfiguration({ ...source, ...change }), /celebix_net_staging_migration_not_approved/);
  }
});

test(".net migration checks authority, applies once, and runs postconditions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes("owner_member")) return { rowCount: 1, rows: [{ owner_member: true, migration_ready: false }] };
      return { rowCount: 0, rows: [] };
    },
    async end() { calls.push("end"); },
  };
  const lines = [];
  await runCelebixNetDomainsMigration({
    client,
    readSql(name) { return `SQL:${name}`; },
    write(line) { lines.push(line); },
  });
  assert.equal(calls[0], "connect");
  assert.match(calls[1], /pg_catalog\.strpos\s*\(/);
  assert.doesNotMatch(calls[1], /pg_catalog\.position\s*\(/);
  assert.match(calls[1], /management, status, canonical/);
  assert.ok(calls.some((call) => call === "SQL:202609230147_celebix_net_staging_admin_domain_management.up.sql"));
  assert.ok(calls.some((call) => call === "SQL:202609230147_celebix_net_staging_admin_domain_management_assertions.sql"));
  assert.equal(calls.at(-1), "end");
  assert.deepEqual(lines, ["celebix_net_staging_admin_domain_management=applied"]);
});

test(".net management migration preserves existing platform hosts and sets platform management explicitly", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("./sql/saas/202609230147_celebix_net_staging_admin_domain_management.up.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE OR REPLACE FUNCTION saas\.provision_canonical_admin_domain/);
  assert.match(sql, /selected_store\.slug \|\| '\.admin\.celebix\.site'/);
  assert.match(sql, /selected_store\.slug \|\| '\.admin\.saas-staging\.celebix\.site'/);
  assert.match(sql, /selected_store\.slug \|\| '\.admin\.saas-staging\.celebix\.net'/);
  assert.match(sql, /kind, management, status, canonical/);
  assert.match(sql, /'platform_subdomain', 'platform', 'active'/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|DROP)\s+saas\.admin_domains\b/i);
});

test(".net management migration skips DDL when already applied but still checks assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async query(sql) {
      calls.push(sql);
      if (sql.includes("owner_member")) return { rowCount: 1, rows: [{ owner_member: true, migration_ready: true }] };
      return { rowCount: 0, rows: [] };
    },
    async end() { calls.push("end"); },
  };
  const lines = [];
  await runCelebixNetDomainsMigration({
    client,
    readSql(name) { return `SQL:${name}`; },
    write(line) { lines.push(line); },
  });
  assert.ok(!calls.some((call) => call.endsWith("management.up.sql")));
  assert.ok(calls.some((call) => call.endsWith("management_assertions.sql")));
  assert.deepEqual(lines, ["celebix_net_staging_admin_domain_management=already_applied"]);
});
