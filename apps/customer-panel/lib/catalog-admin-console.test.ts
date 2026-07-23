import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }
test("every catalog administration route is backed by a real console and action authority", async () => { for (const [path, marker] of [["app/products/collections/page.tsx", "collection"], ["app/products/brands/page.tsx", "brand"], ["app/products/attributes/page.tsx", "attribute"], ["app/products/extras/page.tsx", "extra"], ["app/products/definitions/page.tsx", "definition"], ["app/products/reviews/page.tsx", "catalog_admin.moderate"], ["app/products/auto-import/page.tsx", "catalog_admin.import"], ["app/products/shopify-converter/page.tsx", "catalog_admin.import"], ["app/products/bulk-upload/page.tsx", "catalog_admin.import"]] as const) { const value = await source(path); assert.match(value, new RegExp(marker.replace(".", "\\."))); assert.match(value, /requireServerPanelAccess/); } });
test("catalog consoles use durable APIs and expose no browser tenant authority", async () => { const value = (await Promise.all(["components/catalog-admin/CatalogResourceConsole.tsx", "components/catalog-admin/ProductReviewConsole.tsx", "components/catalog-admin/CatalogBulkImportConsole.tsx", "components/catalog-admin/CatalogImportPreparationConsole.tsx"].map(source))).join("\n"); assert.match(value, /catalogAdminApi/); assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/); });

test("catalog resource lists use canonical create, edit, and extra-preview routes", async () => {
  const value = await source("components/catalog-admin/CatalogResourceConsole.tsx");
  assert.match(value, /products\/\$\{route\.segment\}\/new/);
  assert.match(value, /products\/\$\{route\.segment\}\/\$\{encodeURIComponent\(resource\.id\)\}\/edit/);
  assert.match(value, /kind === "extra"/);
  assert.doesNotMatch(value, /searchParams|localStorage|sessionStorage|x-store-id|x-tenant-id/);
});

test("catalog import preparation keeps prepare, persisted preview, and versioned commit as separate actions", async () => {
  const value = await source("components/catalog-admin/CatalogImportPreparationConsole.tsx");
  const prepare = value.indexOf("catalogAdminApi.prepareImportPreview");
  const persisted = value.indexOf("catalogAdminApi.getImportPreview", prepare);
  const commit = value.indexOf("catalogAdminApi.commitImportPreview");
  assert.ok(prepare >= 0 && persisted > prepare && commit > persisted);
  assert.match(value, /await file[.]text\(\)/);
  assert.match(value, /content\s*=\s*["']["']/);
  assert.match(value, /commitImportPreview\(preview[.]id,\s*preview[.]version,\s*controller[.]signal\)/);
  assert.match(value, /preview[.]rows[.]map/);
  assert.doesNotMatch(value, /set(?:Raw|Content)|dangerouslySetInnerHTML/);
});

test("catalog import controls are abortable, race-safe, double-submit-safe, and focus their outcomes", async () => {
  const value = await source("components/catalog-admin/CatalogImportPreparationConsole.tsx");
  assert.match(value, /new AbortController\(\)/);
  assert.match(value, /controller[.]abort\(\)/);
  assert.match(value, /requestSequence[.]current/);
  assert.match(value, /mounted[.]current/);
  assert.match(value, /busyRef[.]current/);
  assert.match(value, /role="status"[^>]*aria-live="polite"/);
  assert.match(value, /role="alert"/);
  assert.match(value, /errorRef[.]current[?][.]focus\(\)/);
  assert.match(value, /previewHeadingRef[.]current[?][.]focus\(\)/);
});

test("confirmation is enabled only for an unexpired prepared preview", async () => {
  const value = await source("components/catalog-admin/CatalogImportPreparationConsole.tsx");
  const match = value.match(/export function canCommitCatalogImportPreview[\s\S]*?\n\}/);
  assert.ok(match);
  const compiled = ts.transpileModule(match[0].replace("export function", "function"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const canCommit = Function(`${compiled}\nreturn canCommitCatalogImportPreview;`)() as (
    preview: { status: string; expiresAt: string } | undefined,
    now: number,
  ) => boolean;
  const now = Date.parse("2026-07-23T10:00:00.000Z");
  assert.equal(canCommit({ status: "prepared", expiresAt: "2026-07-23T10:00:01.000Z" }, now), true);
  assert.equal(canCommit({ status: "prepared", expiresAt: "2026-07-23T10:00:00.000Z" }, now), false);
  assert.equal(canCommit({ status: "expired", expiresAt: "2026-07-23T10:00:01.000Z" }, now), false);
  assert.equal(canCommit({ status: "consumed", expiresAt: "2026-07-23T10:00:01.000Z" }, now), false);
  assert.equal(canCommit(undefined, now), false);
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
