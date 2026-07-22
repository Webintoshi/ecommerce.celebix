import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("binds catalog route segments to fixed resource kinds", async () => {
  const route = await import("./resource-route.ts");

  assert.equal(route.getCatalogResourceRouteDefinition("collections").kind, "collection");
  assert.equal(route.getCatalogResourceRouteDefinition("brands").kind, "brand");
  assert.equal(route.getCatalogResourceRouteDefinition("attributes").kind, "attribute");
  assert.equal(route.getCatalogResourceRouteDefinition("extras").kind, "extra");
  assert.equal(route.getCatalogResourceRouteDefinition("definitions").kind, "definition");
  assert.throws(() => route.getCatalogResourceRouteDefinition("../brands"), /catalog_resource_route_invalid/);
  assert.throws(() => route.getCatalogResourceRouteDefinition("collection"), /catalog_resource_route_invalid/);
});

test("selects an editor resource only when its opaque ID and fixed kind match the scoped API list", async () => {
  const route = await import("./resource-route.ts");
  const collection = Object.freeze({ id: "collection-id", kind: "collection" });
  const brandWithTheSameId = Object.freeze({ id: "collection-id", kind: "brand" });
  const otherStoreOpaqueId = Object.freeze({ id: "other-store-id", kind: "collection" });

  assert.equal(route.selectCatalogResourceForEdit([collection, brandWithTheSameId], "collection", "collection-id"), collection);
  assert.equal(route.selectCatalogResourceForEdit([brandWithTheSameId, otherStoreOpaqueId], "collection", "collection-id"), undefined);
  assert.equal(route.selectCatalogResourceForEdit([collection], "collection", "other-store-id"), undefined);
});

test("every catalog kind has fixed create and edit pages, with a preview only for extras", async () => {
  for (const segment of ["collections", "brands", "attributes", "extras", "definitions"]) {
    await access(new URL(`app/products/${segment}/new/page.tsx`, root));
    await access(new URL(`app/products/${segment}/[resourceId]/edit/page.tsx`, root));
    const create = await source(`app/products/${segment}/new/page.tsx`);
    const edit = await source(`app/products/${segment}/[resourceId]/edit/page.tsx`);
    assert.match(create, /requireServerPanelAccess/);
    assert.match(edit, /requireServerPanelAccess/);
  }
  await access(new URL("app/products/extras/[resourceId]/preview/page.tsx", root));
});

test("editor only writes an exact resource selected from the fixed-kind API result", async () => {
  const editor = await source("components/catalog-admin/CatalogResourceEditor.tsx");
  assert.match(editor, /catalogAdminApi\.resources\(kind\)/);
  assert.match(editor, /selectCatalogResourceForEdit\(resources, kind, resourceId\)/);
  assert.match(editor, /Kayıt bulunamadı veya artık erişilemiyor/);
  assert.match(editor, /resourceId: resource\.id, expectedVersion: resource\.version/);
  assert.doesNotMatch(editor, /searchParams|localStorage|sessionStorage|x-store-id|x-tenant-id|supabase|\/api\/admin/);
});

test("extra preview renders untrusted option text and minor-unit prices without unsafe HTML", async () => {
  const preview = await source("components/catalog-admin/CatalogExtraPreview.tsx");
  assert.match(preview, /catalogAdminApi\.resources\("extra"\)/);
  assert.match(preview, /options\.map/);
  assert.match(preview, /formatTry\(priceAdjustmentCents\)/);
  assert.doesNotMatch(preview, /dangerouslySetInnerHTML|<iframe|eval\(|new Function|import\(/);
});
