import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608260115_catalog_product_list_projection.up.sql",
  down: "202608260115_catalog_product_list_projection.down.sql",
  assertions: "202608260115_catalog_product_list_projection_assertions.sql",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("115 creates an additive tenant-bound v2 list projection without changing v1", () => {
  const up = source("up");
  assert.match(up, /CREATE FUNCTION saas[.]catalog_list_products_v2[(]/u);
  assert.doesNotMatch(up, /CREATE(?: OR REPLACE)? FUNCTION saas[.]catalog_list_products[(]/u);
  assert.doesNotMatch(up, /(?:REVOKE|GRANT)[^\n]*saas[.]catalog_list_products[(]/u);
  assert.match(up, /page AS MATERIALIZED/u);
  assert.match(up, /LEFT JOIN LATERAL/u);
  assert.match(up, /variant[.]product_id = page[.]id/u);
  assert.match(up, /variant[.]store_id = p_store_id/u);
  assert.match(up, /CASE WHEN variant[.]status = 'active' THEN 0 ELSE 1 END/u);
  assert.match(up, /variant[.]created_at ASC, variant[.]id ASC/u);
  assert.match(up, /'variantSummaries'/u);
});

test("115 exposes only v2 to the app role and rollback removes only v2", () => {
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
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]catalog_list_products_v2[^\n]* FROM PUBLIC/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]catalog_list_products_v2[^\n]* TO celebix_saas_app/u);
  assert.match(down, /REVOKE ALL ON FUNCTION saas[.]catalog_list_products_v2[^\n]* FROM celebix_saas_app/u);
  assert.match(down, /DROP FUNCTION saas[.]catalog_list_products_v2/u);
  assert.doesNotMatch(down, /catalog_list_products[(]/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V1_COMPATIBILITY_INVALID/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V2_AUTHORITY_INVALID/u);
  assert.match(assertions, /CATALOG_PRODUCT_LIST_V2_DEFINITION_INVALID/u);
});
