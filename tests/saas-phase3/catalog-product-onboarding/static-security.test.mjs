import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFileSync(path.join(SQL, file), "utf8");
const up = read("202607280056_catalog_product_onboarding.up.sql");
const down = read("202607280056_catalog_product_onboarding.down.sql");
const assertions = read("202607280056_catalog_product_onboarding_assertions.sql");
const manifest = JSON.parse(read("phase3-product-onboarding-manifest.json"));

const TABLES = Object.freeze([
  "catalog_product_profiles",
  "catalog_categories",
  "catalog_product_categories",
  "catalog_variant_commerce_profiles",
  "catalog_product_channels",
  "catalog_onboarding_operations",
]);

test("056 creates six closed store-composite onboarding relations", () => {
  for (const table of TABLES) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`), table);
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`), table);
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`), table);
    assert.match(up, new RegExp(`REVOKE ALL ON saas[.]${table} FROM PUBLIC,celebix_saas_app`), table);
    assert.match(assertions, new RegExp(table), table);
  }
  assert.doesNotMatch(up, /CREATE POLICY/);
  assert.doesNotMatch(up, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON/);
});

test("every product variant category resource and channel reference is store-bound", () => {
  for (const witness of [
    "FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id)",
    "FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id)",
    "FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.product_variants(store_id,product_id,id)",
    "FOREIGN KEY(store_id,category_id) REFERENCES saas.catalog_categories(store_id,id)",
  ]) assert.ok(up.includes(witness), witness);
  assert.match(up, /catalog_product_channels_authority_check/);
  assert.match(up, /channel_kind IN\('storefront','marketplace'\)/);
});

test("schema constraints preserve closed merchandising and category authority", () => {
  assert.match(up, /product_type IN\('physical','digital'\)/);
  assert.match(up, /maximum_purchase_quantity>=minimum_purchase_quantity/);
  assert.match(up, /measured_unit IN\('piece','g','kg','ml','l','cm','m','m2','m3'\)/);
  assert.match(up, /continue_selling_when_out_of_stock/);
  assert.match(up, /CATALOG_CATEGORY_CYCLE/);
  assert.match(up, /CATALOG_CATEGORY_DEPTH_EXCEEDED/);
  assert.match(up, /depth BETWEEN 1 AND 8/);
  assert.match(up, /status IN\('active','archived'\)/);
});

test("operation proof is immutable exact and replay bounded", () => {
  assert.match(up, /operation_kind IN\('quick_create','advanced_create','update_merchandising','publish_after_media','create_category','update_category','archive_category'\)/);
  assert.match(up, /payload_fingerprint~'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(up, /CATALOG_ONBOARDING_OPERATION_IMMUTABLE/);
  assert.match(up, /CREATE TRIGGER catalog_onboarding_operations_immutable/);
  assert.match(assertions, /catalog_onboarding_operations_immutable/);
});

test("down migration is disposable guarded and removes only 056 objects", () => {
  assert.match(down, /CATALOG_PRODUCT_ONBOARDING_ROLLBACK_BLOCKED/);
  for (const table of [...TABLES].reverse()) {
    assert.match(down, new RegExp(`DROP TABLE saas[.]${table}`), table);
  }
  assert.doesNotMatch(down, /DROP TABLE saas[.](?:products|product_variants|product_media|inventory_locations|inventory_balances|catalog_admin_resources|store_domains)/);
});

test("manifest pins exact SHA-256 values for the three migration artifacts", () => {
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.migrationClassification, "additive");
  assert.equal(manifest.artifacts.length, 3);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256, artifact.file);
  }
});
