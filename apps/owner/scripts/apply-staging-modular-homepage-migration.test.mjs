import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveModularHomepageMigrationConfiguration,
  runModularHomepageMigration,
} from "./apply-staging-modular-homepage-migration.mjs";

test("configuration accepts only the approved isolated staging database", () => {
  const configuration = resolveModularHomepageMigrationConfiguration({
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_SAAS_AUTH_MODE: "approved_staging",
    CELEBIX_STAGING_MIGRATION_MODE: "approved_staging",
    CELEBIX_STAGING_ACTIVATION_ID: "staging_auth01",
    CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_staging_auth01",
    CELEBIX_TOSHI_MIGRATION_DATABASE_URL: "postgresql://migration.example/celebix_saas_staging_auth01",
  });

  assert.equal(configuration.databaseName, "celebix_saas_staging_auth01");
  assert.equal(configuration.activationId, "staging_auth01");
});

test("migration applies v4 once and always runs assertions", async () => {
  const calls = [];
  const client = {
    async connect() { calls.push("connect"); },
    async end() { calls.push("end"); },
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes("current_database()")) return { rowCount: 1, rows: [{ database_matches: true, postgres_matches: true, tier_matches: true, writable_primary: true, writable_transaction: true, owner_member: true }] };
      if (text.includes("storefront_design_document_with_home_ids")) return { rowCount: 1, rows: [{ has_objects: false, ready: false }] };
      return { rowCount: 0, rows: [] };
    },
  };
  const writes = [];

  await runModularHomepageMigration({
    client,
    databaseName: "celebix_saas_staging_auth01",
    readSql: (name) => `-- ${name}`,
    write: (line) => writes.push(line),
  });

  assert.ok(calls.some((call) => typeof call === "object" && call.text.includes("202608110100_modular_homepage_builder.up.sql")));
  assert.ok(calls.some((call) => typeof call === "object" && call.text.includes("202608110100_modular_homepage_builder_assertions.sql")));
  assert.deepEqual(writes, ["modular_homepage_migration=applied"]);
  assert.equal(calls.at(-1), "end");
});
