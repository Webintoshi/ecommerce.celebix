import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogPageHandler } from "./catalog-page.ts";

const storefront = { id: "tenant-a", hostname: "a.example", locale: "tr" } as any;
const page = { items: [], total: 98, nextOffset: 48 };
function fixture(kind = "active") {
  const calls: any[] = [];
  const handler = createCatalogPageHandler({
    resolveStorefront: async () => ({ kind, storefront }) as any,
    queryCatalog: async input => { calls.push(input); return page; },
    queryCollection: async input => { calls.push(input); return page as any; },
  });
  return { calls, handler };
}
test("catalog continuation preserves the resolved merchant, query, order and bounded page size", async () => {
  const f = fixture();
  const response = await f.handler(new Request("https://a.example/api/catalog/page?path=%2Furunler&q=alt%C4%B1n&filter=available&sort=price-desc&offset=24"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), page);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(f.calls[0].storefront, storefront);
  assert.deepEqual({ ...f.calls[0], now: null, storefront: null }, { storefront: null, now: null, categorySlug: null, query: "altın", filter: "available", order: "price-desc", offset: 24, limit: 24 });
});
test("category and collection continuations use their original repository scope", async () => {
  const f = fixture();
  await f.handler(new Request("https://a.example/api/catalog/page?path=%2Fkategori%2Fkolyeler&offset=24"));
  await f.handler(new Request("https://a.example/api/catalog/page?path=%2Fcollections%2Fnew-season&offset=48"));
  assert.equal(f.calls[0].categorySlug, "kolyeler");
  assert.equal(f.calls[1].slug, "new-season");
  assert.equal(f.calls[1].categorySlug, undefined);
});
test("bad offsets, repeated parameters and foreign paths never reach the catalog", async () => {
  const f = fixture();
  for (const query of ["path=%2Furunler&offset=-1", "path=%2Furunler&offset=25", "path=%2Furunler&offset=10008", "path=%2Furunler&offset=24&offset=48", "path=https%3A%2F%2Fb.example%2Fproducts&offset=24", "path=%2Faccount&offset=24", "path=%2Furunler&q=%00", "path=%2Furunler&storeId=tenant-b"]) {
    assert.equal((await f.handler(new Request(`https://a.example/api/catalog/page?${query}`))).status, 400, query);
  }
  assert.equal(f.calls.length, 0);
});
test("an unavailable or unknown storefront cannot resolve another tenant's products", async () => {
  for (const [kind, status] of [["not_found", 404], ["unavailable", 503]] as const) {
    const f = fixture(kind);
    assert.equal((await f.handler(new Request("https://a.example/api/catalog/page?path=%2Furunler&offset=24"))).status, status);
    assert.equal(f.calls.length, 0);
  }
});
