import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }
test("every catalog administration route is backed by a real console and action authority", async () => { for (const [path, marker] of [["app/products/collections/page.tsx", "collection"], ["app/products/brands/page.tsx", "brand"], ["app/products/attributes/page.tsx", "attribute"], ["app/products/extras/page.tsx", "extra"], ["app/products/definitions/page.tsx", "definition"], ["app/products/reviews/page.tsx", "catalog_admin.moderate"], ["app/products/auto-import/page.tsx", "catalog_admin.import"], ["app/products/shopify-converter/page.tsx", "catalog_admin.import"], ["app/products/bulk-upload/page.tsx", "catalog_admin.import"]] as const) { const value = await source(path); assert.match(value, new RegExp(marker.replace(".", "\\."))); assert.match(value, /requireServerPanelAccess/); } });
test("catalog consoles use durable APIs and expose no browser tenant authority", async () => { const value = (await Promise.all(["components/catalog-admin/CatalogResourceConsole.tsx", "components/catalog-admin/ProductReviewConsole.tsx", "components/catalog-admin/CatalogBulkImportConsole.tsx", "components/catalog-admin/CatalogImportPreparationConsole.tsx", "lib/catalog-admin-ui/import-preparation-controller.ts"].map(source))).join("\n"); assert.match(value, /catalogAdminApi/); assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/); });

test("catalog resource lists use canonical create, edit, and extra-preview routes", async () => {
  const value = await source("components/catalog-admin/CatalogResourceConsole.tsx");
  assert.match(value, /products\/\$\{route\.segment\}\/new/);
  assert.match(value, /products\/\$\{route\.segment\}\/\$\{encodeURIComponent\(resource\.id\)\}\/edit/);
  assert.match(value, /kind === "extra"/);
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
  const value = (await Promise.all([
    "components/catalog-admin/CatalogImportPreparationConsole.tsx",
    "app/products/shopify-converter/page.tsx",
  ].map(source))).join("\n");
  assert.match(value, /dosya dönüştürme/i);
  assert.doesNotMatch(value, /Shopify bağlandı|senkronizasyon tamamlandı/i);
  assert.doesNotMatch(value, /fetch\(["'`]https?:|shopify[.]com|apiKey|clientSecret|accessToken|<iframe/i);
});

test("AI remains preference-only until a provider is enabled", async () => {
  const value = await source("app/settings/artificial-intelligence/page.tsx");
  assert.match(value, /Sağlayıcı etkinleştirilmeden içerik üretilmez[.]/);
  assert.doesNotMatch(value, /içerik (?:üretildi|oluşturuldu)|senkronizasyon tamamlandı/i);
});
