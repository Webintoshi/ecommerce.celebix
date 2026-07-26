import assert from "node:assert/strict";
import test from "node:test";
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
