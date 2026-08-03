import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }
test("tag and barcode consoles are fixed read-only catalog surfaces", async () => {
  const [resource, labels, tagPage, barcodePage] = await Promise.all([
    source("components/catalog-admin/CatalogResourceConsole.tsx"),
    source("components/catalog-admin/BarcodeLabelConsole.tsx"),
    source("app/products/tags/page.tsx"),
    source("app/products/barcode-labels/page.tsx"),
  ]);
  assert.match(resource, /tag:\s*\{\s*title:\s*"Etiketler"/);
  assert.match(labels, /parseBarcodeLabelRows/);
  assert.match(labels, /parseBarcodeLabelRows\(products\)/);
  assert.match(labels, /type="search"/);
  assert.match(labels, /window[.]print[(][)]/);
  assert.match(labels, /body \* \{\s*visibility: hidden/);
  assert.match(labels, /[.]barcode-print-sheet,\s*[.]barcode-print-sheet \* \{\s*visibility: visible/);
  assert.match(labels, /aria-label=/);
  assert.doesNotMatch(labels, /randomUUID|Math[.]random|JsBarcode|fetch[(]|catalogApi[.](?:create|update|archive)/);
  assert.match(tagPage, /requireServerPanelAccess[(][)]/);
  assert.match(tagPage, /kind="tag"/);
  assert.match(tagPage, /CATALOG_PAGE_ACTIONS[.]tags/);
  assert.match(barcodePage, /requireServerPanelAccess[(][)]/);
  assert.match(barcodePage, /CATALOG_PAGE_ACTIONS[.]barcodeLabels/);
  assert.match(barcodePage, /tenantContext/);
  assert.match(barcodePage, /projectBarcodeLabelProducts/);
  assert.match(barcodePage, /<BarcodeLabelConsole products=\{Object[.]freeze\(products\)\}/);
  assert.doesNotMatch(barcodePage, /ProductDetailsResult/);
  assert.doesNotMatch(labels, /storeId|description|priceCents|costCents|stockQuantity|attributes|createdAt|updatedAt|version/);
  for (const page of [tagPage, barcodePage]) assert.doesNotMatch(page, /searchParams|x-store-id|x-tenant-id|localStorage|sessionStorage/);
});
test("every catalog administration route is backed by a real console and action authority", async () => { for (const [path, marker] of [["app/products/collections/page.tsx", "collection"], ["app/products/brands/page.tsx", "brand"], ["app/products/attributes/page.tsx", "attribute"], ["app/products/extras/page.tsx", "extra"], ["app/products/definitions/page.tsx", "definition"], ["app/products/reviews/page.tsx", "catalog_admin.moderate"], ["app/products/auto-import/page.tsx", "catalog_admin.import"], ["app/products/shopify-converter/page.tsx", "catalog_admin.import"], ["app/products/bulk-upload/page.tsx", "catalog_admin.import"]] as const) { const value = await source(path); assert.match(value, new RegExp(marker.replace(".", "\\."))); assert.match(value, /requireServerPanelAccess/); } });
test("catalog consoles use durable APIs and expose no browser tenant authority", async () => { const value = (await Promise.all(["components/catalog-admin/CatalogResourceConsole.tsx", "components/catalog-admin/ProductReviewConsole.tsx", "components/catalog-admin/CatalogBulkImportConsole.tsx", "components/catalog-admin/CatalogImportPreparationConsole.tsx", "lib/catalog-admin-ui/import-preparation-controller.ts"].map(source))).join("\n"); assert.match(value, /catalogAdminApi/); assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/); });
test("bulk import console exposes the complete four-step file and feed workflow", async () => {
  const component = await source("components/catalog-admin/CatalogBulkImportConsole.tsx");
  const providers = await source("lib/catalog-import/providers.ts");
  const css = await source("components/catalog-admin/catalog-admin-console.module.css");
  for (const marker of ["Platform seçimi", "Kaynak seçimi", "Önizleme", "Aktarım", "Dosyadan yükle", "Feed adresi", "Şablonu indir"]) assert.match(component, new RegExp(marker));
  for (const marker of ["WooCommerce", "Shopify", "IdeaSoft", "Ticimax", "T-Soft", "ikas", "OpenCart", "PrestaShop", "Magento", "BigCommerce", "Wix", "Genel CSV"]) assert.match(providers, new RegExp(marker));
  assert.match(component, /parseCatalogImportSource/);
  assert.match(component, /previewFeed/);
  assert.match(component, /importProducts/);
  assert.match(component, /compileWooCommerceMigration/);
  assert.match(component, /runWooCommerceMigration/);
  assert.match(component, /migrationManifestRef/);
  assert.match(component, /iki eşzamanlı işçiyle/);
  assert.match(component, /role="status" aria-live="polite"/);
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
  assert.match(css, /\.migrationProgress/);
});

test("WooCommerce migration routes are mounted only through the authenticated server handler", async () => {
  const routes = await Promise.all([
    "app/api/catalog/admin/migrations/woocommerce/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/batch/route.ts",
    "app/api/catalog/admin/migrations/woocommerce/[jobId]/media/route.ts",
  ].map(source));
  assert.match(routes[0], /handleWooCommerceMigrationBegin/);
  assert.match(routes[1], /handleWooCommerceMigrationStatus/);
  assert.match(routes[2], /handleWooCommerceMigrationBatch/);
  assert.match(routes[3], /handleWooCommerceMigrationMedia/);
  for (const route of routes) assert.doesNotMatch(route, /process[.]env|postgres|pg|storeId|tenantId|x-store|x-tenant/);
});

test("catalog resource lists use canonical create, edit, and extra-preview routes", async () => {
  const value = await source("components/catalog-admin/CatalogResourceConsole.tsx");
  assert.match(value, /products\/\$\{route\.segment\}\/new/);
  assert.match(value, /products\/\$\{route\.segment\}\/\$\{encodeURIComponent\(resource\.id\)\}\/edit/);
  assert.match(value, /kind === "extra"/);
  assert.match(value, /brandLogoFor/);
  assert.match(value, /className=\{styles\.brandLogoThumbnail\}/);
  assert.match(value, /Logo arşivi şu anda yüklenemedi/);
  assert.doesNotMatch(value, /Promise[.]all\(\[\s*catalogAdminApi[.]resources\(kind\)/);
  assert.doesNotMatch(value, /searchParams|localStorage|sessionStorage|x-store-id|x-tenant-id/);
});

test("catalog import component binds file selection and explicit confirmation to the behavioral controller", async () => {
  const value = await source("components/catalog-admin/CatalogImportPreparationConsole.tsx");
  assert.match(value, /createCatalogImportPreparationController/);
  assert.match(value, /controller[?][.]prepare\(file\)/);
  assert.match(value, /controllerRef[.]current[?][.]commit\(\)/);
  assert.match(value, /controllerRef[.]current[?][.]resetSelection\(\)/);
  assert.match(value, /preview[.]rows[.]map/);
  assert.doesNotMatch(value, /set(?:Raw|Content)|dangerouslySetInnerHTML/);
});

test("catalog import controls are abortable, race-safe, double-submit-safe, and focus their outcomes", async () => {
  const value = (await Promise.all(["components/catalog-admin/CatalogImportPreparationConsole.tsx", "lib/catalog-admin-ui/import-preparation-controller.ts"].map(source))).join("\n");
  assert.match(value, /new AbortController\(\)/);
  assert.match(value, /commitLocked/);
  assert.match(value, /role="status"[^>]*aria-live="polite"/);
  assert.match(value, /role="alert"/);
  assert.match(value, /errorRef[.]current[?][.]focus\(\)/);
  assert.match(value, /previewHeadingRef[.]current[?][.]focus\(\)/);
});

test("Shopify import is explicitly local file conversion and never claims a provider connection", async () => {
  const value = (await Promise.all(["components/catalog-admin/CatalogImportPreparationConsole.tsx", "app/products/shopify-converter/page.tsx"].map(source))).join("\n");
  assert.match(value, /dosya dönüştürme/i);
  assert.doesNotMatch(value, /Shopify bağlandı|senkronizasyon tamamlandı/i);
  assert.doesNotMatch(value, /fetch\(["'`]https?:|shopify[.]com|apiKey|clientSecret|accessToken|<iframe/i);
});

test("AI exposes provider setup without claiming content generation", async () => {
  const value = (await Promise.all([
    "app/settings/artificial-intelligence/page.tsx",
    "components/toshi-settings/ArtificialIntelligenceSettings.tsx",
  ].map(source))).join("\n");
  assert.match(value, /ArtificialIntelligenceSettings/);
  assert.match(value, /OpenAI/);
  assert.match(value, /Google Gemini/);
  assert.match(value, /Anthropic Claude/);
  assert.doesNotMatch(value, /içerik (?:üretildi|oluşturuldu)|senkronizasyon tamamlandı/i);
});
