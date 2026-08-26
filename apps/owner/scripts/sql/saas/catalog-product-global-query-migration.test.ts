import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608260116_catalog_product_global_query.up.sql",
  down: "202608260116_catalog_product_global_query.down.sql",
  assertions: "202608260116_catalog_product_global_query_assertions.sql",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("116 adds a tenant-bound v3 list query without replacing v1 or v2", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas[.]catalog_product_search_key[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]catalog_product_title_sort_key[(]/u);
  assert.match(up, /CREATE FUNCTION saas[.]catalog_list_products_v3[(]/u);
  assert.doesNotMatch(up, /CREATE(?: OR REPLACE)? FUNCTION saas[.]catalog_list_products(?:_v2)?[(]/u);
  assert.doesNotMatch(up, /(?:REVOKE|GRANT)[^\n]*saas[.]catalog_list_products(?:_v2)?[(]/u);
  assert.match(up, /saas[.]catalog_authority_error[(]/u);
  assert.match(up, /product[.]store_id = p_store_id/u);
  assert.match(up, /variant[.]store_id = p_store_id/u);
  assert.match(up, /variant[.]sku/u);
  assert.match(up, /variant[.]barcode/u);
  assert.match(up, /catalog_product_categories/u);
  assert.match(up, /catalog_admin_resource_products/u);
  assert.match(up, /resource[.]resource_kind = 'brand'/u);
  assert.match(up, /resource[.]resource_kind = 'collection'/u);
  assert.match(up, /pg_catalog[.]normalize/u);
  assert.match(up, /pg_catalog[.]translate/u);
  assert.match(up, /LANGUAGE plpgsql/u);
  assert.match(up, /'I',\s*'ı'/u);
  assert.match(up, /'İ',\s*'i'/u);
  const nfcPosition = up.indexOf("pg_catalog.normalize(p_value, 'NFC')");
  const dotlessPosition = up.indexOf("'I', 'ı'", nfcPosition);
  const dottedPosition = up.indexOf("'İ'", dotlessPosition);
  assert.equal(nfcPosition >= 0 && nfcPosition < dotlessPosition && dotlessPosition < dottedPosition, true);
  assert.match(up, /É/u);
  assert.match(up, /multi_source CONSTANT text\[\]/u);
  assert.match(up, /product[.]title AS cursor_title/u);
  assert.match(up, /THEN cursor_row[.]cursor_title ELSE NULL END/u);
  assert.match(up, /page AS MATERIALIZED/u);
  assert.match(up, /LEFT JOIN LATERAL/u);
  assert.match(up, /'catalogTotal'/u);
  assert.match(up, /'cursorAnchor'/u);
});

test("116 exposes only v3 to the app role and rollback removes only v3", () => {
  const up = source("up");
  const down = source("down");
  const assertions = source("assertions");
  for (const file of Object.values(files)) assert.equal(existsSync(new URL(file, root)), true, `${file} missing`);
  for (const sql of [up, down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
    assert.doesNotMatch(sql, /TRUNCATE|DELETE\s+FROM/iu);
  }
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]catalog_list_products_v3[^\n]* FROM PUBLIC/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]catalog_list_products_v3[^\n]* TO celebix_saas_app/u);
  assert.match(down, /REVOKE ALL ON FUNCTION saas[.]catalog_list_products_v3[^\n]* FROM celebix_saas_app/u);
  assert.match(down, /DROP FUNCTION saas[.]catalog_list_products_v3/u);
  assert.match(down, /DROP FUNCTION saas[.]catalog_product_title_sort_key/u);
  assert.match(down, /DROP FUNCTION saas[.]catalog_product_search_key/u);
  assert.doesNotMatch(down, /catalog_list_products(?:_v2)?[(]/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V1_COMPATIBILITY_INVALID/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V2_COMPATIBILITY_INVALID/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V3_AUTHORITY_INVALID/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V3_DEFINITION_INVALID/u);
});

test("the exact 8/8 PostgreSQL rehearsal is registered as a required cumulative harness", () => {
  const suite = readFileSync(new URL("../../../../../tests/saas-phase3/run-current-suite.mjs", import.meta.url), "utf8");
  assert.match(suite, /tests\/saas-phase3\/catalog-product-global-query\/postgres-harness[.]mjs/u);
  assert.match(suite, /PASS 8\\\/8 catalog product global query PostgreSQL 16 rehearsal complete/u);
});
