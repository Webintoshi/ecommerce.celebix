import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607160019_product_catalog_api.up.sql";
const DOWN = "202607160019_product_catalog_api.down.sql";
const ASSERTIONS = "202607160019_product_catalog_api_assertions.sql";
const MANIFEST = "phase3a2-product-api-manifest.json";
const read = (name) => readFileSync(path.join(SQL, name), "utf8");
const sha = (name) => createHash("sha256").update(read(name)).digest("hex");

test("migration 019 adds only one tenant-scoped catalog detail read function", () => {
  const migration = read(UP);
  const functions = migration.match(/CREATE FUNCTION saas\.[a-z0-9_]+/g) ?? [];
  assert.deepEqual(functions, ["CREATE FUNCTION saas.catalog_get_product_details"]);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, saas/);
  assert.match(migration, /product\.store_id = p_store_id/);
  assert.match(migration, /product\.status <> 'archived'/);
  assert.match(migration, /variant\.product_id = p_product_id/);
  assert.match(migration, /variant\.store_id = p_store_id/);
  assert.match(migration, /p_include_archived_variants OR variant\.status = 'active'/);
  assert.match(migration, /ORDER BY variant\.created_at ASC, variant\.id ASC/);
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/);
});

test("migration 019 grants only reviewed execution and no direct catalog table read", () => {
  const migration = read(UP);
  assert.match(migration, /REVOKE ALL ON FUNCTION saas\.catalog_get_product_details[\s\S]*FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION saas\.catalog_get_product_details[\s\S]*TO celebix_saas_app/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|ALL).*saas\.(?:products|product_variants)/i);
  assert.match(read(DOWN), /DROP FUNCTION saas\.catalog_get_product_details/);
});

test("migration 019 assertions and additive manifest bind exact artifact bytes", () => {
  const assertions = read(ASSERTIONS);
  assert.match(assertions, /prosecdef/);
  assert.match(assertions, /proconfig IS NOT DISTINCT FROM ARRAY\['search_path=pg_catalog, saas'\]/);
  assert.match(assertions, /has_function_privilege\('public'/);
  assert.match(assertions, /has_function_privilege\('celebix_saas_app'/);
  const manifest = JSON.parse(read(MANIFEST));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.migrationClassification, "additive");
  assert.equal(manifest.environmentAuthorization, "STAGING_AFTER_LOCAL_GATE_NO_PRODUCTION_APPLY");
  assert.deepEqual(manifest.artifacts.map(({ file, sha256 }) => [file, sha256]), [
    [UP, sha(UP)],
    [DOWN, sha(DOWN)],
    [ASSERTIONS, sha(ASSERTIONS)],
  ]);
});
