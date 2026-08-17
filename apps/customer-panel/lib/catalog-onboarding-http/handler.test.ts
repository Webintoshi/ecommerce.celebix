import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogOnboardingRepository } from "@celebix/saas-data";
import type { CatalogOnboardingResult, TenantContext } from "@celebix/saas-contracts";

import { createCatalogOnboardingHttpHandlers } from "./handler.ts";
import type { ServerCatalogOnboardingRuntime } from "../server-catalog-onboarding/runtime.ts";

const PANEL = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://magaza.admin.saas-staging.celebix.site";
const TENANT_ADMIN_HOST = "magaza.admin.saas-staging.celebix.site";
const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const PRODUCT = "71000000-0000-4000-8000-000000000001";
const VARIANT = "72000000-0000-4000-8000-000000000001";
const CATEGORY = "74000000-0000-4000-8000-000000000001";
const REQUEST_ID = "73000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-28T12:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: REQUEST_ID,
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "private" },
    store: { id: STORE, slug: "magaza", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

function result(): CatalogOnboardingResult {
  return {
    product: { id: PRODUCT, storeId: STORE, slug: "kupa", title: "Kupa", status: "draft", currency: "TRY", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 },
    variants: [{ id: VARIANT, productId: PRODUCT, storeId: STORE, title: "Standart", priceCents: 12990, stockTracking: true, stockQuantity: 0, status: "active", attributes: {}, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 }],
    profile: { productType: "physical", minimumPurchaseQuantity: 1, version: 1, updatedAt: NOW.toISOString() },
    categoryIds: [], resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [], mediaCount: 0, replayed: false,
  };
}

function repository(overrides: Partial<CatalogOnboardingRepository> = {}): CatalogOnboardingRepository {
  const reject = async () => { throw new Error("unexpected repository call"); };
  return { getOptions: reject, createProduct: reject, getProductEditor: reject, updateMerchandising: reject, publishAfterMedia: reject, listCategories: reject, createCategory: reject, updateCategory: reject, archiveCategory: reject, ...overrides } as CatalogOnboardingRepository;
}

function runtime(onboarding: CatalogOnboardingRepository): ServerCatalogOnboardingRuntime {
  return {
    access: {
      readiness: { mode: "approved_staging" }, panelOrigin: PANEL,
      async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; },
      async rotateCredential() { return { kind: "unavailable" as const }; },
      async revokeCredential() { return { kind: "unavailable" as const }; },
    },
    onboarding,
  } as ServerCatalogOnboardingRuntime;
}

function handlers(onboarding: CatalogOnboardingRepository) {
  return createCatalogOnboardingHttpHandlers({
    async resolveRuntime() { return runtime(onboarding); },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
  });
}

function request(path: string, method = "GET", body?: unknown, headers: HeadersInit = {}) {
  const selected = new Headers(headers);
  selected.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (method !== "GET") {
    if (!selected.has("origin")) selected.set("origin", PANEL);
    selected.set("content-type", "application/json");
    selected.set("idempotency-key", OPERATION);
  }
  return new Request(`http://customer-panel:3400${path}`, { method, headers: selected, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("quick create forwards only session TenantContext and parsed intent", async () => {
  const calls: unknown[] = [];
  const response = await handlers(repository({ async createProduct(input) { calls.push(input); return result(); } })).createProduct(
    request("/api/catalog/onboarding/products", "POST", { kind: "quick", title: "Kupa", priceCents: 12990, publish: false }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), result());
  assert.deepEqual(calls, [{ tenantContext: tenant(), now: NOW, operationId: OPERATION, intent: { kind: "quick", title: "Kupa", priceCents: 12990, publish: false } }]);
});

test("tenant admin same-origin quick create forwards the selected category and reaches the repository", async () => {
  const calls: unknown[] = [];
  const response = await handlers(repository({ async createProduct(input) { calls.push(input); return { ...result(), categoryIds: [CATEGORY] }; } })).createProduct(
    request("/api/catalog/onboarding/products", "POST", {
      kind: "quick",
      title: "Kupa",
      priceCents: 12990,
      publish: true,
      stockQuantity: 1,
      categoryId: CATEGORY,
    }, { origin: TENANT_ADMIN_ORIGIN, host: TENANT_ADMIN_HOST }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ...result(), categoryIds: [CATEGORY] });
  assert.deepEqual(calls, [{
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    intent: { kind: "quick", title: "Kupa", priceCents: 12990, publish: true, stockQuantity: 1, categoryId: CATEGORY },
  }]);
});

test("options use authenticated durable authority in a no-store response", async () => {
  const calls: unknown[] = [];
  const options = { categories: [], resources: [], locations: [], channels: [] };
  const response = await handlers(repository({ async getOptions(input) { calls.push(input); return options; } })).getOptions(request("/api/catalog/onboarding/options"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ tenantContext: tenant(), now: NOW }]);
});

test("private authority, wrong Origin, query and malformed content fail before repository", async () => {
  const api = handlers(repository());
  const body = { kind: "quick", title: "Kupa", priceCents: 12990, publish: false };
  const cases = [
    request("/api/catalog/onboarding/products", "POST", body, { "x-store-id": STORE }),
    request("/api/catalog/onboarding/products", "POST", body, { origin: "https://wrong.example" }),
    request("/api/catalog/onboarding/products", "POST", body, {
      origin: "https://other-store.admin.saas-staging.celebix.site",
      host: TENANT_ADMIN_HOST,
      forwarded: `host=${TENANT_ADMIN_HOST};proto=https`,
      "x-forwarded-host": TENANT_ADMIN_HOST,
      "x-forwarded-proto": "https",
    }),
    request("/api/catalog/onboarding/products?storeId=x", "POST", body),
    request("/api/catalog/onboarding/products", "POST", { ...body, storeId: STORE }),
  ];
  for (const candidate of cases) assert.ok((await api.createProduct(candidate)).status >= 400);
});

test("editor update and publish bind exact path authority", async () => {
  const calls: Array<[string, unknown]> = [];
  const api = handlers(repository({
    async getProductEditor(input) { calls.push(["get", input]); return { ...result(), variants: result().variants.map((variant) => ({ variant, continueSellingWhenOutOfStock: false, inventory: [] })) } as never; },
    async updateMerchandising(input) { calls.push(["update", input]); return result(); },
    async publishAfterMedia(input) { calls.push(["publish", input]); return result(); },
  }));
  const path = `/api/catalog/products/${PRODUCT}/merchandising`;
  assert.equal((await api.getProductEditor(request(path), PRODUCT)).status, 200);
  assert.equal((await api.updateMerchandising(request(path, "PATCH", { expectedProfileVersion: 1, profile: { minimumPurchaseQuantity: 1 }, categoryIds: [], resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [] }), PRODUCT)).status, 200);
  assert.equal((await api.publishAfterMedia(request(`/api/catalog/products/${PRODUCT}/publish-after-media`, "POST", { expectedProductVersion: 1, expectedMediaCount: 0 }), PRODUCT)).status, 200);
  assert.deepEqual(calls.map(([name]) => name), ["get", "update", "publish"]);
});

test("category CRUD binds session authority and exact category paths", async () => {
  const category = { id: PRODUCT, name: "Kupalar", slug: "kupalar", position: 0, depth: 1, status: "active" as const, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const calls: Array<[string, unknown]> = [];
  const api = handlers(repository({
    async listCategories(input) { calls.push(["list", input]); return [category]; },
    async createCategory(input) { calls.push(["create", input]); return { category, replayed: false }; },
    async updateCategory(input) { calls.push(["update", input]); return { category: { ...category, version: 2 }, replayed: false }; },
    async archiveCategory(input) { calls.push(["archive", input]); return { category: { ...category, status: "archived", version: 2, archivedAt: NOW.toISOString() }, replayed: false }; },
  }));
  assert.equal((await api.listCategories(request("/api/catalog/onboarding/categories"))).status, 200);
  assert.equal((await api.createCategory(request("/api/catalog/onboarding/categories", "POST", { name: "Kupalar", position: 0 }))).status, 201);
  assert.equal((await api.updateCategory(request(`/api/catalog/onboarding/categories/${PRODUCT}`, "PATCH", { expectedVersion: 1, fields: { name: "Fincanlar", position: 1 } }), PRODUCT)).status, 200);
  assert.equal((await api.archiveCategory(request(`/api/catalog/onboarding/categories/${PRODUCT}/archive`, "POST", { expectedVersion: 1 }), PRODUCT)).status, 200);
  assert.deepEqual(calls.map(([name]) => name), ["list", "create", "update", "archive"]);
});
