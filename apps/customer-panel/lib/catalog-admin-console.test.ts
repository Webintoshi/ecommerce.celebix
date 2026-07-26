import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }
test("every catalog administration route is backed by a real console and action authority", async () => { for (const [path, marker] of [["app/products/collections/page.tsx", "collection"], ["app/products/brands/page.tsx", "brand"], ["app/products/attributes/page.tsx", "attribute"], ["app/products/extras/page.tsx", "extra"], ["app/products/definitions/page.tsx", "definition"], ["app/products/reviews/page.tsx", "catalog_admin.moderate"], ["app/products/bulk-upload/page.tsx", "catalog_admin.import"]] as const) { const value = await source(path); assert.match(value, new RegExp(marker.replace(".", "\\."))); assert.match(value, /requireServerPanelAccess/); } });
test("catalog consoles use durable APIs and expose no browser tenant authority", async () => { const value = (await Promise.all(["components/catalog-admin/CatalogResourceConsole.tsx", "components/catalog-admin/ProductReviewConsole.tsx", "components/catalog-admin/CatalogBulkImportConsole.tsx"].map(source))).join("\n"); assert.match(value, /catalogAdminApi/); assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/); });
test("bulk import console exposes the complete four-step file and feed workflow", async () => {
  const component = await source("components/catalog-admin/CatalogBulkImportConsole.tsx");
  const providers = await source("lib/catalog-import/providers.ts");
  const css = await source("components/catalog-admin/catalog-admin-console.module.css");
  for (const marker of ["Platform seçimi", "Kaynak seçimi", "Önizleme", "Aktarım", "Dosyadan yükle", "Feed adresi", "Şablonu indir"]) assert.match(component, new RegExp(marker));
  for (const marker of ["WooCommerce", "Shopify", "IdeaSoft", "Ticimax", "T-Soft", "ikas", "OpenCart", "PrestaShop", "Magento", "BigCommerce", "Wix", "Genel CSV"]) assert.match(providers, new RegExp(marker));
  assert.match(component, /parseCatalogImportSource/);
  assert.match(component, /previewFeed/);
  assert.match(component, /importProducts/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /<form key="file"/);
  assert.match(component, /<form key="feed"/);
  assert.match(component, /previewRequestRef/);
  assert.match(component, /previewRequestRef\.current !== requestId/);
  assert.match(component, /disabled=\{busy !== "idle"\}/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*700px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /overflow-x:\s*auto/);
});
