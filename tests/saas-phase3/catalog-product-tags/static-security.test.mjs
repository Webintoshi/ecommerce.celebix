import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

test("migration 042 alone extends the finite catalog resource authority", () => {
  const up = read("apps/owner/scripts/sql/saas/202607220042_catalog_product_tags.up.sql");
  const down = read("apps/owner/scripts/sql/saas/202607220042_catalog_product_tags.down.sql");
  const assertions = read("apps/owner/scripts/sql/saas/202607220042_catalog_product_tags_assertions.sql");
  const combined = `${up}\n${down}\n${assertions}`;
  assert.match(up, /ARRAY\['collection','brand','attribute','extra','definition','tag'\]::text\[\]/);
  assert.match(down, /CATALOG_PRODUCT_TAGS_ROLLBACK_BLOCKED/);
  assert.match(assertions, /relforcerowsecurity/);
  assert.match(assertions, /catalog_admin_operations_immutable/);
  assert.doesNotMatch(combined, /ALTER TABLE saas[.](?:products|product_variants)|CREATE TABLE|GRANT (?:INSERT|UPDATE|DELETE)/);
  assert.doesNotMatch(combined, /apps\/admin|provider|credential|production/i);
});

test("barcode studio uses server projection and isolated output authority", () => {
  const component = read("apps/customer-panel/components/catalog-admin/BarcodeLabelStudio.tsx");
  const page = read("apps/customer-panel/app/products/barcode-labels/page.tsx");
  const handler = read("apps/customer-panel/lib/barcode-label-http/handler.ts");
  const migration = read("apps/owner/scripts/sql/saas/202609020123_barcode_label_studio.up.sql");
  assert.match(component, /\/api\/catalog\/barcode-labels/);
  assert.match(component, /buildLabelDocument/);
  assert.match(page, /CATALOG_PAGE_ACTIONS[.]barcodeLabels/);
  assert.doesNotMatch(page, /ProductDetailsResult|getProductDetails|projectBarcodeLabelProducts/);
  assert.match(handler, /approvedPanelMutationOriginForStore/);
  assert.match(handler, /isMerchantActionAllowed/);
  assert.match(handler, /catalog_admin[.]manage/);
  assert.match(migration, /CREATE FUNCTION saas[.]barcode_label_list/);
  assert.match(migration, /CREATE FUNCTION saas[.]barcode_label_generate_internal/);
  assert.doesNotMatch(component, /body \* \{\s*visibility: hidden|window[.]print/);
  assert.doesNotMatch(`${component}\n${page}`, /x-store-id|x-tenant-id|localStorage|sessionStorage/);
});

test("cumulative manifest has thirty current checksums", () => {
  const manifest = JSON.parse(
    readFileSync(
      path.join(SQL, "phase3h-merchant-completion-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.artifacts.length, 33);
  for (const artifact of manifest.artifacts) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(SQL, artifact.file)))
        .digest("hex"),
      artifact.sha256,
      artifact.file,
    );
  }
});
