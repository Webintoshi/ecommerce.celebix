import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const up = readFileSync(new URL("202609230149_catalog_variant_batch.up.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("202609230149_catalog_variant_batch.down.sql", import.meta.url), "utf8");
const assertions = readFileSync(new URL("202609230149_catalog_variant_batch_assertions.sql", import.meta.url), "utf8");
const editorProjection = readFileSync(new URL("202607280056_catalog_product_onboarding.up.sql", import.meta.url), "utf8");

test("batch creation is one authorized store-locked operation with a durable replay", () => {
  assert.match(up, /CREATE FUNCTION saas\.catalog_create_variants_batch/u);
  assert.match(up, /catalog_authority_error/u);
  assert.match(up, /merchant_action_authority_error\([\s\S]*'catalog_admin\.manage'/u);
  assert.match(up, /pg_advisory_xact_lock[\s\S]*saas\.catalog\.store:/u);
  assert.match(up, /existing\.operation_kind='create_variant_batch'/u);
  assert.match(up, /INSERT INTO saas\.catalog_operations/u);
  assert.match(up, /result_payload \? 'variants'/u);
  assert.match(up, /variant_combination_conflict/u);
  assert.match(up, /sku_conflict/u);
  assert.match(up, /jsonb_array_length\(p_variants\) NOT BETWEEN 1 AND 100/u);
  assert.match(up, /set_config\('saas\.inventory\.source_marker','catalog_adjustment'/u);
  assert.match(up, /INSERT INTO saas\.catalog_variant_commerce_profiles/u);
  assert.match(up, /INSERT INTO saas\.catalog_admin_resource_products/u);
  assert.match(up, /resource\.resource_kind='attribute' AND resource\.status='active'/u);
  assert.doesNotMatch(up, /(?:DELETE|TRUNCATE)\s+(?:FROM\s+)?saas\./iu);
});

test("rollback refuses to erase batch operation history", () => {
  assert.match(down, /IF EXISTS\(SELECT 1 FROM saas\.catalog_operations WHERE operation_kind='create_variant_batch'\)/u);
  assert.match(assertions, /CATALOG_VARIANT_BATCH_AUTHORITY_MISSING/u);
});

test("batch variants create the commerce rows required by the existing product editor projection", () => {
  assert.match(editorProjection, /JOIN saas\.catalog_variant_commerce_profiles AS commerce[\s\S]*commerce\.variant_id=variant\.id/u);
  assert.match(up, /INSERT INTO saas\.product_variants[\s\S]*INSERT INTO saas\.catalog_variant_commerce_profiles/u);
});
