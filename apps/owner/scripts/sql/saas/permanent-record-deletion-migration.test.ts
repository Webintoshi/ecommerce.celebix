import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = new URL(".", import.meta.url);

function source(kind: "up" | "down" | "assertions"): string {
  const suffix = kind === "assertions" ? "_assertions.sql" : `.${kind}.sql`;
  return readFileSync(new URL(`202609220142_permanent_record_deletion${suffix}`, base), "utf8");
}

function analyticsOutboxFix(kind: "up" | "down" | "assertions"): string {
  const suffix = kind === "assertions" ? "_assertions.sql" : `.${kind}.sql`;
  return readFileSync(
    new URL(`202609220143_permanent_record_deletion_analytics_outbox_fix${suffix}`, base),
    "utf8",
  );
}

function catalogDeletion(kind: "up" | "down" | "assertions"): string {
  const suffix = kind === "assertions" ? "_assertions.sql" : `.${kind}.sql`;
  return readFileSync(
    new URL(`202609220144_permanent_catalog_deletion${suffix}`, base),
    "utf8",
  );
}

function ledgerDefinition(sql: string): string {
  const match = sql.match(/CREATE TABLE saas[.]record_deletion_operations\s*[(]([\s\S]*?)[)][;]\s/iu);
  assert.ok(match, "record_deletion_operations definition must exist");
  return match[1] ?? "";
}

test("142 creates an immutable PII-free deletion ledger", () => {
  const up = source("up");
  const table = ledgerDefinition(up);

  assert.match(up, /BEGIN[;]/u);
  assert.match(up, /SET LOCAL ROLE celebix_saas_owner[;]/u);
  assert.match(up, /SET LOCAL lock_timeout\s*=\s*'5s'[;]/u);
  assert.match(up, /CREATE TABLE saas[.]record_deletion_operations/u);
  assert.match(up, /PRIMARY KEY\s*[(]\s*store_id\s*,\s*operation_id\s*[)]/iu);
  assert.match(table, /resource_kind\s+text\s+NOT NULL\s+CHECK\s*[(]\s*resource_kind\s+IN\s*[(]\s*'order'\s*,\s*'product'\s*,\s*'category'\s*[)]\s*[)]/iu);
  assert.match(table, /outcome\s+text\s+NOT NULL\s+CHECK\s*[(]\s*outcome\s*=\s*'deleted'\s*[)]/iu);
  assert.match(table, /replay_count\s+bigint\s+NOT NULL\s+DEFAULT\s+0\s+CHECK\s*[(]\s*replay_count\s*>=\s*0\s*[)]/iu);
  assert.match(up, /CREATE TRIGGER record_deletion_operations_immutable[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE/iu);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]record_deletion_operations FROM PUBLIC\s*,\s*celebix_saas_app\s*,\s*celebix_saas_workflow/iu);

  for (const forbidden of ["email", "phone", "address", "title", "reason", "total", "payload", "credential"]) {
    assert.doesNotMatch(table, new RegExp(`\\b${forbidden}\\b`, "iu"));
  }
});

test("142 exposes only owner-scoped operation helpers", () => {
  const up = source("up");

  assert.match(up, /CREATE FUNCTION saas[.]record_deletion_operation_lock\s*[(]/u);
  assert.match(up, /pg_advisory_xact_lock/u);
  assert.match(up, /CREATE FUNCTION saas[.]record_deletion_operation_replay\s*[(]/u);
  assert.match(up, /RETURNS TABLE\s*[(]\s*outcome text\s*,\s*audit_id uuid\s*,\s*replay_count bigint\s*[)]/iu);
  assert.match(up, /SECURITY DEFINER\s+SET search_path\s*=\s*pg_catalog\s*,\s*saas/iu);
  assert.match(up, /operation_mismatch/u);
  assert.match(up, /operation_replayed/u);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]record_deletion_operation_lock/iu);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]record_deletion_operation_replay/iu);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*record_deletion_operations[\s\S]*celebix_saas_app/iu);
  assert.doesNotMatch(up, /(?:postgres(?:ql)?:\/\/|DATABASE_URL|PGPASSWORD)/u);
});

test("142 assertions freeze ownership ACL trigger and constraints", () => {
  const assertions = source("assertions");

  assert.match(assertions, /record_deletion_operations_immutable/u);
  assert.match(assertions, /has_table_privilege\s*[(]\s*'celebix_saas_app'\s*,\s*'saas[.]record_deletion_operations'/iu);
  assert.match(assertions, /relowner\s*=\s*[(]\s*SELECT oid FROM pg_catalog[.]pg_roles WHERE rolname='celebix_saas_owner'/iu);
  assert.match(assertions, /pg_get_constraintdef/iu);
  assert.match(assertions, /resource_kind/iu);
  assert.match(assertions, /outcome/iu);
  assert.match(assertions, /replay_count/iu);
});

test("142 rollback refuses to erase committed deletion audit rows", () => {
  const down = source("down");

  assert.match(down, /IF EXISTS\s*[(]\s*SELECT 1 FROM saas[.]record_deletion_operations\s*[)]/iu);
  assert.match(down, /RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ROLLBACK_BLOCKED'/u);
  assert.match(down, /DROP TABLE saas[.]record_deletion_operations/u);
  assert.match(down, /COMMIT[;]/u);
});

test("142 implements owner-admin-only order impact deletion and recovery without provider calls", () => {
  const up = source("up");

  assert.match(up, /'orders[.]delete'/u);
  assert.match(up, /'catalog_admin[.]delete'/u);
  assert.match(up, /membership_role IN \('store_owner','admin'\)/u);
  assert.match(up, /CREATE FUNCTION saas[.]order_deletion_impact\s*[(]/u);
  assert.match(up, /merchant_action_authority_error\([\s\S]*?'orders'[\s\S]*?'orders[.]delete'/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_order\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_order_recover\s*[(]/u);
  assert.match(up, /UPDATE saas[.]order_drafts[\s\S]*converted_order_id\s*=\s*NULL/iu);
  assert.match(up, /UPDATE saas[.]abandoned_carts[\s\S]*recovered_order_id\s*=\s*NULL/iu);
  assert.match(up, /'analytics_events'[\s\S]*FROM saas[.]analytics_delivery_outbox[\s\S]*order_id\s*=\s*p_order_id/iu);
  assert.match(up, /DELETE FROM saas[.]analytics_delivery_outbox\s+WHERE store_id\s*=\s*p_store_id AND order_id\s*=\s*p_order_id/iu);
  assert.match(up, /DELETE FROM saas[.]order_items/iu);
  assert.match(up, /DELETE FROM saas[.]orders/iu);
  assert.match(up, /INSERT INTO saas[.]record_deletion_operations/iu);
  assert.doesNotMatch(up, /(?:paytr|iyzico|provider_(?:cancel|refund|void)|http_post|net[.]http)/iu);
});

test("142 order deletion functions remain table-private and app-executable only by RPC", () => {
  const up = source("up");
  const assertions = source("assertions");

  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]order_deletion_impact/iu);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]delete_order\s*[(]/iu);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]delete_order_recover/iu);
  assert.match(assertions, /has_function_privilege\s*[(]\s*'celebix_saas_app'[\s\S]*?order_deletion_impact/iu);
  assert.match(assertions, /has_function_privilege\s*[(]\s*'celebix_saas_app'[\s\S]*?delete_order/iu);
});

test("143 patches the exact analytics outbox blocker without widening deletion authority", () => {
  const up = analyticsOutboxFix("up");
  const assertions = analyticsOutboxFix("assertions");
  const down = analyticsOutboxFix("down");

  assert.match(up, /BEGIN[;]/u);
  assert.match(up, /SET LOCAL ROLE celebix_saas_owner[;]/u);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]order_deletion_impact\s*[(]/u);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]delete_order\s*[(]/u);
  assert.match(up, /'analytics_events'[\s\S]*FROM saas[.]analytics_delivery_outbox[\s\S]*order_id\s*=\s*p_order_id/iu);
  assert.match(up, /DELETE FROM saas[.]analytics_delivery_outbox\s+WHERE store_id\s*=\s*p_store_id AND order_id\s*=\s*p_order_id[;][\s\S]*DELETE FROM saas[.]orders/iu);
  assert.match(up, /merchant_action_authority_error\([\s\S]*?'orders'[\s\S]*?'orders[.]delete'/u);
  assert.match(up, /INSERT INTO saas[.]record_deletion_operations/iu);
  assert.doesNotMatch(up, /(?:paytr|iyzico|provider_(?:cancel|refund|void)|http_post|net[.]http)/iu);
  assert.match(assertions, /analytics_delivery_outbox/iu);
  assert.match(assertions, /has_function_privilege/iu);
  assert.match(down, /PERMANENT_RECORD_DELETION_ANALYTICS_OUTBOX_FIX_ROLLBACK_BLOCKED/u);
});

test("144 adds owner-admin-only product and category deletion through the immutable ledger", () => {
  const up = catalogDeletion("up");
  assert.match(up, /CREATE FUNCTION saas[.]catalog_product_deletion_impact\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_product\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_product_recover\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]catalog_category_deletion_impact\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_category\s*[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]delete_category_recover\s*[(]/u);
  assert.match(up, /'catalog_admin[.]delete'/u);
  assert.match(up, /INSERT INTO saas[.]record_deletion_operations/u);
  assert.match(up, /'product'\s*,\s*p_product_id/iu);
  assert.match(up, /'category'\s*,\s*p_category_id/iu);
  assert.match(up, /UPDATE saas[.]order_items[\s\S]*product_id=NULL[\s\S]*variant_id=NULL/iu);
  assert.match(up, /FOR descendant_id IN[\s\S]*ORDER BY category[.]depth,category[.]position,category[.]id[\s\S]*UPDATE saas[.]catalog_categories AS category[\s\S]*parent_id=CASE WHEN category[.]parent_id=p_category_id THEN selected[.]parent_id/iu);
  assert.match(up, /CREATE TABLE saas[.]product_deletion_preparations/iu);
  assert.match(up, /celebix[.]catalog_delete_media/iu);
  assert.match(up, /OLD[.]status='pending' AND NEW[.]status='active'[\s\S]*NEW[.]cleanup_state='active'/iu);
  assert.match(up, /DELETE FROM saas[.]pricing_variant_policy_versions/iu);
  assert.match(up, /DELETE FROM saas[.]barcode_print_job_items/iu);
  assert.equal(up.indexOf("FOR dependency IN") < up.indexOf("UPDATE saas.order_items SET product_id=NULL"), true);
  assert.match(up, /CREATE FUNCTION saas[.]catalog_detach_category_reference/iu);
  assert.match(up, /UPDATE saas[.]storefront_designs/iu);
  assert.match(up, /UPDATE saas[.]merchant_admin_records/iu);
  assert.doesNotMatch(up, /paytr|iyzico|provider_call|refund|void_payment/iu);
});

test("144 grants only reviewed RPCs and supplies guarded rollback artifacts", () => {
  const up = catalogDeletion("up");
  const down = catalogDeletion("down");
  const assertions = catalogDeletion("assertions");
  for (const name of [
    "catalog_product_deletion_impact", "delete_product", "delete_product_recover",
    "catalog_category_deletion_impact", "delete_category", "delete_category_recover",
  ]) {
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas[.]${name}`));
    assert.match(assertions, new RegExp(name));
  }
  assert.match(down, /resource_kind IN\s*[(]\s*'product'\s*,\s*'category'/iu);
  assert.match(down, /DROP FUNCTION saas[.]delete_product/u);
  assert.match(down, /DROP FUNCTION saas[.]delete_category/u);
});
