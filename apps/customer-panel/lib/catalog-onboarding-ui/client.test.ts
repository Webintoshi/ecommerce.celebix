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

test("client preserves request authority failures instead of showing generic service unavailable", async () => {
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch() { return Response.json({ code: "origin_denied" }, { status: 403 }); },
  });
  await assert.rejects(
    () => client.createProduct(quick),
    (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "origin_denied" && error.status === 403,
  );
});

test("cross-product SKU conflict names the conflicting field", async () => {
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch() { return Response.json({ code: "sku_conflict" }, { status: 409 }); },
  });
  await assert.rejects(() => client.createProduct({ ...quick, sku: "RSA-001" }),
    (error: unknown) => error instanceof CatalogOnboardingApiError
      && error.code === "sku_conflict" && error.status === 409 && error.message.includes("SKU"));
});

test("detail editor loads the complete no-store merchandising projection", async () => {
  const projection = {
    product: result().product,
    variants: [{ variant: result().variants[0], continueSellingWhenOutOfStock: false, inventory: [] }],
    profile: result().profile,
    categoryIds: ["73000000-0000-4000-8000-000000000001"],
    resourceIds: result().resourceIds,
    channelIds: [],
    mediaCount: 0,
  };
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch(input, init) { calls.push({ input, init }); return Response.json(projection); },
  });
  const loaded = await client.getProductEditor(PRODUCT);
  assert.deepEqual(loaded.categoryIds, projection.categoryIds);
  assert.equal(loaded.profile.minimumPurchaseQuantity, 1);
  assert.equal(calls[0]?.input, `/api/catalog/products/${PRODUCT}/merchandising`);
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
});

test("category client sends exact CRUD paths and never browser store authority", async () => {
  const category = { id: "73000000-0000-4000-8000-000000000001", name: "Kupalar", slug: "kupalar", position: 0, depth: 1, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const replies = [[category], { category, replayed: false }, { category: { ...category, version: 2 }, replayed: false }, { category: { ...category, status: "archived", version: 3, archivedAt: NOW }, replayed: false }];
  const client = createCatalogOnboardingClient({
    randomUUID: () => OPERATION,
    async fetch(input, init) { calls.push({ input, init }); return Response.json(replies[calls.length - 1]); },
  });
  await client.listCategories();
  await client.createCategory({ name: "Kupalar", position: 0 });
  await client.updateCategory(category.id, { expectedVersion: 1, fields: { name: "Kupa", position: 1 } });
  await client.archiveCategory(category.id, 2);
  assert.deepEqual(calls.map(({ input }) => input), [
    "/api/catalog/onboarding/categories",
    "/api/catalog/onboarding/categories",
    `/api/catalog/onboarding/categories/${category.id}`,
    `/api/catalog/onboarding/categories/${category.id}/archive`,
  ]);
  assert.equal(calls.some(({ init }) => String(init?.body).includes("storeId") || String(init?.body).includes("tenantId")), false);
});

test("category permanent deletion reads exact impact and sends one caller-bound confirmed command", async () => {
  const categoryId = "73000000-0000-4000-8000-000000000001";
  const impact = {
    resourceKind: "category", resourceId: categoryId, confirmationLabel: "Kupalar", expectedVersion: 4,
    effects: [{ kind: "product_links", count: 3, disposition: "detach" }],
  } as const;
  const deleted = {
    resourceKind: "category", resourceId: categoryId, deleted: true, auditId: OPERATION, replayed: false,
  } as const;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => { throw new Error("delete must use caller operation"); },
    async fetch(input, init) {
      calls.push({ input, init });
      return Response.json(calls.length === 1 ? impact : deleted);
    },
  });

  assert.deepEqual(await client.getCategoryDeletionImpact(categoryId), impact);
  assert.deepEqual(await client.deleteCategory(categoryId, {
    operationId: OPERATION,
    expectedVersion: 4,
    confirmation: "Kupalar",
  }), deleted);
  assert.deepEqual(calls.map(({ input }) => input), [
    `/api/catalog/onboarding/categories/${categoryId}/deletion-impact`,
    `/api/catalog/onboarding/categories/${categoryId}/delete`,
  ]);
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OPERATION);
});

test("category reorder uses one atomic endpoint, credentials, and idempotency key", async () => {
  const groups = [{ orderedCategoryIds: [PRODUCT], expectedVersions: [{ categoryId: PRODUCT, version: 3 }] }];
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const client = createCatalogOnboardingClient({ randomUUID: () => OPERATION, async fetch(input, init) {
    calls.push({ input, init }); return Response.json({ categories: [], replayed: false });
  } });
  assert.deepEqual(await client.reorderCategories({ groups }), { categories: [], replayed: false });
  assert.equal(calls[0]?.input, "/api/catalog/onboarding/categories/order");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), OPERATION);
  assert.equal(calls[0]?.init?.body, JSON.stringify({ groups }));
  await assert.rejects(client.reorderCategories({ groups: [groups[0]!, groups[0]!] }), /catalog_onboarding_client_invalid/);
  assert.equal(calls.length, 1);
});

function categoryMutationReply(replayed = false) {
  return { category: { id: PRODUCT, name: "Kupalar", slug: "kupalar", position: 1, depth: 1, status: "active", version: 2, createdAt: NOW, updatedAt: NOW }, replayed };
}

for (const operation of ["create", "update", "order"] as const) {
  test(`category ${operation} reuses the exact proof after a lost response and releases it on parsed success`, async () => {
    let generated = 0;
    const calls: RequestInit[] = [];
    const client = createCatalogOnboardingClient({
      randomUUID: () => `70000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`,
      async fetch(_input, init) {
        calls.push(init ?? {});
        if (calls.length === 1) throw new TypeError("first response lost after commit");
        return Response.json(operation === "order" ? { categories: [], replayed: true } : categoryMutationReply(true));
      },
    });
    const save = () => operation === "create" ? client.createCategory({ name: "Kupalar", position: 1 })
      : operation === "update" ? client.updateCategory(PRODUCT, { expectedVersion: 1, fields: { name: "Kupalar", position: 1 } })
        : client.reorderCategories({ groups: [{ orderedCategoryIds: [PRODUCT], expectedVersions: [{ categoryId: PRODUCT, version: 1 }] }] });
    await assert.rejects(save(), (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "unavailable");
    await save();
    assert.equal(generated, 1);
    assert.equal(new Headers(calls[0]?.headers).get("idempotency-key"), new Headers(calls[1]?.headers).get("idempotency-key"));
    assert.equal(calls[0]?.body, calls[1]?.body);
    await save();
    assert.equal(generated, 2);
    assert.notEqual(new Headers(calls[1]?.headers).get("idempotency-key"), new Headers(calls[2]?.headers).get("idempotency-key"));
  });
}

test("changed category payload receives a new proof while the original pending proof survives", async () => {
  let generated = 0;
  const calls: RequestInit[] = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => `70000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`,
    async fetch(_input, init) { calls.push(init ?? {}); throw new TypeError("lost response"); },
  });
  await assert.rejects(client.createCategory({ name: "Kupalar", position: 1 }));
  await assert.rejects(client.createCategory({ name: "Bardaklar", position: 1 }));
  await assert.rejects(client.createCategory({ name: "Kupalar", position: 1 }));
  assert.equal(generated, 2);
  assert.equal(calls[0]?.body, calls[2]?.body);
  assert.equal(new Headers(calls[0]?.headers).get("idempotency-key"), new Headers(calls[2]?.headers).get("idempotency-key"));
  assert.notEqual(new Headers(calls[0]?.headers).get("idempotency-key"), new Headers(calls[1]?.headers).get("idempotency-key"));
});

test("malformed success retains category proof but a permanent API rejection clears it", async () => {
  let generated = 0;
  const calls: RequestInit[] = [];
  const client = createCatalogOnboardingClient({
    randomUUID: () => `70000000-0000-4000-8000-${String(++generated).padStart(12, "0")}`,
    async fetch(_input, init) {
      calls.push(init ?? {});
      if (calls.length === 1) return Response.json({ category: "malformed" });
      if (calls.length === 2) return Response.json({ code: "version_conflict" }, { status: 409 });
      return Response.json(categoryMutationReply());
    },
  });
  const save = () => client.updateCategory(PRODUCT, { expectedVersion: 1, fields: { name: "Kupalar", position: 1 } });
  await assert.rejects(save(), (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "unavailable");
  await assert.rejects(save(), (error: unknown) => error instanceof CatalogOnboardingApiError && error.code === "version_conflict");
  await save();
  assert.equal(generated, 2);
  assert.equal(new Headers(calls[0]?.headers).get("idempotency-key"), new Headers(calls[1]?.headers).get("idempotency-key"));
  assert.notEqual(new Headers(calls[1]?.headers).get("idempotency-key"), new Headers(calls[2]?.headers).get("idempotency-key"));
});
