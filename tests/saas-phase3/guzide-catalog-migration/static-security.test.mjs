import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3-guzide-catalog-migration-manifest.json"), "utf8"));

test("Güzide catalog migration artifacts are exact and contain no customer export or secret", () => {
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  for (const artifact of manifest.artifacts) {
    const source = readFileSync(path.join(SQL, artifact.file));
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256, artifact.file);
    assert.doesNotMatch(source.toString("utf8"), /(?:access[_-]?key|secret[_-]?key|account[_-]?id|r2\.dev|guzidekuyumcu\.com\.tr\/wp-content)/i);
  }
});

test("migration ledger is forced-RLS and the app has function-only authority", () => {
  const up = readFileSync(path.join(SQL, "202607280059_catalog_product_migrations.up.sql"), "utf8");
  for (const table of [
    "catalog_product_migration_jobs",
    "catalog_product_migration_items",
    "catalog_product_migration_media_items",
    "catalog_product_migration_operations",
  ]) {
    assert.match(up, new RegExp(`ALTER TABLE saas\\.${table} FORCE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`REVOKE ALL ON saas\\.${table} FROM`));
  }
  assert.doesNotMatch(up, /\bGRANT\b[^;]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^;]*\bcelebix_saas_app\b/i);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_begin/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_import_batch/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_get/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_migration_recover_operation/);
});

test("durable media authority stores only digests and operations are immutable", () => {
  const up = readFileSync(path.join(SQL, "202607280059_catalog_product_migrations.up.sql"), "utf8");
  assert.match(up, /source_url_digest char\(64\) NOT NULL/);
  assert.doesNotMatch(up, /\bsource_url\s+text\b/i);
  assert.match(up, /CREATE TRIGGER catalog_product_migration_operations_immutable/);
  assert.match(up, /CREATE TRIGGER catalog_product_migration_job_identity_immutable/);
  assert.match(up, /pg_advisory_xact_lock[\s\S]*saas\.catalog\.store:/);
  assert.match(up, /merchant_action_authority_error[\s\S]*catalog_admin\.import/);
});
