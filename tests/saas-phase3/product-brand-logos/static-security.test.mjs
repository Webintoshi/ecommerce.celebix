import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("product brand logo manifest pins every migration artifact", () => {
  const manifest = JSON.parse(read("apps/owner/scripts/sql/saas/phase4f-product-brand-logos-manifest.json"));
  assert.equal(manifest.postgresqlMajor, 16);
  for (const artifact of [...manifest.artifacts, ...manifest.rollbackArtifacts]) {
    assert.equal(createHash("sha256").update(read(`apps/owner/scripts/sql/saas/${artifact.file}`)).digest("hex"), artifact.sha256, artifact.file);
  }
});

test("logo projection is exact tenant-scoped and fail closed", () => {
  const sql = read("apps/owner/scripts/sql/saas/202608030082_product_brand_logos.up.sql");
  assert.match(sql, /asset[.]store_id=p_store_id/);
  assert.match(sql, /asset[.]asset_kind='logo'/);
  assert.match(sql, /asset[.]status='active'/);
  assert.match(sql, /p_config->>'logoAssetId'~'\^\[0-9a-f\]/);
  assert.match(sql, /jsonb_strip_nulls[\s\S]+?'logo',saas[.]public_product_brand_logo/);
  assert.doesNotMatch(sql, /object_key|logoAssetId'\s*,\s*asset[.]id/);
});

test("raw logo helper is not a public authority surface", () => {
  const sql = read("apps/owner/scripts/sql/saas/202608030082_product_brand_logos.up.sql");
  assert.match(sql, /REVOKE ALL ON FUNCTION saas[.]public_product_brand_logo\(uuid,jsonb\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION saas[.]public_product_brand_logo/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE)[^;]+(?:storefront_assets|catalog_admin_resources)/is);
});
