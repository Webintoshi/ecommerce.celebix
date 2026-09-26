import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const up = readFileSync(new URL("./202609260160_category_images_and_order.up.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("./202609260160_category_images_and_order.down.sql", import.meta.url), "utf8");
const assertions = readFileSync(new URL("./202609260160_category_images_and_order_assertions.sql", import.meta.url), "utf8");

function body(name: string, delimiter = "$function$") {
  const start = up.indexOf(`CREATE FUNCTION saas.${name}(`);
  assert.ok(start >= 0);
  const end = up.indexOf(`\n${delimiter};`, up.indexOf(`AS ${delimiter}`, start));
  assert.ok(end > start);
  return up.slice(start, end);
}

test("category images belong to category records and reuse store-scoped asset authority", () => {
  assert.match(up, /FOREIGN KEY\(store_id,image_asset_id\) REFERENCES saas\.storefront_assets\(store_id,id\)/);
  for (const name of ["catalog_create_category", "catalog_update_category"]) {
    const source = body(name);
    assert.match(source, /asset\.store_id=p_store_id[\s\S]*asset\.asset_kind='category' AND asset\.status='active' FOR SHARE/);
    assert.ok(source.indexOf("pg_advisory_xact_lock") < source.indexOf("INTO prior_operation"));
    assert.match(source, /prior_operation\.operation_kind<>/);
    assert.match(source, /IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive'/);
  }
  assert.match(body("catalog_update_category"), /CASE WHEN p_fields \? 'image' THEN requested_asset ELSE current_category\.image_asset_id END/);
  assert.match(body("catalog_category_projection"), /asset\.store_id=category\.store_id[\s\S]*asset\.asset_kind='category' AND asset\.status='active'/);
  assert.match(body("storefront_asset_archive", "$f$"), /category\.store_id=p_store_id AND category\.image_asset_id=p_asset_id/);
  assert.doesNotMatch(up, /UPDATE saas\.(?:storefront_designs|merchant_admin_records|campaign_starter_publications)/);
});

test("sibling ordering validates all groups before its first category update", () => {
  const source = body("catalog_reorder_categories");
  const firstWrite = source.indexOf("UPDATE saas.catalog_categories AS category SET position");
  assert.ok(firstWrite > source.indexOf("'order_membership_changed'"));
  assert.ok(firstWrite > source.indexOf("'version_conflict'"));
  assert.match(source, /category\.parent_id IS NOT DISTINCT FROM requested_parent AND category\.status='active'/);
  assert.match(source, /version=category\.version\+1/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /previous\.store_id<>p_store_id OR previous\.fingerprint<>p_fingerprint/);
  assert.match(up, /ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /REVOKE ALL ON saas\.catalog_category_order_operations FROM PUBLIC,celebix_saas_app/);
  assert.match(assertions, /CATEGORY_IMAGES_AND_ORDER_ASSERTION_FAILED/);
});

test("rollback protects category image and saved order data and restores old authorities", () => {
  assert.match(down, /CATEGORY_IMAGE_AND_ORDER_DATA_MUST_BE_PRESERVED/);
  assert.match(down, /EXISTS\(SELECT 1 FROM saas\.catalog_categories WHERE image_asset_id IS NOT NULL\)/);
  assert.match(down, /EXISTS\(SELECT 1 FROM saas\.catalog_category_order_operations\)/);
  for (const name of ["catalog_create_category", "catalog_update_category", "catalog_category_projection", "storefront_asset_archive"]) {
    assert.match(down, new RegExp(`ALTER FUNCTION saas[.]${name}_without_images`));
  }
  assert.doesNotMatch(down, /CASCADE/);
});


test("order ledger has a dedicated guard independent of migration-144 deletion fields", () => {
  const guard = body("guard_catalog_category_order_operation_mutation");
  assert.match(guard, /RAISE EXCEPTION 'CATALOG_CATEGORY_ORDER_OPERATION_IMMUTABLE'/);
  assert.doesNotMatch(guard, /OLD[.]|NEW[.]|current_setting|RETURN OLD/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]guard_catalog_category_order_operation_mutation\(\)\s+FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver/);
  assert.match(up, /FOR EACH ROW EXECUTE FUNCTION saas[.]guard_catalog_category_order_operation_mutation\(\)/);
  assert.doesNotMatch(up, /EXECUTE FUNCTION saas[.]guard_catalog_onboarding_operation_mutation/);
  assert.match(assertions, /tgfoid=guard_function AND tgenabled='O' AND tgtype=27/);
  assert.ok(down.indexOf("DROP FUNCTION saas.guard_catalog_category_order_operation_mutation()") > down.indexOf("DROP TABLE saas.catalog_category_order_operations"));
});
