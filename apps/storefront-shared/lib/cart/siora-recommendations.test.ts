import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultStarterPresentation, type PublicProduct, type PublicStorefront } from "@celebix/saas-contracts";
import type { PublicCatalogQuery, PublicStorefrontRepository } from "@celebix/saas-data";

import { createSioraCartRecommendationsGet, type SioraCartRecommendationResolution } from "../../themes/siora/cart-recommendations.ts";
import { SIORA_STOREFRONT_ID } from "../../themes/siora/theme.ts";

const HOST = "butik-siora.saas-staging.celebix.net";
const NOW = new Date("2026-10-02T12:00:00.000Z");
const STOREFRONT: PublicStorefront = {
  schemaVersion: 2, id: SIORA_STOREFRONT_ID, name: "Butik Siora", slug: "butik-siora",
  hostname: HOST, primaryHostname: HOST, canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr",
  themeKey: "hemenaku", presentation: buildDefaultStarterPresentation({ name: "Butik Siora" }),
};
const request = () => new Request(`https://${HOST}/api/cart/recommendations`);

function product(index: number, overrides: Partial<PublicProduct> = {}): PublicProduct {
  const id = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    id, slug: `siora-product-${index}`, title: `Siora product ${index}`, currency: "TRY", status: "active",
    priceCents: 249000 + index, available: true, description: "Published description",
    variants: [{ id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: "Mavi / M", priceCents: 249000 + index, stockTracking: true, stockQuantity: 3, available: true, attributes: { renk: "Mavi", beden: "M" } }],
    media: [{ id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`, productId: id, url: `https://media.example/products/${index}.webp`, mediaType: "image/webp", altText: `Product ${index}`, width: 800, height: 1200, sortOrder: 0 }],
    ...overrides,
  };
}

function active(queryPublicCatalog?: PublicStorefrontRepository["queryPublicCatalog"], storefront = STOREFRONT): SioraCartRecommendationResolution {
  return { kind: "active", context: { storefront, runtime: { repository: { queryPublicCatalog } } } };
}

test("non-Siora and inactive hosts cannot read recommendation products", async () => {
  for (const selection of [
    active(async () => { throw new Error("must_not_read_foreign_catalog"); }, { ...STOREFRONT, id: "90000000-0000-4000-8000-000000000001" }),
    { kind: "not_found" } as const,
  ]) {
    const response = await createSioraCartRecommendationsGet(async () => selection)(request());
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { suggestions: [] });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("recommendations use the exact resolved storefront and an available public catalog query", async () => {
  let received: PublicCatalogQuery | undefined;
  const route = createSioraCartRecommendationsGet(async () => active(async (input) => {
    received = input;
    return { items: [product(1)], total: 1, nextOffset: null };
  }), () => NOW);
  const response = await route(request());
  assert.equal(response.status, 200);
  assert.equal(received?.storefront, STOREFRONT);
  assert.deepEqual(received, { storefront: STOREFRONT, now: NOW, categorySlug: null, query: "", filter: "available", order: "featured", offset: 0, limit: 12 });
  assert.deepEqual(await response.json(), { suggestions: [{ id: "10000000-0000-4000-8000-000000000001", slug: "siora-product-1", title: "Siora product 1", priceCents: 249001, media: { url: "https://media.example/products/1.webp", altText: "Product 1", width: 800, height: 1200 } }] });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("unavailable inactive and imageless products are omitted without exposing variants", async () => {
  const selection = active(async () => ({ items: [
    product(1, { available: false }), product(2, { status: "draft" as never }), product(3, { media: [] }), product(4),
  ], total: 4, nextOffset: null }));
  const response = await createSioraCartRecommendationsGet(async () => selection)(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [{ id: "10000000-0000-4000-8000-000000000004", slug: "siora-product-4", title: "Siora product 4", priceCents: 249004, media: { url: "https://media.example/products/4.webp", altText: "Product 4", width: 800, height: 1200 } }] });
});

test("oversized catalog responses cannot grow the public suggestion payload beyond twelve cards", async () => {
  const response = await createSioraCartRecommendationsGet(async () => active(async () => ({
    items: Array.from({ length: 20 }, (_, index) => product(index + 1)), total: 20, nextOffset: null,
  })))(request());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.suggestions.length, 12);
  assert.equal(payload.suggestions[0].slug, "siora-product-1");
  assert.equal(payload.suggestions[11].slug, "siora-product-12");
  assert.deepEqual(Object.keys(payload.suggestions[0]).sort(), ["id", "media", "priceCents", "slug", "title"]);
});

test("an empty published catalog yields an empty successful recommendation list", async () => {
  const response = await createSioraCartRecommendationsGet(async () => active(async () => ({ items: [], total: 0, nextOffset: null })))(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [] });
});

test("dependency failures return an uncached empty list without private errors", async () => {
  for (const resolve of [
    async () => ({ kind: "unavailable" } as const),
    async () => { throw new Error("private_storefront_detail"); },
    async () => active(),
    async () => active(async () => { throw new Error("private_database_detail"); }),
  ]) {
    const response = await createSioraCartRecommendationsGet(resolve)(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { suggestions: [] });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("client tenant and search parameters cannot influence the recommendation source", async () => {
  const route = createSioraCartRecommendationsGet(async () => { throw new Error("client_parameters_must_not_resolve"); });
  for (const url of [
    `https://${HOST}/api/cart/recommendations?storeId=${SIORA_STOREFRONT_ID}`,
    `https://${HOST}/api/cart/recommendations?q=coat`,
    `https://${HOST}/api/cart/recommendations?offset=24`,
  ]) {
    const response = await route(new Request(url));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { suggestions: [] });
  }
});
