import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogQuickCreateIntent } from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, createCatalogOnboardingClient } from "./client.ts";

const OPERATION = "70000000-0000-4000-8000-000000000001";
const STORE = "33333333-3333-4333-8333-333333333333";
const PRODUCT = "71000000-0000-4000-8000-000000000001";
const VARIANT = "72000000-0000-4000-8000-000000000001";
const NOW = "2026-07-28T12:00:00.000Z";
const quick: CatalogQuickCreateIntent = { kind: "quick", title: "Kupa", priceCents: 12990, publish: false };

function result() {
  return {
    product: { id: PRODUCT, storeId: STORE, slug: "kupa", title: "Kupa", status: "draft", currency: "TRY", createdAt: NOW, updatedAt: NOW, version: 1 },
    variants: [{ id: VARIANT, productId: PRODUCT, storeId: STORE, title: "Standart", priceCents: 12990, stockTracking: true, stockQuantity: 0, status: "active", attributes: {}, createdAt: NOW, updatedAt: NOW, version: 1 }],
    profile: { productType: "physical", minimumPurchaseQuantity: 1, version: 1, updatedAt: NOW },
    categoryIds: [], resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [], mediaCount: 0, replayed: false,
  };
}

test("client uses one idempotency key and same-origin credentials", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch(input, init) {
      calls.push({ input, init });
      return Response.json(result(), { status: 201 });
    },
  });
  assert.deepEqual(await client.createProduct(quick), result());
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/api/catalog/onboarding/products");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), OPERATION);
  assert.equal(calls[0]?.init?.body, JSON.stringify(quick));
});

test("read projections are no-store and hostile responses fail closed", async () => {
  const calls: RequestInit[] = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch(_input, init) { calls.push(init ?? {}); return Response.json({ categories: [], resources: [], locations: [], channels: [], databaseUrl: "private" }); },
  });
  await assert.rejects(() => client.getOptions(), (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "unavailable");
  assert.equal(calls[0]?.cache, "no-store");
  assert.equal(calls[0]?.credentials, "same-origin");
});

test("one failed mutation is never retried with a second write", async () => {
  let writes = 0;
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch() { writes += 1; throw new TypeError("network lost"); },
  });
  await assert.rejects(() => client.createProduct(quick), (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "unavailable");
  assert.equal(writes, 1);
});
