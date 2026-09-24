import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const up = readFileSync(new URL("202609240150_store_sku_prefix.up.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("202609240150_store_sku_prefix.down.sql", import.meta.url), "utf8");
const assertions = readFileSync(new URL("202609240150_store_sku_prefix_assertions.sql", import.meta.url), "utf8");
const originalOnboarding = readFileSync(new URL("202607280056_catalog_product_onboarding.up.sql", import.meta.url), "utf8");

test("SKU prefix is optional, tenant-scoped, and versioned for old panel readers", () => {
  assert.match(up, /merchant_admin_config_valid_without_sku_prefix/u);
  assert.match(up, /p_config-'skuPrefix'/u);
  assert.match(up, /\^\[A-Z0-9\]\{1,20\}\$/u);
  assert.match(up, /catalog_get_onboarding_options_v2/u);
  assert.match(up, /record\.store_id=p_store_id AND record\.record_kind='general_setting' AND record\.status='active'/u);
  assert.match(up, /catalog_get_onboarding_options\(p_store_id/u);
  assert.doesNotMatch(up, /UPDATE saas\.merchant_admin_records/u);
});

test("cross-product SKU guard serializes writes and rollback refuses to discard shared codes", () => {
  assert.match(up, /pg_advisory_xact_lock[\s\S]*saas\.catalog\.sku:/u);
  assert.match(up, /sku_owner_requires_read_committed/u);
  assert.match(up, /other\.product_id<>NEW\.product_id/u);
  assert.match(up, /DROP INDEX saas\.product_variants_store_sku_key/u);
  assert.match(up, /CREATE INDEX product_variants_store_sku_lookup_idx/u);
  assert.match(up, /catalog_create_variants_batch/u);
  assert.match(up, /catalog_create_variant_implementation_v1\(/u);
  assert.match(up, /catalog_update_variant_implementation_v1\(/u);
  assert.match(down, /catalog_create_variant_implementation_v1\(/u);
  assert.match(down, /catalog_update_variant_implementation_v1\(/u);
  assert.match(down, /shared_variant_skus_must_be_resolved_before_downgrade/u);
  assert.match(assertions, /SKU_OWNER_GUARD_MISSING/u);
});

test("quick SKU creation clones the authorized path without changing quick-create audit semantics", () => {
  assert.match(up, /catalog_onboard_product_v2/u);
  assert.match(up, /pg_get_functiondef\(/u);
  assert.match(up, /quick_create audit semantics/u);
  assert.match(up, /ARRAY\[''stockQuantity'',''categoryId'',''sku''\]/u);
  assert.match(up, /p_intent->>''sku''/u);
  assert.match(up, /GET STACKED DIAGNOSTICS sku_violation_constraint = CONSTRAINT_NAME/u);
  assert.match(originalOnboarding, /CASE WHEN intent_kind='quick' THEN 'quick_create' ELSE 'advanced_create' END/u);
  for (const fragment of [
    "ARRAY['stockQuantity','categoryId']",
    "OR pg_catalog.cardinality(p_variant_ids)<>1 THEN",
    "id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at",
    "p_variant_ids[1],p_product_id,p_store_id,'Standart',(p_intent->>'priceCents')::bigint,true,",
  ]) assert.equal(originalOnboarding.split(fragment).length - 1, 1, `migration source anchor: ${fragment}`);
});
