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
  assert.ok(calls.some((call) => call === "SQL:202609220146_celebix_net_staging_admin_domain.up.sql"));
  assert.ok(calls.some((call) => call === "SQL:202609220146_celebix_net_staging_admin_domain_assertions.sql"));
  assert.equal(calls.at(-1), "end");
  assert.deepEqual(lines, ["celebix_net_staging_admin_domain=applied"]);
});
