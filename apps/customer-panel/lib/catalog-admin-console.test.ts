import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }
test("every catalog administration route is backed by a real console and action authority", async () => { for (const [path, marker] of [["app/products/collections/page.tsx", "collection"], ["app/products/brands/page.tsx", "brand"], ["app/products/attributes/page.tsx", "attribute"], ["app/products/extras/page.tsx", "extra"], ["app/products/definitions/page.tsx", "definition"], ["app/products/reviews/page.tsx", "catalog_admin.moderate"], ["app/products/bulk-upload/page.tsx", "catalog_admin.import"]] as const) { const value = await source(path); assert.match(value, new RegExp(marker.replace(".", "\\."))); assert.match(value, /requireServerPanelAccess/); } });
test("catalog consoles use durable APIs and expose no browser tenant authority", async () => { const value = (await Promise.all(["components/catalog-admin/CatalogResourceConsole.tsx", "components/catalog-admin/ProductReviewConsole.tsx", "components/catalog-admin/CatalogBulkImportConsole.tsx"].map(source))).join("\n"); assert.match(value, /catalogAdminApi/); assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/); });

test("catalog resource lists use canonical create, edit, and extra-preview routes", async () => {
  const value = await source("components/catalog-admin/CatalogResourceConsole.tsx");
  assert.match(value, /products\/\$\{route\.segment\}\/new/);
  assert.match(value, /products\/\$\{route\.segment\}\/\$\{encodeURIComponent\(resource\.id\)\}\/edit/);
  assert.match(value, /kind === "extra"/);
  assert.doesNotMatch(value, /searchParams|localStorage|sessionStorage|x-store-id|x-tenant-id/);
});
