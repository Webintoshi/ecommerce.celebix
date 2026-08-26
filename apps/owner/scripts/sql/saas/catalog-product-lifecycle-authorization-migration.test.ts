import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608250114_catalog_product_lifecycle_authorization.up.sql",
  down: "202608250114_catalog_product_lifecycle_authorization.down.sql",
  assertions: "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("114 adds variant archive provenance and an idempotent draft restore", () => {
  const up = source("up");
  assert.match(up, /ADD COLUMN archived_by_product boolean NOT NULL DEFAULT false/u);
  assert.match(up, /operation_kind IN \([\s\S]*'restore_product'/u);
  assert.match(up, /CREATE FUNCTION saas[.]catalog_restore_product/u);
  assert.match(up, /existing[.]operation_kind = 'restore_product'/u);
  assert.match(up, /current_product[.]status <> 'archived'/u);
  assert.match(up, /SET status='draft',archived_at=NULL,version=version\+1,updated_at=p_now/u);
  assert.match(up, /status='archived' AND archived_by_product=true/u);
  assert.match(up, /SET status='active',archived_at=NULL,archived_by_product=false,version=version\+1/u);
  assert.doesNotMatch(up, /DELETE\s+FROM/u);
});

test("114 preserves the six base application SQL signatures as action-aware app boundaries", () => {
  const up = source("up");
  for (const name of [
    "catalog_create_product",
    "catalog_update_product",
    "catalog_archive_product",
    "catalog_create_variant",
    "catalog_update_variant",
    "catalog_archive_variant",
    "catalog_restore_product",
  ]) {
    assert.match(up, new RegExp(`CREATE(?: OR REPLACE)? FUNCTION saas[.]${name}\\(`), name);
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas[.]${name}`), `${name} grant`);
  }
  for (const name of [
    "catalog_create_product_implementation_v1",
    "catalog_update_product_implementation_v1",
    "catalog_archive_product_implementation_v1",
    "catalog_create_variant_implementation_v1",
    "catalog_update_variant_implementation_v1",
    "catalog_archive_variant_implementation_v1",
  ]) {
    assert.match(up, new RegExp(`ALTER FUNCTION saas[.][\\s\\S]*RENAME TO ${name}`), `${name} rename`);
    assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION saas[.]${name}`), `${name} private`);
    assert.doesNotMatch(up, new RegExp(`GRANT EXECUTE ON FUNCTION saas[.]${name}[^\\n]*TO celebix_saas_app`), `${name} app grant`);
  }
  assert.match(up, /merchant_action_authority_error\([\s\S]*'catalog'[\s\S]*'catalog_admin[.]manage'/u);
  assert.match(up, /merchant_action_authority_error\([\s\S]*'catalog'[\s\S]*'catalog_admin[.]archive'/u);
  assert.doesNotMatch(up, /catalog_(?:create|update|archive)_(?:product|variant)_authorized/u);
});

test("114 deterministically backfills only same-tenant product-driven legacy archives", () => {
  const up = source("up");
  assert.match(up, /UPDATE saas[.]product_variants AS variant[\s\S]*FROM saas[.]products AS product/u);
  assert.match(up, /product[.]id=variant[.]product_id/u);
  assert.match(up, /product[.]store_id=variant[.]store_id/u);
  assert.match(up, /product[.]status='archived'/u);
  assert.match(up, /variant[.]status='archived'/u);
  assert.match(up, /product[.]archived_at IS NOT NULL/u);
  assert.match(up, /variant[.]archived_at=product[.]archived_at/u);
  assert.match(source("assertions"), /CATALOG_PRODUCT_LEGACY_PROVENANCE_INVALID/u);
});

test("114 archive marks only active variants and preserves unrelated durable data", () => {
  const up = source("up");
  assert.match(up, /SET status='archived',archived_at=p_now,archived_by_product=true,version=version\+1,updated_at=p_now[\s\S]*status='active'/u);
  for (const durable of ["product_media", "orders", "catalog_product_categories", "catalog_product_collections", "r2"]) {
    assert.doesNotMatch(up, new RegExp(`(?:DELETE|TRUNCATE)[\\s\\S]{0,80}${durable}`, "iu"), durable);
  }
});

test("114 panel detail can read archived products without weakening tenant scope", () => {
  const up = source("up");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]catalog_get_product_details/u);
  assert.match(up, /product[.]id=p_product_id AND product[.]store_id=p_store_id/u);
  assert.doesNotMatch(up, /product[.]store_id=p_store_id AND product[.]status<>'archived'/u);
});

test("114 separates product media read from operation-authorized mutations", () => {
  const up = source("up");
  assert.match(up, /media_product_operation_authority_error[\s\S]*merchant_action_authority_error/u);
  assert.match(up, /media_authority_error[\s\S]*'catalog_admin[.]manage'/u);
  assert.match(up, /media_read_authority_error[\s\S]*'catalog_admin[.]read'/u);
  assert.match(up, /media_list_product[\s\S]*media_read_authority_error/u);
  assert.match(source("down"), /DROP FUNCTION saas[.]media_product_operation_authority_error/u);
});

test("114 artifacts are owner-scoped, reversible without data deletion, and ACL asserted", () => {
  for (const file of Object.values(files)) assert.equal(existsSync(new URL(file, root)), true, `${file} missing`);
  for (const sql of [source("up"), source("down"), source("assertions")]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
    assert.doesNotMatch(sql, /TRUNCATE|DELETE\s+FROM/iu);
  }
  assert.match(source("assertions"), /CATALOG_PRODUCT_LIFECYCLE_ACL_INVALID/u);
  assert.match(source("assertions"), /CATALOG_PRODUCT_RESTORE_INVALID/u);
  assert.match(source("assertions"), /CATALOG_PRODUCT_MEDIA_AUTHORITY_INVALID/u);
});

test("114 rollback restores the original operation constraints and refuses to erase restore history", () => {
  const down = source("down");
  assert.match(down, /CATALOG_PRODUCT_LIFECYCLE_ROLLBACK_BLOCKED: restore ledger rows exist/u);
  assert.match(down, /operation_kind='restore_product'/u);
  assert.match(down, /catalog_operations_kind_check CHECK \(operation_kind IN \([\s\S]*'archive_variant'[\s\S]*\)\)/u);
  assert.doesNotMatch(down.match(/ADD CONSTRAINT catalog_operations_kind_check[\s\S]*?ADD CONSTRAINT catalog_operations_result_shape_check/u)?.[0] ?? "", /restore_product/u);
});
