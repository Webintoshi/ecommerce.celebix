import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { CatalogAdminRepositoryError, type CatalogAdminRepository } from "@celebix/saas-data";
import type { ServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";
import { createCatalogAdminHttpHandlers } from "./handler.ts";
const ORIGIN = "https://panel.saas-staging.celebix.site", OP = "74000000-0000-4000-8000-000000000001", REQ = "78000000-0000-4000-8000-000000000001", PREVIEW = "79000000-0000-4000-8000-000000000001", RESOURCE = "71000000-0000-4000-8000-000000000001", PRODUCT = "72000000-0000-4000-8000-000000000001", NOW = new Date("2026-07-22T18:00:00.000Z"), CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
function tenant(): TenantContext { return { schemaVersion: 1, requestId: REQ, principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "x" }, store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext; }
function repository(overrides: Partial<CatalogAdminRepository> = {}): CatalogAdminRepository { const reject = async () => { throw new Error("unexpected"); }; return { listResources: reject, saveResource: reject, archiveResource: reject, listReviews: reject, moderateReview: reject, listImports: reject, importProducts: reject, ...overrides } as CatalogAdminRepository; }
function runtime(catalogAdmin: CatalogAdminRepository): ServerCatalogAdminRuntime { return { catalogAdmin, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as ServerCatalogAdminRuntime; }
function request(path: string, method = "GET", value?: unknown, origin = ORIGIN, headers?: HeadersInit) { const prepared = new Headers(headers); prepared.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`); if (method === "POST") { prepared.set("origin", origin); prepared.set("content-type", "application/json"); prepared.set("idempotency-key", OP); } return new Request(`http://internal:3400${path}`, { method, headers: prepared, body: value === undefined ? undefined : JSON.stringify(value) }); }
function handlers(catalogAdmin: CatalogAdminRepository) { return createCatalogAdminHttpHandlers({ async resolveRuntime() { return runtime(catalogAdmin); }, now: () => new Date(NOW), requestId: () => REQ }); }
test("resource detail GET binds exact kind and ID and rejects near paths and request authority", async () => {
  const calls: unknown[] = [];
  const h = handlers(repository({ async getResource(input) {
    calls.push(input);
    return { id: RESOURCE, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [PRODUCT], productCount: 1, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  } }));
  assert.equal((await h.resource(request(`/api/catalog/admin/resources/collection/${RESOURCE}`), "collection", RESOURCE)).status, 200);
  assert.equal((await h.resource(request(`/api/catalog/admin/resources/collection/${RESOURCE}?x=1`), "collection", RESOURCE)).status, 400);
  assert.equal((await h.resource(request(`/api/catalog/admin/resources/collection/${RESOURCE}`, "GET", undefined, ORIGIN, { "x-store-id": RESOURCE }), "collection", RESOURCE)).status, 400);
  assert.equal((await h.resource(request(`/api/catalog/admin/resources/brand/${RESOURCE}`), "collection", RESOURCE)).status, 400);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { tenantContext: tenant(), now: NOW, kind: "collection", resourceId: RESOURCE });
});
test("resource reads and writes receive only the server TenantContext", async () => { const calls: unknown[] = []; const h = handlers(repository({ async listResources(input) { calls.push(input); return [{ id: RESOURCE, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [PRODUCT], productCount: 1, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }]; }, async saveResource(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "active", updatedAt: NOW.toISOString(), replayed: false }; } })); assert.equal((await h.resources(request("/api/catalog/admin/resources/collection"), "collection")).status, 200); assert.equal((await h.saveResource(request("/api/catalog/admin/resources/collection", "POST", { name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, productIds: [PRODUCT] }), "collection")).status, 200); assert.equal(calls.length, 2); assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenant()); assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false); });
test("imports are bounded and exact-origin while private authority fails closed", async () => { const calls: unknown[] = []; const h = handlers(repository({ async importProducts(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "completed", updatedAt: NOW.toISOString(), replayed: false }; } })); const body = { fileName: "urunler.csv", rows: [{ title: "Yeni Ürün", slug: "yeni-urun", priceCents: 12900, sku: "YENI-1", stockQuantity: 8 }] }; assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", body))).status, 200); assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", body, "https://attacker.test"))).status, 403); assert.equal((await h.imports(request("/api/catalog/admin/imports", "GET", undefined, ORIGIN, { "x-store-id": RESOURCE }))).status, 400); assert.equal(calls.length, 1); });
test("missing session, near-match paths and disabled runtime fail closed", async () => { const h = handlers(repository()); assert.equal((await h.resources(new Request("http://internal/api/catalog/admin/resources/collection"), "collection")).status, 401); assert.equal((await h.resources(request("/api/catalog/admin/resources/collection-child"), "collection")).status, 400); const disabled = createCatalogAdminHttpHandlers({ async resolveRuntime() { return null; }, now: () => NOW, requestId: () => REQ }); assert.equal((await disabled.imports(request("/api/catalog/admin/imports"))).status, 503); });

function preview() { return { id: PREVIEW, format: "native_csv" as const, fileName: "urunler.csv", digest: "a".repeat(64), status: "prepared" as const, rows: [{ title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5 }], totalRows: 1, version: 3, expiresAt: "2026-07-22T19:00:00.000Z", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }; }

test("import preview prepare, read and versioned commit bind exact server authority", async () => {
  const calls: unknown[] = [];
  const catalogAdmin = repository({
    async prepareImport(input) { calls.push(input); return preview(); },
    async getImportPreview(input) { calls.push(input); return preview(); },
    async commitImportPreview(input) { calls.push(input); return { id: PREVIEW, version: 4, status: "completed", updatedAt: NOW.toISOString(), replayed: false }; },
  });
  let requestIds = 0;
  const h = createCatalogAdminHttpHandlers({ async resolveRuntime() { return runtime(catalogAdmin); }, now: () => new Date(NOW), requestId: () => requestIds++ === 0 ? REQ : PREVIEW });
  const content = "title,slug,priceCents,sku,stockQuantity\nKahve,kahve,25000,KHV-1,5";
  const prepared = await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", { format: "native_csv", fileName: "urunler.csv", content }));
  assert.equal(prepared.status, 200);
  assert.equal(JSON.stringify(calls).includes(content), false);
  assert.deepEqual(calls[0], { tenantContext: tenant(), now: NOW, operationId: OP, previewId: PREVIEW, format: "native_csv", fileName: "urunler.csv", digest: "fa26af5d2420d82db10892cb0891a0e362c047d646ad158f6b6699084a5b64a7", rows: preview().rows });
  assert.equal(JSON.stringify(await prepared.json()).includes(content), false);
  assert.equal((await h.getImportPreview(request(`/api/catalog/admin/import-previews/${PREVIEW}`), PREVIEW)).status, 200);
  assert.equal((await h.commitImportPreview(request(`/api/catalog/admin/import-previews/${PREVIEW}/commit`, "POST", { expectedVersion: 3 }), PREVIEW)).status, 200);
  assert.deepEqual(calls[2], { tenantContext: tenant(), now: NOW, operationId: OP, previewId: PREVIEW, expectedVersion: 3 });
});

test("import preview routes reject request authority and malformed bodies before repository access", async () => {
  let calls = 0;
  const h = handlers(repository({ async prepareImport() { calls += 1; return preview(); } }));
  const value = { format: "native_csv", fileName: "urunler.csv", content: "title,slug,priceCents,sku,stockQuantity\nKahve,kahve,25000,KHV-1,5" };
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-previews?x=1", "POST", value))).status, 400);
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-preview", "POST", value))).status, 400);
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", value, "https://attacker.test"))).status, 403);
  assert.equal((await h.prepareImportPreview(new Request("http://internal:3400/api/catalog/admin/import-previews", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "idempotency-key": OP }, body: JSON.stringify(value) }))).status, 401);
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", value, ORIGIN, { "x-store-id": RESOURCE }))).status, 400);
  const wrongType = request("/api/catalog/admin/import-previews", "POST", value); wrongType.headers.set("content-type", "application/json; charset=utf-8");
  assert.equal((await h.prepareImportPreview(wrongType)).status, 400);
  const tooLarge = request("/api/catalog/admin/import-previews", "POST", value); tooLarge.headers.set("content-length", "131073");
  assert.equal((await h.prepareImportPreview(tooLarge)).status, 400);
  const invalidUtf8 = new Request("http://internal:3400/api/catalog/admin/import-previews", { method: "POST", headers: { cookie: `__Host-celebix_panel=${CREDENTIAL}`, origin: ORIGIN, "content-type": "application/json", "idempotency-key": OP }, body: new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]) });
  assert.equal((await h.prepareImportPreview(invalidUtf8)).status, 400);
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", { ...value, private: true }))).status, 400);
  assert.equal((await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", { ...value, format: "provider_csv" }))).status, 400);
  assert.equal((await h.getImportPreview(request(`/api/catalog/admin/import-previews/${PREVIEW}`, "POST", {}), PREVIEW)).status, 405);
  assert.equal(calls, 0);
});

test("wrong-store previews stay repository-owned 404s", async () => {
  const h = handlers(repository({ async getImportPreview() { throw new CatalogAdminRepositoryError("resource_not_found"); } }));
  const result = await h.getImportPreview(request(`/api/catalog/admin/import-previews/${PREVIEW}`), PREVIEW);
  assert.equal(result.status, 404);
  assert.deepEqual(await result.json(), { code: "resource_not_found" });
});

test("prepare rejects out-of-contract native and Shopify slug bounds without repository access", async () => {
  let calls = 0;
  const h = handlers(repository({ async prepareImport() { calls += 1; return preview(); } }));
  const examples = [
    { format: "native_csv", content: `title,slug,priceCents,sku,stockQuantity\nKahve,aa,25000,KHV-1,5` },
    { format: "native_csv", content: `title,slug,priceCents,sku,stockQuantity\nKahve,${"a".repeat(101)},25000,KHV-1,5` },
    { format: "shopify_csv", content: `Handle,Title,Variant SKU,Variant Price,Variant Inventory Qty\naa,Kahve,KHV-1,250.00,5` },
    { format: "shopify_csv", content: `Handle,Title,Variant SKU,Variant Price,Variant Inventory Qty\n${"a".repeat(101)},Kahve,KHV-1,250.00,5` },
  ];
  for (const example of examples) {
    const result = await h.prepareImportPreview(request("/api/catalog/admin/import-previews", "POST", { ...example, fileName: "urunler.csv" }));
    assert.equal(result.status, 400);
  }
  assert.equal(calls, 0);
});
