import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const UP = "202607290065_catalog_featured_image_listing.up.sql";
const DOWN = "202607290065_catalog_featured_image_listing.down.sql";
const ASSERTIONS = "202607290065_catalog_featured_image_listing_assertions.sql";
const MANIFEST = "phase3x-catalog-featured-image-listing-manifest.json";
const read = (file) => readFileSync(path.join(SQL, file), "utf8");
const sha256 = (file) => createHash("sha256").update(read(file)).digest("hex");

test("migration 065 projects one ordered active featured image without table grants", () => {
  const up = read(UP);
  assert.match(up, /CREATE OR REPLACE FUNCTION saas\.catalog_list_products/);
  assert.match(up, /media\.store_id\s*=\s*p_store_id/);
  assert.match(up, /media\.product_id\s*=\s*page\.id/);
  assert.match(up, /media\.status\s*=\s*'active'/);
  assert.match(up, /ORDER BY media\.sort_order,\s*media\.id\s+LIMIT 1/s);
  assert.match(up, /'featuredImages'/);
  assert.match(up, /'publicUrl',\s*media\.public_url,\s*'altText',\s*media\.alt_text/s);
  assert.doesNotMatch(up, /'objectKey'|'storeId'|'variantId'|'byteSize'/);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*product_media/i);
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.catalog_list_products[\s\S]*FROM PUBLIC/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.catalog_list_products[\s\S]*TO celebix_saas_app/);
});

test("migration 065 rollback restores the pre-feature list envelope", () => {
  const down = read(DOWN);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas\.catalog_list_products/);
  assert.match(down, /'items',\s*listed_items/);
  assert.match(down, /'hasMore',\s*listed_count > p_page_size/);
  assert.doesNotMatch(down, /featuredImages|product_media/);
});

test("migration 065 assertions and manifest pin exact immutable artifacts", () => {
  const assertions = read(ASSERTIONS);
  assert.match(assertions, /catalog_list_products/);
  assert.match(assertions, /featuredImages/);
  assert.match(assertions, /has_function_privilege/);
  const manifest = JSON.parse(read(MANIFEST));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.deepEqual(manifest.artifacts.map(({ file }) => file), [UP, DOWN, ASSERTIONS]);
  for (const artifact of manifest.artifacts) assert.equal(artifact.sha256, sha256(artifact.file));
  assert.equal(manifest.productionMutations, 0);
});
