import assert from "node:assert/strict";
import test from "node:test";

async function handler() {
  const module = await import("./search-suggestions.ts").catch(() => ({})) as { createSearchSuggestionsHandler?: Function };
  assert.equal(typeof module.createSearchSuggestionsHandler, "function", "bounded public search handler must exist");
  return module.createSearchSuggestionsHandler!;
}
const product = { id: "20000000-0000-4000-8000-000000000001", slug: "ayakkabi", title: "Ayakkabı", currency: "TRY", priceCents: 1489, available: true, media: [{ url: "https://media.example.test/a.webp", altText: "Ayakkabı" }], variants: [{ sku: "PRIVATE_NOT_RETURNED" }], description: "PRIVATE_NOT_RETURNED" };

test("suggestions use verified host scope and expose bounded public card fields", async () => {
  const create = await handler();
  let input: unknown;
  const handle = create({ resolveStorefront: async () => ({ kind: "active", storefront: { hostname: "shop.example.test", locale: "tr" } }), search: async (value: unknown) => { input = value; return { items: [product], nextCursor: null }; } });
  const response = await handle(new Request("https://shop.example.test/api/search/suggestions?q=ayakkab%C4%B1&storeId=other"));
  assert.equal(response.status, 200);
  assert.equal((input as { hostname: string }).hostname, "shop.example.test");
  assert.equal((input as { limit: number }).limit, 8);
  const body = await response.json();
  assert.equal(body.items[0].href, "/urun/ayakkabi");
  assert.equal(body.items[0].priceCents, 1489);
  assert.equal(JSON.stringify(body).includes("PRIVATE_NOT_RETURNED"), false);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});

test("suggestions reject duplicate, excessive and control-character queries before any search", async () => {
  const create = await handler();
  let calls = 0;
  const handle = create({ resolveStorefront: async () => { calls++; return { kind: "unavailable" }; }, search: async () => { calls++; return {}; } });
  for (const q of ["q=one&q=two", `q=${"ş".repeat(51)}`, "q=hello%00world"]) {
    const response = await handle(new Request(`https://shop.example.test/api/search/suggestions?${q}`));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
  assert.deepEqual(await (await handle(new Request("https://shop.example.test/api/search/suggestions?q=a"))).json(), { items: [] });
  assert.equal(calls, 0);
});

test("unknown domains and failed searches cannot produce cross-store suggestions", async () => {
  const create = await handler();
  let calls = 0;
  const unavailable = create({ resolveStorefront: async () => ({ kind: "not_found" }), search: async () => { calls++; return { items: [product] }; } });
  assert.equal((await unavailable(new Request("https://unknown.example.test/api/search/suggestions?q=ayakkabi"))).status, 404);
  assert.equal(calls, 0);
  const failing = create({ resolveStorefront: async () => ({ kind: "active", storefront: { hostname: "shop.example.test", locale: "tr" } }), search: async () => { throw new Error("secret database details"); } });
  const response = await failing(new Request("https://shop.example.test/api/search/suggestions?q=ayakkabi"));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("secret"), false);
});
