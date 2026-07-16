import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const repository = readFileSync(path.join(ROOT, "packages/saas-data/src/catalog/repository.ts"), "utf8");
const types = readFileSync(path.join(ROOT, "packages/saas-data/src/catalog/types.ts"), "utf8");
const migration = readFileSync(path.join(ROOT, "apps/owner/scripts/sql/saas/202607160018_product_catalog.up.sql"), "utf8");

test("catalog mutation contracts expose no store tenant principal membership plan or limit payload fields", () => {
  for (const interfaceName of ["CatalogProductFields", "CatalogVariantFields"]) {
    const match = types.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match);
    assert.doesNotMatch(match[1], /storeId|store_id|tenantId|principalId|membershipId|planId|productsLimit/);
  }
});

test("repository authority comes only from TenantContext and SQL remains parameterized", () => {
  assert.match(repository, /authority\.storeId/);
  assert.match(repository, /catalogAuthority\(exact\.tenantContext/);
  assert.doesNotMatch(repository, /process\.env|Host|Forwarded|X-Forwarded/);
  assert.doesNotMatch(repository, /\$\{authority\.(?:storeId|principalId|membershipId)\}/);
});

test("migration is additive shared-SaaS only with RLS and no direct app mutation", () => {
  assert.match(migration, /CREATE TABLE saas\.products/);
  assert.match(migration, /CREATE TABLE saas\.product_variants/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON saas\.products FROM celebix_saas_app/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL).*saas\.(?:products|product_variants)/i);
  assert.doesNotMatch(migration, /public\.(?:products|product_variants)/i);
});

test("quota serialization replay and read-only recovery are explicit", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /saas\.catalog\.store:/);
  assert.match(migration, /CREATE TABLE saas\.catalog_operations/);
  assert.match(migration, /CREATE TRIGGER catalog_operations_immutable/);
  const recovery = migration.match(/CREATE FUNCTION saas\.catalog_recover_operation[\s\S]*?\n\$function\$;/)?.[0];
  assert.ok(recovery);
  assert.doesNotMatch(recovery, /\b(?:INSERT|UPDATE|DELETE)\b/);
});
