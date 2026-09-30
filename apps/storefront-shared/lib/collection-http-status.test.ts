import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { createStorefrontProxy } from "../proxy.ts";

const now = new Date("2026-09-30T15:00:00.000Z");
function fixture(available: boolean | Error, canonical = "shop.example") {
  const reads: unknown[] = [];
  let presentationCalls = 0;
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.example" }),
    resolveCanonicalHostname: async () => canonical,
    resolveCollectionAvailability: async (input) => {
      reads.push(input);
      if (available instanceof Error) throw available;
      return available;
    },
    resolveMediaOrigin: () => { presentationCalls++; return "https://media.example"; },
    authorizePaytrIframe: async () => false,
    resolveAnalytics: async () => { presentationCalls++; return null; },
    now: () => now,
  });
  return { handler, reads, presentationCalls: () => presentationCalls };
}

test("missing and unpublished collection routes send real HTTP404 before streaming presentation", async () => {
  for (const route of ["/collections/missing", "/koleksiyon/missing"]) {
    const f = fixture(false);
    const response = await f.handler(new NextRequest(`https://internal.example${route}?q=coat`));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-middleware-next"), null);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(await response.text(), /Koleksiyon bulunamadı/);
    assert.deepEqual(f.reads, [{ hostname: "shop.example", slug: "missing", now }]);
    assert.equal(f.presentationCalls(), 0);
  }
});

test("published empty collections continue to normal streaming and keep security headers", async () => {
  const f = fixture(true);
  const response = await f.handler(new NextRequest("https://internal.example/koleksiyon/yaz"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(f.reads.length, 1);
});

test("canonical alias redirects run before collection lookup and preserve search", async () => {
  const f = fixture(false, "www.shop.example");
  const response = await f.handler(new NextRequest("https://internal.example/collections/missing?q=coat"));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://www.shop.example/collections/missing?q=coat");
  assert.equal(f.reads.length, 0);
});

test("collection resolver outage remains503 without streaming a misleading200", async () => {
  const f = fixture(new Error("repository unavailable"));
  const response = await f.handler(new NextRequest("https://internal.example/collections/yaz"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-middleware-next"), null);
  assert.equal(f.presentationCalls(), 0);
});

test("collection check is limited to exact routes and safely decodes slug", async () => {
  const f = fixture(true);
  for (const route of ["/", "/products/yaz", "/collections/yaz/other", "/api/collections/yaz"]) {
    const response = await f.handler(new NextRequest(`https://internal.example${route}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
  assert.equal(f.reads.length, 0);
  await f.handler(new NextRequest("https://internal.example/collections/y%61z"));
  assert.deepEqual(f.reads, [{ hostname: "shop.example", slug: "yaz", now }]);
});

test("malformed escaped collection slug returns404 without a repository read", async () => {
  const f = fixture(true);
  const response = await f.handler(new NextRequest("https://internal.example/collections/%E0%A4%A"));
  assert.equal(response.status, 404);
  assert.equal(f.reads.length, 0);
});
