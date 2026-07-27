import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_ADMIN_RESOURCE_KINDS } from "@celebix/saas-contracts";
import { CatalogAdminApiError, createCatalogAdminApi } from "./client.ts";
const ID = "71000000-0000-4000-8000-000000000001", OP = "74000000-0000-4000-8000-000000000001", NOW = "2026-07-22T18:00:00.000Z";
function response(value: unknown, status = 200) { return Response.json(value, { status }); }
test("client projects resources and binds replay-safe mutations", async () => { const calls: Array<{ url: string; init?: RequestInit }> = []; const fetcher: typeof fetch = async (input, init) => { const url = String(input); calls.push({ url, init }); if (init?.method === "POST") return response({ id: ID, version: 1, status: "active", updatedAt: NOW, replayed: false }); return response({ items: [{ id: ID, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW }] }); }; const api = createCatalogAdminApi(fetcher, () => OP); assert.equal((await api.resources("collection"))[0]?.name, "Yeni Gelenler"); await api.saveResource("collection", { name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, productIds: [] }); assert.equal(calls[1]?.url, "/api/catalog/admin/resources/collection"); assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OP); });
test("client supports reviews and durable imports without accepting private fields", async () => { const fetcher: typeof fetch = async (input) => String(input).endsWith("/reviews") ? response({ items: [{ id: ID, productId: ID, productTitle: "Ürün", reviewerName: "Ada", rating: 5, body: "Çok iyi", status: "pending", version: 1, createdAt: NOW, updatedAt: NOW }] }) : response({ items: [{ id: ID, fileName: "urunler.csv", status: "completed", totalRows: 1, succeededRows: 1, failedRows: 0, version: 1, createdAt: NOW, updatedAt: NOW }] }); const api = createCatalogAdminApi(fetcher, () => OP); assert.equal((await api.reviews())[0]?.rating, 5); assert.equal((await api.imports())[0]?.succeededRows, 1); });
test("safe server errors remain finite", async () => { const api = createCatalogAdminApi(async () => response({ code: "membership_denied" }, 403), () => OP); await assert.rejects(() => api.resources("brand"), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "membership_denied" && error.status === 403); });
test("feed preview is read-only while one rich import carries one stable operation identity", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const preview = { products: [{ title: "Feed Ürün", slug: "feed-urun", status: "active", variants: [{ title: "Siyah", sku: "FEED-1", priceCents: 12990, stockQuantity: 4, attributes: { Renk: "Siyah" } }] }], warnings: [], skippedRows: 0, totalRows: 1, format: "json" } as const;
  const fetcher: typeof fetch = async (input, init) => { calls.push({ url: String(input), init }); return String(input).endsWith("/preview") ? response(preview) : response({ id: ID, version: 1, status: "completed", updatedAt: NOW, replayed: false }); };
  const api = createCatalogAdminApi(fetcher, () => OP);
  assert.deepEqual(await api.previewFeed({ provider: "generic", url: "https://feeds.example.com/products.json" }), preview);
  await api.importProducts({ fileName: "feed-generic.json", products: preview.products }, OP);
  assert.equal(calls[0]?.url, "/api/catalog/admin/imports/feed/preview");
  assert.equal(new Headers(calls[0]?.init?.headers).has("idempotency-key"), false);
  assert.equal(calls[1]?.url, "/api/catalog/admin/imports");
  assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OP);
  assert.equal(JSON.stringify(calls).includes("storeId"), false);
});
test("feed preview rejects private or malformed browser projections", async () => {
  for (const value of [
    { products: [], warnings: [], skippedRows: 0, totalRows: 0, format: "json", storeId: ID },
    { products: [{ title: "X", slug: "x", status: "active", variants: [] }], warnings: [], skippedRows: 0, totalRows: 1, format: "json" },
    { products: [{ title: "X", slug: "urun-x", status: "active", variants: [{ title: "V", priceCents: -1, stockQuantity: 1, attributes: {} }] }], warnings: [], skippedRows: 0, totalRows: 1, format: "json" },
  ]) await assert.rejects(() => createCatalogAdminApi(async () => response(value), () => OP).previewFeed({ provider: "generic", url: "https://feeds.example.com/a" }), /Katalog yönetimi şu anda kullanılamıyor/);
});

test("client gets one fixed-kind resource by exact ID", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createCatalogAdminApi(async (input, init) => {
    calls.push({ url: String(input), init });
    return response({ id: ID, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW });
  }, () => OP);
  assert.equal((await api.resource("collection", ID)).id, ID);
  assert.equal(calls[0]?.url, `/api/catalog/admin/resources/collection/${ID}`);
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  await assert.rejects(() => api.resource("collection", "../private"), TypeError);
});

test("client executes review list moderation with reply and durable import reads", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createCatalogAdminApi(async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/moderate")) return response({ id: ID, version: 2, status: "approved", updatedAt: NOW, replayed: false });
    if (url.includes("/reviews")) return response({ items: [{ id: ID, productId: ID, productTitle: "Ürün", reviewerName: "Ada", rating: 5, body: "Çok iyi", status: "pending", version: 1, createdAt: NOW, updatedAt: NOW }] });
    return response({ items: [{ id: ID, fileName: "urunler.csv", status: "completed", totalRows: 1, succeededRows: 1, failedRows: 0, version: 1, createdAt: NOW, updatedAt: NOW }] });
  }, () => OP);
  assert.equal((await api.reviews("pending"))[0]?.rating, 5);
  assert.equal((await api.moderateReview(ID, { expectedVersion: 1, status: "approved", reply: "Teşekkürler." })).status, "approved");
  assert.equal((await api.imports())[0]?.succeededRows, 1);
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).reply, "Teşekkürler.");
});

test("client binds import preview paths, operation IDs and exact response envelopes", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const preview = { id: ID, format: "shopify_csv", fileName: "products.csv", digest: "a".repeat(64), status: "prepared", rows: [{ title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5 }], totalRows: 1, version: 2, expiresAt: "2026-07-22T19:00:00.000Z", createdAt: NOW, updatedAt: NOW };
  const api = createCatalogAdminApi(async (input, init) => { calls.push({ url: String(input), init }); return init?.method === "POST" && String(input).endsWith("/commit") ? response({ id: ID, version: 3, status: "completed", updatedAt: NOW, replayed: false }) : response(preview); }, () => OP);
  assert.equal((await api.prepareImportPreview({ format: "shopify_csv", fileName: "products.csv", content: "csv" })).id, ID);
  assert.equal((await api.getImportPreview(ID)).version, 2);
  assert.equal((await api.commitImportPreview(ID, 2)).version, 3);
  assert.deepEqual(calls.map(({ url }) => url), ["/api/catalog/admin/import-previews", `/api/catalog/admin/import-previews/${ID}`, `/api/catalog/admin/import-previews/${ID}/commit`]);
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), OP);
});

test("catalog resource family client executes exact CRUD for every finite resource kind", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createCatalogAdminApi(async (input, init) => {
    const url = String(input); calls.push({ url, init });
    const match = /^\/api\/catalog\/admin\/resources\/([^/]+)(?:\/([^/]+))?(?:\/archive)?$/.exec(url); assert.ok(match, url);
    const kind = match[1]!;
    if (init?.method !== "POST") { const value = { id: ID, kind, name: `${kind} fixture`, slug: `${kind}-fixture`, config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW }; return response(match[2] ? value : { items: [value] }); }
    if (url.endsWith("/archive")) return response({ id: ID, version: 3, status: "archived", updatedAt: NOW, replayed: false });
    const body = JSON.parse(String(init.body)) as { resourceId?: string };
    return response({ id: ID, version: body.resourceId ? 2 : 1, status: "active", updatedAt: NOW, replayed: false });
  }, () => OP);
  for (const kind of CATALOG_ADMIN_RESOURCE_KINDS) {
    assert.equal((await api.resources(kind))[0]?.kind, kind);
    assert.equal((await api.resource(kind, ID)).kind, kind);
    assert.equal((await api.saveResource(kind, { name: `${kind} create`, slug: `${kind}-create`, config: {}, productIds: [] })).version, 1);
    assert.equal((await api.saveResource(kind, { resourceId: ID, expectedVersion: 1, name: `${kind} update`, slug: `${kind}-update`, config: {}, productIds: [] })).version, 2);
    assert.equal((await api.archiveResource(kind, ID, 2)).status, "archived");
  }
  assert.equal(calls.length, CATALOG_ADMIN_RESOURCE_KINDS.length * 5);
});
