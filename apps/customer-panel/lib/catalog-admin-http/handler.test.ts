import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import type { CatalogAdminRepository } from "@celebix/saas-data";
import type { ServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";
import { createCatalogAdminHttpHandlers } from "./handler.ts";
const ORIGIN = "https://panel.saas-staging.celebix.site", OP = "74000000-0000-4000-8000-000000000001", REQ = "78000000-0000-4000-8000-000000000001", RESOURCE = "71000000-0000-4000-8000-000000000001", PRODUCT = "72000000-0000-4000-8000-000000000001", NOW = new Date("2026-07-22T18:00:00.000Z"), CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
function tenant(): TenantContext { return { schemaVersion: 1, requestId: REQ, principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "x" }, store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext; }
function repository(overrides: Partial<CatalogAdminRepository> = {}): CatalogAdminRepository { const reject = async () => { throw new Error("unexpected"); }; return { listResources: reject, saveResource: reject, archiveResource: reject, listReviews: reject, moderateReview: reject, listImports: reject, importProducts: reject, importProductsV2: reject, authorizeFeedPreview: reject, ...overrides } as CatalogAdminRepository; }
function runtime(catalogAdmin: CatalogAdminRepository): ServerCatalogAdminRuntime { return { catalogAdmin, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as ServerCatalogAdminRuntime; }
function request(path: string, method = "GET", value?: unknown, origin = ORIGIN, headers?: HeadersInit) { const prepared = new Headers(headers); prepared.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`); if (method === "POST") { prepared.set("origin", origin); prepared.set("content-type", "application/json"); prepared.set("idempotency-key", OP); } return new Request(`http://internal:3400${path}`, { method, headers: prepared, body: value === undefined ? undefined : JSON.stringify(value) }); }
function handlers(catalogAdmin: CatalogAdminRepository, fetchFeed?: (url: string) => Promise<Readonly<{ mediaType: "csv" | "json" | "xml"; body: string }>>) { return createCatalogAdminHttpHandlers({ async resolveRuntime() { return runtime(catalogAdmin); }, now: () => new Date(NOW), requestId: () => REQ, ...(fetchFeed ? { fetchFeed } : {}) }); }
test("resource reads and writes receive only the server TenantContext", async () => { const calls: unknown[] = []; const h = handlers(repository({ async listResources(input) { calls.push(input); return [{ id: RESOURCE, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [PRODUCT], productCount: 1, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }]; }, async saveResource(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "active", updatedAt: NOW.toISOString(), replayed: false }; } })); assert.equal((await h.resources(request("/api/catalog/admin/resources/collection"), "collection")).status, 200); assert.equal((await h.saveResource(request("/api/catalog/admin/resources/collection", "POST", { name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, productIds: [PRODUCT] }), "collection")).status, 200); assert.equal(calls.length, 2); assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenant()); assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false); });
test("imports are bounded and exact-origin while private authority fails closed", async () => { const calls: unknown[] = []; const h = handlers(repository({ async importProducts(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "completed", updatedAt: NOW.toISOString(), replayed: false }; } })); const body = { fileName: "urunler.csv", rows: [{ title: "Yeni Ürün", slug: "yeni-urun", priceCents: 12900, sku: "YENI-1", stockQuantity: 8 }] }; assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", body))).status, 200); assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", body, "https://attacker.test"))).status, 403); assert.equal((await h.imports(request("/api/catalog/admin/imports", "GET", undefined, ORIGIN, { "x-store-id": RESOURCE }))).status, 400); assert.equal(calls.length, 1); });
test("rich imports select v2 and preserve nested variants without accepting browser authority", async () => {
  const calls: unknown[] = [];
  const h = handlers(repository({ async importProductsV2(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "completed", updatedAt: NOW.toISOString(), replayed: false }; } }));
  const value = { fileName: "shopify.csv", products: [{ title: "Deri Kordon", slug: "deri-kordon", description: "El yapımı", status: "active", variants: [{ title: "Siyah", sku: "DK-SYH", barcode: "8680000000001", priceCents: 149900, compareAtCents: 169900, costCents: 60000, stockQuantity: 15, attributes: { Renk: "Siyah" } }] }] };
  assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", value))).status, 200);
  assert.equal((await h.importProducts(request("/api/catalog/admin/imports", "POST", { ...value, storeId: RESOURCE }))).status, 400);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenant());
});
test("imports reject product slugs outside the durable catalog contract before repository access", async () => {
  const calls: unknown[] = [];
  const h = handlers(repository({ async importProducts(input) { calls.push(input); return { id: RESOURCE, version: 1, status: "completed", updatedAt: NOW.toISOString(), replayed: false }; } }));
  for (const slug of ["x", "ab", "a".repeat(101)]) {
    const response = await h.importProducts(request("/api/catalog/admin/imports", "POST", { fileName: "urunler.csv", rows: [{ title: "Yeni Ürün", slug, priceCents: 12900, stockQuantity: 8 }] }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 0);
});
test("feed preview authorizes in PostgreSQL before network and returns only canonical products", async () => {
  const order: string[] = [];
  const h = handlers(repository({ async authorizeFeedPreview(input) { order.push("authority"); assert.deepEqual(input.tenantContext, tenant()); } }), async (url) => { order.push("network"); assert.equal(url, "https://feeds.example.com/products.json"); return { mediaType: "json", body: JSON.stringify({ products: [{ name: "Feed Ürün", slug: "feed-urun", price: "129.90", sku: "FEED-1", stock: 4 }] }) }; });
  const response = await h.previewFeed(request("/api/catalog/admin/imports/feed/preview", "POST", { provider: "generic", url: "https://feeds.example.com/products.json" }));
  assert.equal(response.status, 200);
  const value = await response.json() as Record<string, unknown>;
  assert.deepEqual(order, ["authority", "network"]);
  assert.equal(JSON.stringify(value).includes("feeds.example.com"), false);
  assert.deepEqual(value, { products: [{ title: "Feed Ürün", slug: "feed-urun", status: "draft", variants: [{ title: "Varsayılan", sku: "FEED-1", priceCents: 12990, stockQuantity: 4, attributes: {} }] }], warnings: [], skippedRows: 0, totalRows: 1, format: "json" });
});
test("feed preview rejects authority, provider and private input before network", async () => {
  let network = 0;
  const h = handlers(repository({ async authorizeFeedPreview() { throw new Error("denied"); } }), async () => { network += 1; return { mediaType: "csv", body: "x" }; });
  assert.equal((await h.previewFeed(request("/api/catalog/admin/imports/feed/preview", "POST", { provider: "generic", url: "https://feeds.example.com/a.csv" }))).status, 503);
  assert.equal((await h.previewFeed(request("/api/catalog/admin/imports/feed/preview", "POST", { provider: "unknown", url: "https://feeds.example.com/a.csv" }))).status, 400);
  assert.equal((await h.previewFeed(request("/api/catalog/admin/imports/feed/preview", "POST", { provider: "generic", url: "https://feeds.example.com/a.csv", storeId: RESOURCE }))).status, 400);
  assert.equal((await h.previewFeed(request("/api/catalog/admin/imports/feed/preview", "POST", { provider: "generic", url: "https://feeds.example.com/a.csv" }, "https://attacker.test"))).status, 403);
  assert.equal(network, 0);
});
test("missing session, near-match paths and disabled runtime fail closed", async () => { const h = handlers(repository()); assert.equal((await h.resources(new Request("http://internal/api/catalog/admin/resources/collection"), "collection")).status, 401); assert.equal((await h.resources(request("/api/catalog/admin/resources/collection-child"), "collection")).status, 400); const disabled = createCatalogAdminHttpHandlers({ async resolveRuntime() { return null; }, now: () => NOW, requestId: () => REQ }); assert.equal((await disabled.imports(request("/api/catalog/admin/imports"))).status, 503); });
