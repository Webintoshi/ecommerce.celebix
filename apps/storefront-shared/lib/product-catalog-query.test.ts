import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { catalogHref, isValidProductCatalogSearch, parseProductCatalogQuery } from "./product-catalog-query.ts";

test("catalog URL state is bounded and keeps global sort/filter across pages", () => {
  const selection = parseProductCatalogQuery({ q: " yüzük ", filter: "discounted", sort: "price-asc", offset: "24" });
  assert.deepEqual(selection, { query: "yüzük", filter: "discounted", order: "price-asc", offset: 24 });
  assert.equal(catalogHref("/urunler", selection, 48), "/urunler?q=y%C3%BCz%C3%BCk&filter=discounted&sort=price-asc&offset=48");
});

test("untrusted catalog query falls back to bounded defaults", () => {
  assert.deepEqual(parseProductCatalogQuery({ q: ["one", "two"], filter: "bogus", sort: "price-asc", offset: "-1" }), { query: "", filter: "all", order: "price-asc", offset: 0 });
  assert.deepEqual(parseProductCatalogQuery({ q: "a".repeat(101), offset: "10001" }), { query: "", filter: "all", order: "featured", offset: 0 });
});

test("search input applies the same UTF-8 limit as the server", () => {
  assert.equal(isValidProductCatalogSearch("ş".repeat(50)), true);
  assert.equal(isValidProductCatalogSearch("ş".repeat(51)), false);
  assert.deepEqual(parseProductCatalogQuery({ q: "ş".repeat(51) }), { query: "", filter: "all", order: "featured", offset: 0 });
});

test("catalog controls navigate without native forms blocked by storefront CSP", async () => {
  const [explorer, proxy] = await Promise.all([
    readFile(new URL("../components/ProductExplorer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(proxy, /form-action 'none'/);
  assert.doesNotMatch(explorer, /<form\b/);
  assert.match(explorer, /router[.]push\(catalogHref\(/);
  assert.match(explorer, /if \(isValidProductCatalogSearch\(event[.]currentTarget[.]value\)\) setQuery/);
  assert.match(explorer, /query: query[.]trim\(\), order, filter: value/);
  assert.match(explorer, /selection[.]filter, selection[.]offset, path/);
});
