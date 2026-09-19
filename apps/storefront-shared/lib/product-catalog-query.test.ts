import assert from "node:assert/strict";
import test from "node:test";
import { catalogHref, parseProductCatalogQuery } from "./product-catalog-query.ts";

test("catalog URL state is bounded and keeps global sort/filter across pages", () => {
  const selection = parseProductCatalogQuery({ q: " yüzük ", filter: "discounted", sort: "price-asc", offset: "24" });
  assert.deepEqual(selection, { query: "yüzük", filter: "discounted", order: "price-asc", offset: 24 });
  assert.equal(catalogHref("/urunler", selection, 48), "/urunler?q=y%C3%BCz%C3%BCk&filter=discounted&sort=price-asc&offset=48");
});

test("untrusted catalog query falls back to bounded defaults", () => {
  assert.deepEqual(parseProductCatalogQuery({ q: ["one", "two"], filter: "bogus", sort: "price-asc", offset: "-1" }), { query: "", filter: "all", order: "price-asc", offset: 0 });
  assert.deepEqual(parseProductCatalogQuery({ q: "a".repeat(101), offset: "10001" }), { query: "", filter: "all", order: "featured", offset: 0 });
});
