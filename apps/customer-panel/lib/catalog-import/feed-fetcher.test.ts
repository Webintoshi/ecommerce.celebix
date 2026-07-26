import assert from "node:assert/strict";
import test from "node:test";

import { fetchCatalogFeed, type CatalogFeedFetcherDependencies, type CatalogFeedRawResponse } from "./feed-fetcher.ts";

const encoder = new TextEncoder();
function response(status: number, contentType: string | null, body: string, extra: HeadersInit = {}): CatalogFeedRawResponse {
  const headers = new Headers(extra);
  if (contentType) headers.set("content-type", contentType);
  return { status, headers, body: (async function* () { yield encoder.encode(body); })() };
}
function deps(values: readonly CatalogFeedRawResponse[], addresses: readonly string[] = ["1.1.1.1"]): CatalogFeedFetcherDependencies {
  let index = 0;
  return {
    async lookup() { return addresses.map((address) => ({ address, family: address.includes(":") ? 6 as const : 4 as const })); },
    async request(input) { assert.equal(input.headers.cookie, undefined); assert.equal(input.headers.authorization, undefined); return values[index++]!; },
  };
}

test("feed fetcher accepts exact CSV JSON XML media and returns bounded UTF-8", async () => {
  for (const [contentType, mediaType] of [["text/csv; charset=utf-8", "csv"], ["application/json", "json"], ["application/xml", "xml"]] as const) {
    const result = await fetchCatalogFeed("https://feeds.example.com/catalog", deps([response(200, contentType, "ürün")]));
    assert.deepEqual(result, { mediaType, body: "ürün" });
    assert.equal(Object.isFrozen(result), true);
  }
});

test("redirects are manual, bounded and each host is resolved and pinned again", async () => {
  const requested: string[] = [], resolved: string[] = [];
  const values = [
    response(302, null, "", { location: "https://cdn.example.com/products.csv" }),
    response(200, "text/csv", "title,slug,priceCents,sku,stockQuantity\nA,urun-a,1,A-1,1"),
  ];
  const result = await fetchCatalogFeed("https://feeds.example.com/start", {
    async lookup(hostname) { resolved.push(hostname); return [{ address: hostname === "feeds.example.com" ? "1.1.1.1" : "8.8.8.8", family: 4 }]; },
    async request(input) { requested.push(`${input.url}|${input.address}`); return values.shift()!; },
  });
  assert.equal(result.mediaType, "csv");
  assert.deepEqual(resolved, ["feeds.example.com", "cdn.example.com"]);
  assert.deepEqual(requested, ["https://feeds.example.com/start|1.1.1.1", "https://cdn.example.com/products.csv|8.8.8.8"]);
});

test("private DNS, redirect loops, MIME, encoding, body limits and timeout fail closed", async () => {
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps([response(200, "text/csv", "x")], ["1.1.1.1", "127.0.0.1"])), /catalog_feed_address_denied/);
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps(Array.from({ length: 4 }, () => response(302, null, "", { location: "https://feeds.example.com/a" })))), /catalog_feed_redirect_invalid/);
  for (const contentType of [null, "text/plain", "application/problem+json", "text/csv, application/json"]) await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps([response(200, contentType, "x")])), /catalog_feed_response_invalid/);
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps([response(200, "text/csv", "x", { "content-encoding": "gzip" })])), /catalog_feed_response_invalid/);
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps([response(200, "text/csv", "x", { "content-length": "524289" })])), /catalog_feed_response_too_large/);
  const oversized: CatalogFeedRawResponse = { status: 200, headers: new Headers({ "content-type": "text/csv" }), body: (async function* () { yield new Uint8Array(524_289); })() };
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", deps([oversized])), /catalog_feed_response_too_large/);
  await assert.rejects(fetchCatalogFeed("https://feeds.example.com/a", { timeoutMs: 5, async lookup() { return [{ address: "1.1.1.1", family: 4 }]; }, async request() { return new Promise(() => undefined); } }), /catalog_feed_timeout/);
});
