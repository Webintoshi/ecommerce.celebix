import assert from "node:assert/strict";
import test from "node:test";

import { CatalogApiError, createCatalogApiClient } from "./client.ts";

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const SUMMARY = Object.freeze({
  totalProducts: 4,
  activeProducts: 3,
  draftProducts: 1,
  productLimit: 10,
  activeVariants: 6,
  outOfStockVariants: 2,
  productsWithoutMedia: 1,
  activeMedia: 7,
});
const PRODUCT = Object.freeze({
  id: PRODUCT_ID,
  storeId: "33333333-3333-4333-8333-333333333333",
  slug: "atlas-kupa",
  title: "Atlas Kupa",
  status: "draft",
  currency: "TRY",
  createdAt: "2026-07-17T08:00:00.000Z",
  updatedAt: "2026-07-17T08:00:00.000Z",
  version: 3,
});
const VARIANT = Object.freeze({
  id: VARIANT_ID,
  productId: PRODUCT_ID,
  storeId: PRODUCT.storeId,
  title: "Standart",
  priceCents: 12_550,
  stockTracking: true,
  stockQuantity: 12,
  status: "active",
  attributes: {},
  createdAt: PRODUCT.createdAt,
  updatedAt: PRODUCT.updatedAt,
  version: 4,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("list pagination accepts only a server cursor and preserves same-origin credentials", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const client = createCatalogApiClient({
    fetch: async (input, init) => {
      calls.push([input, init]);
      return jsonResponse({ items: [PRODUCT], nextCursor: "safe_cursor-1" });
    },
    randomUUID: () => OPERATION_ID,
  });
  const result = await client.listProducts({ status: "draft", cursor: "safe_cursor-1" });
  assert.equal(result.items.length, 1);
  assert.equal(calls[0]?.[0], "/api/catalog/products?limit=20&status=draft&cursor=safe_cursor-1");
  assert.deepEqual(calls[0]?.[1], { method: "GET", credentials: "same-origin", cache: "no-store" });
  await assert.rejects(() => client.listProducts({ cursor: "unsafe%cursor" }), /catalog_client_invalid/);
});

test("list products accepts only a bounded canonical featured-image projection", async () => {
  const featuredImage = Object.freeze({
    publicUrl: "https://media.celebix.site/stores/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
    altText: "Öne çıkan ürün görseli",
  });
  const client = createCatalogApiClient({
    fetch: async () => jsonResponse({
      items: [PRODUCT],
      featuredImages: { [PRODUCT_ID]: featuredImage },
    }),
  });

  const result = await client.listProducts();

  assert.deepEqual(result.featuredImages, { [PRODUCT_ID]: featuredImage });
  assert.equal(Object.isFrozen(result.featuredImages), true);
  assert.equal(Object.isFrozen(result.featuredImages?.[PRODUCT_ID]), true);

  for (const featuredImages of [
    { [PRODUCT_ID]: { ...featuredImage, objectKey: "private/object.webp" } },
    { [PRODUCT_ID]: { ...featuredImage, publicUrl: "http://media.celebix.site/object.webp" } },
    { [PRODUCT_ID]: { ...featuredImage, publicUrl: `${featuredImage.publicUrl}?token=secret` } },
    { "99999999-9999-4999-8999-999999999999": featuredImage },
  ]) {
    const hostile = createCatalogApiClient({
      fetch: async () => jsonResponse({ items: [PRODUCT], featuredImages }),
    });
    await assert.rejects(() => hostile.listProducts(), /unavailable|catalog/i);
  }
});

test("variant choice client performs one bounded same-origin read and rejects duplicate or private fields", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const choice = Object.freeze({
    productId: PRODUCT_ID,
    productTitle: "Atlas Kupa",
    variantId: VARIANT_ID,
    variantTitle: "Standart",
    sku: "ATLAS-KUPA-1",
  });
  const client = createCatalogApiClient({ fetch: async (input, init) => {
    calls.push([input, init]);
    return jsonResponse({ items: [choice] });
  } });
  assert.deepEqual(await client.listVariantChoices(), [choice]);
  assert.deepEqual(calls, [["/api/catalog/variant-choices", {
    method: "GET", credentials: "same-origin", cache: "no-store",
  }]]);
  for (const items of [[choice, choice], [{ ...choice, storeId: PRODUCT.storeId }]]) {
    const hostile = createCatalogApiClient({ fetch: async () => jsonResponse({ items }) });
    await assert.rejects(() => hostile.listVariantChoices(), /unavailable|catalog/i);
  }
});

test("catalog list and detail reads forward the exact AbortSignal and preserve native aborts", async () => {
  const controller = new AbortController();
  const calls: RequestInit[] = [];
  const client = createCatalogApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return calls.length === 1
        ? jsonResponse({ items: [PRODUCT] })
        : jsonResponse({ product: PRODUCT, variants: [VARIANT] });
    },
  });
  await client.listProducts({ status: "active" }, controller.signal);
  await client.getProduct(PRODUCT_ID, controller.signal);
  assert.deepEqual(calls.map((init) => init.signal), [controller.signal, controller.signal]);

  const aborted = new DOMException("catalog native abort", "AbortError");
  const aborting = createCatalogApiClient({ fetch: async () => { throw aborted; } });
  await assert.rejects(() => aborting.listProducts({}, controller.signal), (error: unknown) => error === aborted);
  await assert.rejects(() => aborting.getProduct(PRODUCT_ID, controller.signal), (error: unknown) => error === aborted);
});

test("dashboard summary client performs one same-origin no-store GET and freezes exact counts", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const client = createCatalogApiClient({
    fetch: async (input, init) => {
      calls.push([input, init]);
      return jsonResponse(SUMMARY);
    },
  });

  const result = await client.getDashboardSummary();

  assert.deepEqual(result, SUMMARY);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(calls, [["/api/catalog/summary", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  }]]);
});

test("dashboard summary client rejects extra missing negative fractional and inconsistent counts", async () => {
  const invalidSummaries = [
    { ...SUMMARY, extra: 1 },
    { ...SUMMARY, activeMedia: undefined },
    { ...SUMMARY, totalProducts: -1 },
    { ...SUMMARY, activeVariants: 1.5 },
    { ...SUMMARY, activeProducts: 4 },
    { ...SUMMARY, outOfStockVariants: 7 },
    { ...SUMMARY, productsWithoutMedia: 5 },
  ];

  for (const body of invalidSummaries) {
    await assert.rejects(
      () => createCatalogApiClient({ fetch: async () => jsonResponse(body) }).getDashboardSummary(),
      (error: unknown) => error instanceof CatalogApiError && error.code === "unavailable",
    );
  }
});

test("every mutation uses an exact UUID idempotency key and JSON without store authority", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const client = createCatalogApiClient({
    fetch: async (input, init) => {
      calls.push([String(input), init ?? {}]);
      const path = String(input);
      if (path.endsWith("/variants")) return jsonResponse({ variant: VARIANT, replayed: false }, 201);
      if (path.includes(`/variants/${VARIANT_ID}`)) return jsonResponse({ variant: VARIANT, replayed: false });
      if (path.endsWith("/archive")) return jsonResponse({ product: PRODUCT, replayed: false });
      return jsonResponse({ product: PRODUCT, initialVariant: VARIANT, replayed: false }, 201);
    },
    randomUUID: () => OPERATION_ID,
  });
  const productFields = { slug: "atlas-kupa", title: "Atlas Kupa", status: "draft" as const, currency: "TRY" };
  const variantFields = { title: "Standart", priceCents: 12_550, stockTracking: true, stockQuantity: 12, attributes: {} };
  await client.createProduct({ product: productFields, initialVariant: variantFields });
  await client.updateProduct(PRODUCT_ID, { expectedVersion: 3, product: productFields });
  await client.archiveProduct(PRODUCT_ID, 3);
  await client.createVariant(PRODUCT_ID, { variant: variantFields });
  await client.updateVariant(PRODUCT_ID, VARIANT_ID, { expectedVersion: 4, variant: variantFields });
  await client.archiveVariant(PRODUCT_ID, VARIANT_ID, 4);

  assert.equal(calls.length, 6);
  for (const [, init] of calls) {
    const headers = new Headers(init.headers);
    assert.equal(init.credentials, "same-origin");
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("idempotency-key"), OPERATION_ID);
    assert.equal(JSON.stringify(init.body).includes("storeId"), false);
  }
  assert.deepEqual(JSON.parse(String(calls[1]?.[1].body)), { expectedVersion: 3, product: productFields });
  assert.deepEqual(JSON.parse(String(calls[5]?.[1].body)), { expectedVersion: 4 });
});

test("non-canonical generated operation IDs fail before fetch", async () => {
  let calls = 0;
  const client = createCatalogApiClient({
    fetch: async () => { calls += 1; return jsonResponse({}); },
    randomUUID: () => "not-a-uuid",
  });
  await assert.rejects(
    () => client.archiveProduct(PRODUCT_ID, 3),
    /catalog_client_invalid/,
  );
  assert.equal(calls, 0);
});

test("finite API errors become safe Turkish messages and retain conflict identity", async () => {
  const client = createCatalogApiClient({
    fetch: async () => jsonResponse({ code: "version_conflict", driver: "secret" }, 409),
    randomUUID: () => OPERATION_ID,
  });
  await assert.rejects(
    () => client.archiveProduct(PRODUCT_ID, 3),
    (error: unknown) => {
      assert.equal(error instanceof CatalogApiError, true);
      assert.equal((error as CatalogApiError).code, "version_conflict");
      assert.match((error as Error).message, /başka bir işlem/i);
      assert.doesNotMatch((error as Error).message, /driver|secret/i);
      return true;
    },
  );
});
