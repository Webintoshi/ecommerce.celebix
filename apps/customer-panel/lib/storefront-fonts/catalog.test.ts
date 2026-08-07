import assert from "node:assert/strict";
import test from "node:test";

import {
  FEATURED_STOREFRONT_FONT_CATALOG,
  MAX_STOREFRONT_FONT_RESULTS,
  loadStorefrontFontCatalog,
} from "./catalog.ts";

type FontItem = Readonly<{
  family: string;
  category?: string;
  fonts?: Readonly<Record<string, unknown>>;
  popularity?: number;
}>;

function metadata(items: readonly FontItem[], prefix = ")]}'\n"): string {
  return `${prefix}${JSON.stringify({ familyMetadataList: items })}`;
}

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}

test("catalog strips the Google metadata prefix and sorts sanitized families by popularity", async () => {
  let request: Readonly<{ input: string; init: unknown }> | undefined;
  const result = await loadStorefrontFontCatalog(async (input, init) => {
    request = { input, init };
    return response(metadata([
      { family: "Playfair Display", category: "Serif", fonts: { "500": {}, "700italic": {} }, popularity: 20 },
      { family: " Inter ", category: "Sans Serif", fonts: { "400": {}, "500italic": {}, "900": {} }, popularity: 1 },
      { family: "Roboto Mono", category: "Monospace", fonts: { "400": {}, "800": {} }, popularity: 10 },
      { family: "Bad;src:url(evil)", category: "Display", fonts: { "400": {} }, popularity: 0 },
    ]));
  });

  assert.equal(request?.input, "https://fonts.google.com/metadata/fonts");
  assert.deepEqual(request?.init, {
    headers: { Accept: "application/json", "User-Agent": "CelebixCustomerPanel/1.0" },
    next: { revalidate: 86400 },
  });
  assert.deepEqual(result, {
    degraded: false,
    fonts: [
      { family: "Inter", category: "sans-serif", availableWeights: ["400", "500"], source: "google" },
      { family: "Roboto Mono", category: "monospace", availableWeights: ["400", "800"], source: "google" },
      { family: "Playfair Display", category: "serif", availableWeights: ["500", "700"], source: "google" },
    ],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.fonts), true);
  assert.equal(Object.isFrozen(result.fonts[0]?.availableWeights), true);
});

test("catalog has a hard result bound and deterministic family tie-breaking", async () => {
  const items = Array.from({ length: MAX_STOREFRONT_FONT_RESULTS + 25 }, (_, index) => ({
    family: `Font ${String(index).padStart(4, "0")}`,
    category: index % 2 ? "Handwriting" : "Display",
    fonts: { "400": {} },
    popularity: 1,
  }));
  const result = await loadStorefrontFontCatalog(async () => response(metadata(items)));
  assert.equal(result.fonts.length, MAX_STOREFRONT_FONT_RESULTS);
  assert.equal(result.fonts[0]?.family, "Font 0000");
  assert.equal(result.fonts.at(-1)?.family, `Font ${String(MAX_STOREFRONT_FONT_RESULTS - 1).padStart(4, "0")}`);
});

test("catalog fails closed to immutable featured choices on malformed or non-200 metadata", async () => {
  for (const fetcher of [
    async () => response("not-json"),
    async () => response(JSON.stringify({ familyMetadataList: "wrong" })),
    async () => response("{}", 503),
    async () => { throw new Error("offline"); },
  ]) {
    const result = await loadStorefrontFontCatalog(fetcher);
    assert.equal(result.degraded, true);
    assert.deepEqual(result.fonts, FEATURED_STOREFRONT_FONT_CATALOG);
    assert.equal(Object.isFrozen(result.fonts), true);
  }
});

test("same-origin catalog route exposes cacheable public metadata only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response(metadata([
    { family: "Manrope", category: "Sans Serif", fonts: { "400": {}, "700": {} }, popularity: 1 },
  ]));
  try {
    const { GET } = await import("../../app/api/storefront-design/fonts/route.ts");
    const routeResponse = await GET();
    assert.equal(routeResponse.status, 200);
    assert.equal(routeResponse.headers.get("Cache-Control"), "public, s-maxage=86400, stale-while-revalidate=86400");
    const payload = await routeResponse.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ["degraded", "fonts"]);
    assert.doesNotMatch(JSON.stringify(payload), /secret|token|tenant|storeId|apiKey/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
