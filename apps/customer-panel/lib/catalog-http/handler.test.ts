import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import { CatalogRepositoryError, type CatalogRepository } from "@celebix/saas-data";

type HandlerModule = typeof import("./handler.ts");
type ServerCatalogRuntime = import("../server-catalog/runtime.ts").ServerCatalogRuntime;

const handlersModule = await import("./handler.ts").catch(() => ({} as Partial<HandlerModule>));

const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://atlas-store.admin.saas-staging.celebix.site";
const OTHER_TENANT_ADMIN_ORIGIN = "https://other-store.admin.saas-staging.celebix.site";
const PRODUCTS = "/api/catalog/products";
const SUMMARY_PATH = "/api/catalog/summary";
const VARIANT_CHOICES_PATH = "/api/catalog/variant-choices";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECOND_VARIANT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const REQUEST_ID = "88888888-8888-4888-8888-888888888888";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const INVALID_COOKIE = "__Host-celebix_panel" + "=v1.bad";
const NOW = new Date("2026-07-17T08:00:00.000Z");

function tenantContext(role: "store_owner" | "admin" | "editor" | "analyst" = "store_owner"): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({ id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "subject-1" }),
    store: Object.freeze({ id: STORE_ID, slug: "atlas-store", status: "active" }),
    membership: Object.freeze({ id: MEMBERSHIP_ID, role, status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["catalog"]),
      limits: Object.freeze({ products: 10, staff: 1, storageBytes: 1024 }),
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  }) as TenantContext;
}

function product(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: PRODUCT_ID,
    storeId: STORE_ID,
    slug: "atlas-mug",
    title: "Atlas Mug",
    description: "Catalog fixture",
    status: "draft" as const,
    currency: "TRY",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 1,
    ...overrides,
  });
}

function variant(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    storeId: STORE_ID,
    title: "Default",
    sku: "ATLAS-MUG-1",
    barcode: "8690000000001",
    priceCents: 12_500,
    compareAtCents: 15_000,
    costCents: 7_000,
    stockTracking: true,
    stockQuantity: 10,
    status: "active" as const,
    attributes: Object.freeze({ color: "black" }),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 1,
    ...overrides,
  });
}

function summary() {
  return Object.freeze({
    totalProducts: 4,
    activeProducts: 3,
    draftProducts: 1,
    productLimit: 10,
    activeVariants: 6,
    outOfStockVariants: 2,
    productsWithoutMedia: 1,
    activeMedia: 7,
  });
}

const CREATE_BODY = Object.freeze({
  product: Object.freeze({
    slug: "atlas-mug",
    title: "Atlas Mug",
    description: "Catalog fixture",
    status: "draft" as const,
    currency: "TRY",
  }),
  initialVariant: Object.freeze({
    title: "Default",
    sku: "ATLAS-MUG-1",
    barcode: "8690000000001",
    priceCents: 12_500,
    compareAtCents: 15_000,
    costCents: 7_000,
    stockTracking: true,
    stockQuantity: 10,
    attributes: Object.freeze({ color: "black" }),
  }),
});

function repository(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  const unavailable = async () => { throw new Error("unexpected repository call"); };
  return Object.freeze({
    createProduct: unavailable,
    getDashboardSummary: unavailable,
    getProduct: unavailable,
    getProductDetails: unavailable,
    listProducts: unavailable,
    listVariantChoices: unavailable,
    updateProduct: unavailable,
    archiveProduct: unavailable,
    restoreProduct: unavailable,
    createVariant: unavailable,
    updateVariant: unavailable,
    archiveVariant: unavailable,
    ...overrides,
  }) as CatalogRepository;
}

function access(
  kind: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable" = "authenticated",
  role: "store_owner" | "admin" | "editor" | "analyst" = "store_owner",
): ServerCatalogRuntime["access"] {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: PANEL_ORIGIN,
    async resolveCredential() {
      return kind === "authenticated"
        ? Object.freeze({ kind, session: Object.freeze({}), tenantContext: tenantContext(role) }) as never
        : Object.freeze({ kind });
    },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function runtime(catalog: CatalogRepository, accessRuntime: ServerCatalogRuntime["access"] = access()): ServerCatalogRuntime {
  return Object.freeze({ access: accessRuntime, catalog });
}

function dependencies(catalog: CatalogRepository, accessRuntime = access()) {
  return {
    async resolveRuntime() { return runtime(catalog, accessRuntime); },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
  };
}

function request(path: string, options: {
  method?: string;
  body?: unknown;
  origin?: string | null;
  cookie?: string | null;
  operationId?: string | null;
  headers?: HeadersInit;
} = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (method !== "GET") {
    headers.set("content-type", "application/json");
    if (options.origin !== null) headers.set("origin", options.origin ?? PANEL_ORIGIN);
    if (options.operationId !== null) headers.set("idempotency-key", options.operationId ?? OPERATION_ID);
  }
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? `__Host-celebix_panel=${CREDENTIAL}`);
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
  });
}

test("authenticated create uses exact TenantContext and idempotency operation without browser store authority", async () => {
  assert.equal(typeof handlersModule.createCatalogHttpHandlers, "function");
  const calls: unknown[] = [];
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async createProduct(input) {
      calls.push(input);
      return Object.freeze({ product: product(), initialVariant: variant(), replayed: false });
    },
  })));
  const response = await handlers?.createProduct(request(PRODUCTS, { method: "POST", body: CREATE_BODY }));
  assert.equal(response?.status, 201);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.equal(response?.headers.get("location"), null);
  assert.deepEqual(await response?.json(), { product: product(), initialVariant: variant(), replayed: false });
  assert.deepEqual(calls, [{
    tenantContext: tenantContext(),
    now: NOW,
    operationId: OPERATION_ID,
    product: CREATE_BODY.product,
    initialVariant: CREATE_BODY.initialVariant,
  }]);
});

test("tenant admin product mutations survive internal reverse-proxy Host and remain bound to the authenticated store", async () => {
  const calls: unknown[] = [];
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async createProduct(input) {
      calls.push(input);
      return Object.freeze({ product: product(), initialVariant: variant(), replayed: false });
    },
  })));
  const accepted = await handlers?.createProduct(request(PRODUCTS, {
    method: "POST",
    body: CREATE_BODY,
    origin: TENANT_ADMIN_ORIGIN,
    headers: {
      host: "customer-panel:3400",
      forwarded: "host=wrong.example;proto=https",
      "x-forwarded-host": "wrong.example",
      "x-forwarded-proto": "https",
    },
  }));
  assert.equal(accepted?.status, 201);

  const denied = await handlers?.createProduct(request(PRODUCTS, {
    method: "POST",
    body: CREATE_BODY,
    origin: OTHER_TENANT_ADMIN_ORIGIN,
    headers: {
      host: "customer-panel:3400",
      "x-forwarded-host": "atlas-store.admin.saas-staging.celebix.site",
      "x-forwarded-proto": "https",
    },
  }));
  assert.equal(denied?.status, 403);
  assert.deepEqual(await denied?.json(), { code: "origin_denied" });
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { tenantContext: TenantContext }).tenantContext.store.slug, "atlas-store");
});

test("authenticated list and detail remain store-scoped and detail includes archived lifecycle state", async () => {
  const calls: unknown[] = [];
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async listProducts(input) { calls.push(input); return Object.freeze({ items: Object.freeze([product()]), catalogTotal: 1 }); },
    async getProductDetails(input) { calls.push(input); return Object.freeze({ product: product(), variants: Object.freeze([variant()]) }); },
  })));
  const list = await handlers?.listProducts(request(`${PRODUCTS}?limit=10&q=Atlas+Mug&status=draft&stock=out-of-stock&category=${PRODUCT_ID}&brand=${VARIANT_ID}&collection=${PRODUCT_ID}&sort=title-desc`));
  assert.equal(list?.status, 200);
  assert.deepEqual(await list?.json(), { items: [product()], catalogTotal: 1 });
  const detail = await handlers?.getProduct(request(`${PRODUCTS}/${PRODUCT_ID}`), PRODUCT_ID);
  assert.equal(detail?.status, 200);
  assert.deepEqual(await detail?.json(), { product: product(), variants: [variant()] });
  assert.deepEqual(calls, [
    { tenantContext: tenantContext(), now: NOW, pageSize: 10, search: "Atlas Mug", status: "draft", stock: "out-of-stock", categoryId: PRODUCT_ID, brandId: VARIANT_ID, collectionId: PRODUCT_ID, sort: "title-desc" },
    { tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID, includeArchivedVariants: true },
  ]);
});

test("variant choices GET returns the exact authenticated store projection", async () => {
  const calls: unknown[] = [];
  const items = Object.freeze([Object.freeze({
    productId: PRODUCT_ID,
    productTitle: "Atlas Mug",
    variantId: VARIANT_ID,
    variantTitle: "Default",
    sku: "ATLAS-MUG-1",
  })]);
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async listVariantChoices(input) { calls.push(input); return items; },
  })));
  const response = await handlers?.listVariantChoices(request(VARIANT_CHOICES_PATH));
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response?.json(), { items });
  assert.deepEqual(calls, [{ tenantContext: tenantContext(), now: NOW }]);
});

test("durable access decisions map to 401 403 and 503 without repository calls or redirects", async () => {
  for (const [kind, status, code] of [
    ["unauthenticated", 401, "unauthenticated"],
    ["unauthorized", 403, "membership_denied"],
    ["unavailable", 503, "unavailable"],
  ] as const) {
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository(), access(kind)));
    const response = await handlers?.listProducts(request(PRODUCTS));
    assert.equal(response?.status, status);
    assert.deepEqual(await response?.json(), { code });
    assert.equal(response?.headers.get("location"), null);
  }
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository()));
  for (const cookie of [null, "__Host-celebix_panel=v1.bad"]) {
    const response = await handlers?.listProducts(request(PRODUCTS, { cookie }));
    assert.equal(response?.status, 401);
    assert.deepEqual(await response?.json(), { code: "unauthenticated" });
  }
});

test("mutation Origin path content and browser credential authority fail before repository access", async () => {
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository()));
  const cases = [
    [request(PRODUCTS, { method: "POST", body: CREATE_BODY, origin: null }), 403],
    [request(PRODUCTS, { method: "POST", body: CREATE_BODY, origin: "https://wrong.example", headers: { "x-forwarded-host": "panel.saas-staging.celebix.site" } }), 403],
    [request(`${PRODUCTS}?storeId=${STORE_ID}`, { method: "POST", body: CREATE_BODY }), 400],
    [request(PRODUCTS, { method: "POST", body: CREATE_BODY, operationId: null }), 400],
    [request(PRODUCTS, { method: "POST", body: { ...CREATE_BODY, storeId: STORE_ID } }), 400],
    [request(PRODUCTS, { method: "POST", body: CREATE_BODY, headers: { authorization: "Bearer browser" } }), 400],
  ] as const;
  for (const [candidate, status] of cases) {
    const response = await handlers?.createProduct(candidate);
    assert.equal(response?.status, status);
    assert.equal(response?.headers.get("cache-control"), "no-store");
  }
});

test("all update and archive handlers pass path IDs versions and operation IDs exactly once", async () => {
  const calls: Array<[string, unknown]> = [];
  const catalog = repository({
    async updateProduct(input) { calls.push(["updateProduct", input]); return { product: product({ version: 2 }), replayed: false }; },
    async archiveProduct(input) { calls.push(["archiveProduct", input]); return { product: product({ status: "archived", version: 2 }), replayed: false }; },
    async restoreProduct(input) { calls.push(["restoreProduct", input]); return { product: product({ status: "draft", version: 3 }), replayed: false }; },
    async createVariant(input) { calls.push(["createVariant", input]); return { variant: variant({ id: SECOND_VARIANT_ID }), replayed: false }; },
    async updateVariant(input) { calls.push(["updateVariant", input]); return { variant: variant({ version: 2 }), replayed: false }; },
    async archiveVariant(input) { calls.push(["archiveVariant", input]); return { variant: variant({ status: "archived", version: 2 }), replayed: false }; },
  });
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(catalog));
  const productFields = CREATE_BODY.product;
  const variantFields = CREATE_BODY.initialVariant;
  const responses = [
    await handlers?.updateProduct(request(`${PRODUCTS}/${PRODUCT_ID}`, { method: "PATCH", body: { expectedVersion: 1, product: productFields } }), PRODUCT_ID),
    await handlers?.archiveProduct(request(`${PRODUCTS}/${PRODUCT_ID}/archive`, { method: "POST", body: { expectedVersion: 1 } }), PRODUCT_ID),
    await handlers?.restoreProduct(request(`${PRODUCTS}/${PRODUCT_ID}/restore`, { method: "POST", body: { expectedVersion: 2 } }), PRODUCT_ID),
    await handlers?.createVariant(request(`${PRODUCTS}/${PRODUCT_ID}/variants`, { method: "POST", body: { variant: variantFields } }), PRODUCT_ID),
    await handlers?.updateVariant(request(`${PRODUCTS}/${PRODUCT_ID}/variants/${VARIANT_ID}`, { method: "PATCH", body: { expectedVersion: 1, variant: variantFields } }), PRODUCT_ID, VARIANT_ID),
    await handlers?.archiveVariant(request(`${PRODUCTS}/${PRODUCT_ID}/variants/${VARIANT_ID}/archive`, { method: "POST", body: { expectedVersion: 1 } }), PRODUCT_ID, VARIANT_ID),
  ];
  assert.deepEqual(responses.map((response) => response?.status), [200, 200, 200, 201, 200, 200]);
  assert.deepEqual(calls.map(([name]) => name), ["updateProduct", "archiveProduct", "restoreProduct", "createVariant", "updateVariant", "archiveVariant"]);
  for (const [, value] of calls) {
    assert.equal((value as { tenantContext: TenantContext }).tenantContext.store.id, STORE_ID);
    assert.equal((value as { operationId: string }).operationId, OPERATION_ID);
  }
});

test("HTTP authorization enforces owner admin editor analyst product lifecycle roles", async () => {
  for (const role of ["store_owner", "admin"] as const) {
    let writes = 0;
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
      async archiveProduct() {
        writes += 1;
        return { product: product({ status: "archived", version: 2 }), replayed: false };
      },
    }), access("authenticated", role)));
    const response = await handlers?.archiveProduct(
      request(`${PRODUCTS}/${PRODUCT_ID}/archive`, { method: "POST", body: { expectedVersion: 1 } }), PRODUCT_ID,
    );
    assert.equal(response?.status, 200, role);
    assert.equal(writes, 1, role);
  }

  for (const role of ["editor", "analyst"] as const) {
    let writes = 0;
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
      async archiveProduct() { writes += 1; throw new Error("must not run"); },
    }), access("authenticated", role)));
    const response = await handlers?.archiveProduct(
      request(`${PRODUCTS}/${PRODUCT_ID}/archive`, { method: "POST", body: { expectedVersion: 1 } }), PRODUCT_ID,
    );
    assert.equal(response?.status, 403, role);
    assert.deepEqual(await response?.json(), { code: "membership_denied" });
    assert.equal(writes, 0, role);
  }

  let analystWrites = 0;
  const analystHandlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async updateProduct() { analystWrites += 1; throw new Error("must not run"); },
  }), access("authenticated", "analyst")));
  const analystUpdate = await analystHandlers?.updateProduct(
    request(`${PRODUCTS}/${PRODUCT_ID}`, { method: "PATCH", body: { expectedVersion: 1, product: CREATE_BODY.product } }), PRODUCT_ID,
  );
  assert.equal(analystUpdate?.status, 403);
  assert.equal(analystWrites, 0);
});

test("restore is POST-only, idempotent, and maps cross-tenant products to 404", async () => {
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async restoreProduct() { return { product: product({ status: "draft", version: 3 }), replayed: true }; },
  })));
  const restored = await handlers?.restoreProduct(
    request(`${PRODUCTS}/${PRODUCT_ID}/restore`, { method: "POST", body: { expectedVersion: 2 } }), PRODUCT_ID,
  );
  assert.equal(restored?.status, 200);
  assert.deepEqual(await restored?.json(), { product: product({ status: "draft", version: 3 }), replayed: true });

  const wrongMethod = await handlers?.restoreProduct(
    request(`${PRODUCTS}/${PRODUCT_ID}/restore`, { method: "PATCH", body: { expectedVersion: 2 } }), PRODUCT_ID,
  );
  assert.equal(wrongMethod?.status, 405);

  const crossTenant = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async restoreProduct() { throw new CatalogRepositoryError("product_not_found"); },
  })));
  const missing = await crossTenant?.restoreProduct(
    request(`${PRODUCTS}/${PRODUCT_ID}/restore`, { method: "POST", body: { expectedVersion: 2 } }), PRODUCT_ID,
  );
  assert.equal(missing?.status, 404);
  assert.deepEqual(await missing?.json(), { code: "product_not_found" });
});

test("finite repository errors map to safe statuses and never expose driver details", async () => {
  for (const [code, status] of [
    ["invalid_input", 400], ["membership_denied", 403], ["store_inactive", 403],
    ["feature_not_enabled", 403], ["product_not_found", 404], ["variant_not_found", 404],
    ["product_limit_reached", 409], ["slug_conflict", 409], ["sku_conflict", 409],
    ["version_conflict", 409], ["operation_mismatch", 409], ["durable_authority_invalid", 409],
    ["unavailable", 503],
  ] as const) {
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
      async createProduct() { throw new CatalogRepositoryError(code); },
    })));
    const response = await handlers?.createProduct(request(PRODUCTS, { method: "POST", body: CREATE_BODY }));
    assert.equal(response?.status, status, code);
    assert.deepEqual(await response?.json(), { code });
  }
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async createProduct() { throw new Error("SELECT secret FROM private_table connection=internal"); },
  })));
  const response = await handlers?.createProduct(request(PRODUCTS, { method: "POST", body: CREATE_BODY }));
  assert.equal(response?.status, 503);
  const body = await response?.text();
  assert.deepEqual(JSON.parse(body ?? "null"), { code: "unavailable" });
  assert.doesNotMatch(body ?? "", /SELECT|private_table|connection/i);
});

test("replayed mutations remain successful and surface only replayed=true", async () => {
  let writes = 0;
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async createProduct() {
      writes += 1;
      return { product: product(), initialVariant: variant(), replayed: true };
    },
  })));
  const response = await handlers?.createProduct(request(PRODUCTS, { method: "POST", body: CREATE_BODY }));
  assert.equal(response?.status, 201);
  assert.equal((await response?.json()).replayed, true);
  assert.equal(writes, 1);
});

test("summary GET uses authenticated TenantContext and returns only exact counts", async () => {
  const calls: unknown[] = [];
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async getDashboardSummary(input) {
      calls.push(input);
      return summary();
    },
  })));
  const response = await handlers?.getDashboardSummary(request(SUMMARY_PATH));
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("cache-control"), "no-store");
  assert.equal(response?.headers.get("location"), null);
  assert.deepEqual(await response?.json(), summary());
  assert.deepEqual(calls, [{ tenantContext: tenantContext(), now: NOW }]);
});

test("summary denies query and near-match paths before repository authority", async () => {
  let calls = 0;
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
    async getDashboardSummary() {
      calls += 1;
      return summary();
    },
  })));
  for (const path of [
    `${SUMMARY_PATH}?storeId=${STORE_ID}`,
    `${SUMMARY_PATH}/`,
    `${SUMMARY_PATH}-evil`,
  ]) {
    const response = await handlers?.getDashboardSummary(request(path));
    assert.equal(response?.status, 400);
    assert.deepEqual(await response?.json(), { code: "invalid_input" });
  }
  assert.equal(calls, 0);
});

test("summary access failures deny before repository calls", async () => {
  let calls = 0;
  const catalog = repository({
    async getDashboardSummary() {
      calls += 1;
      throw new Error("unexpected summary call");
    },
  });
  for (const [kind, status, code] of [
    ["unauthenticated", 401, "unauthenticated"],
    ["unauthorized", 403, "membership_denied"],
    ["unavailable", 503, "unavailable"],
  ] as const) {
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(catalog, access(kind)));
    const response = await handlers?.getDashboardSummary(request(SUMMARY_PATH));
    assert.equal(response?.status, status);
    assert.deepEqual(await response?.json(), { code });
  }
  const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(catalog));
  for (const cookie of [null, INVALID_COOKIE]) {
    const response = await handlers?.getDashboardSummary(request(SUMMARY_PATH, { cookie }));
    assert.equal(response?.status, 401);
    assert.deepEqual(await response?.json(), { code: "unauthenticated" });
  }
  assert.equal(calls, 0);
});

test("summary maps repository and driver failures to stable unavailable", async () => {
  for (const failure of [new CatalogRepositoryError("unavailable"), new Error("postgres secret")]) {
    const handlers = handlersModule.createCatalogHttpHandlers?.(dependencies(repository({
      async getDashboardSummary() { throw failure; },
    })));
    const response = await handlers?.getDashboardSummary(request(SUMMARY_PATH));
    assert.equal(response?.status, 503);
    const body = await response?.text();
    assert.equal(body, JSON.stringify({ code: "unavailable" }));
    assert.doesNotMatch(body ?? "", /postgres|secret|driver|sql/i);
  }
});
