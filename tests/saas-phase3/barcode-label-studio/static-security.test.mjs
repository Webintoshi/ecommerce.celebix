import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("migration 123 is additive store-bound and exposes no public table grants", async () => {
  const up = await read(
    "apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.up.sql",
  );
  assert.match(up, /CREATE TABLE saas\.barcode_label_templates/);
  assert.match(up, /CREATE TABLE saas\.barcode_print_jobs/);
  assert.match(up, /CREATE TABLE saas\.barcode_print_job_items/);
  assert.match(up, /CREATE TABLE saas\.barcode_label_operations/);
  assert.match(
    up,
    /CREATE UNIQUE INDEX product_variants_store_internal_barcode_key/,
  );
  assert.match(up, /FORCE ROW LEVEL SECURITY/g);
  assert.match(up, /REVOKE ALL ON .* FROM PUBLIC/);
  assert.doesNotMatch(up, /GRANT .*TABLE .* TO PUBLIC/);
});

test("projection is global server-side and one statement without a 500 cap", async () => {
  const up = await read(
    "apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.up.sql",
  );
  assert.match(up, /CREATE FUNCTION saas\.barcode_label_list/);
  assert.match(up, /p_page_size integer/);
  assert.match(up, /p_query text/);
  assert.match(up, /variant\.sku/);
  assert.match(up, /variant\.barcode/);
  assert.match(up, /LIMIT p_page_size \+ 1/);
  const listBody = up.match(/CREATE FUNCTION saas\.barcode_label_list[\s\S]+?END \$f\$;/)?.[0] ?? "";
  assert.doesNotMatch(listBody, /barcode_label_variant_projection/);
  assert.match(listBody, /category_projection/);
  assert.match(listBody, /brand_projection/);
  assert.doesNotMatch(up, /LIMIT 500/);
});

test("down migration fails closed while merchant history exists", async () => {
  const down = await read(
    "apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.down.sql",
  );
  assert.match(down, /barcode_label_studio_down_blocked_data_exists/);
  assert.match(down, /IF EXISTS/);
});

test("phase 5J manifest pins every migration 123 artifact", async () => {
  const manifest = JSON.parse(
    await read("apps/owner/scripts/sql/saas/phase5j-barcode-label-studio-manifest.json"),
  );
  assert.equal(manifest.phase, "phase5j-barcode-label-studio");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.equal(manifest.artifacts.length, 3);
  for (const artifact of manifest.artifacts) {
    const source = await read(`apps/owner/scripts/sql/saas/${artifact.file}`);
    assert.equal(createHash("sha256").update(source).digest("hex"), artifact.sha256);
  }
});
