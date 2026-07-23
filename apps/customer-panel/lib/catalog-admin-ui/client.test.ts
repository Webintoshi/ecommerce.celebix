import assert from "node:assert/strict";
import test from "node:test";
import { CatalogAdminApiError, createCatalogAdminApi } from "./client.ts";
const ID = "71000000-0000-4000-8000-000000000001", OP = "74000000-0000-4000-8000-000000000001", NOW = "2026-07-22T18:00:00.000Z";
function response(value: unknown, status = 200) { return Response.json(value, { status }); }
test("client projects resources and binds replay-safe mutations", async () => { const calls: Array<{ url: string; init?: RequestInit }> = []; const fetcher: typeof fetch = async (input, init) => { const url = String(input); calls.push({ url, init }); if (init?.method === "POST") return response({ id: ID, version: 1, status: "active", updatedAt: NOW, replayed: false }); return response({ items: [{ id: ID, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW }] }); }; const api = createCatalogAdminApi(fetcher, () => OP); assert.equal((await api.resources("collection"))[0]?.name, "Yeni Gelenler"); await api.saveResource("collection", { name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, productIds: [] }); assert.equal(calls[1]?.url, "/api/catalog/admin/resources/collection"); assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OP); });
test("client supports reviews and durable imports without accepting private fields", async () => { const fetcher: typeof fetch = async (input) => String(input).endsWith("/reviews") ? response({ items: [{ id: ID, productId: ID, productTitle: "Ürün", reviewerName: "Ada", rating: 5, body: "Çok iyi", status: "pending", version: 1, createdAt: NOW, updatedAt: NOW }] }) : response({ items: [{ id: ID, fileName: "urunler.csv", status: "completed", totalRows: 1, succeededRows: 1, failedRows: 0, version: 1, createdAt: NOW, updatedAt: NOW }] }); const api = createCatalogAdminApi(fetcher, () => OP); assert.equal((await api.reviews())[0]?.rating, 5); assert.equal((await api.imports())[0]?.succeededRows, 1); });
test("safe server errors remain finite", async () => { const api = createCatalogAdminApi(async () => response({ code: "membership_denied" }, 403), () => OP); await assert.rejects(() => api.resources("brand"), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "membership_denied" && error.status === 403); });
test("server error envelopes must be exact", async () => { const api = createCatalogAdminApi(async () => response({ code: "membership_denied", detail: "secret" }, 403), () => OP); await assert.rejects(() => api.resources("brand"), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable" && error.status === 403); });

test("client binds import preview paths, operation IDs and exact response envelopes", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const preview = { id: ID, format: "shopify_csv", fileName: "products.csv", digest: "a".repeat(64), status: "prepared", rows: [{ title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5 }], totalRows: 1, version: 2, expiresAt: "2026-07-22T19:00:00.000Z", createdAt: NOW, updatedAt: NOW };
  const fetcher: typeof fetch = async (input, init) => { calls.push({ url: String(input), init }); return init?.method === "POST" && String(input).endsWith("/commit") ? response({ id: ID, version: 3, status: "completed", updatedAt: NOW, replayed: false }) : response(preview); };
  const api = createCatalogAdminApi(fetcher, () => OP);
  assert.equal((await api.prepareImportPreview({ format: "shopify_csv", fileName: "products.csv", content: "csv" })).id, ID);
  assert.equal((await api.getImportPreview(ID)).version, 2);
  assert.equal((await api.commitImportPreview(ID, 2)).version, 3);
  assert.deepEqual(calls.map((call) => call.url), ["/api/catalog/admin/import-previews", `/api/catalog/admin/import-previews/${ID}`, `/api/catalog/admin/import-previews/${ID}/commit`]);
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), OP);
  assert.equal(calls[2]?.init?.body, JSON.stringify({ expectedVersion: 2 }));
});

test("client forwards abort signals and rejects non-exact preview envelopes", async () => {
  const controller = new AbortController();
  let received: AbortSignal | null | undefined;
  const api = createCatalogAdminApi(async (_input, init) => { received = init?.signal; return response({ id: ID, format: "native_csv", fileName: "x.csv", digest: "a".repeat(64), status: "prepared", rows: [], totalRows: 0, version: 1, expiresAt: NOW, createdAt: NOW, updatedAt: NOW, rawCsv: "secret" }); }, () => OP);
  await assert.rejects(() => api.getImportPreview(ID, controller.signal), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable");
  assert.equal(received, controller.signal);
});

test("client maps malformed commit envelopes to finite unavailable errors", async () => {
  const api = createCatalogAdminApi(async () => response({ id: ID, version: 3, status: "completed", updatedAt: NOW, replayed: false, rawCsv: "secret" }), () => OP);
  await assert.rejects(() => api.commitImportPreview(ID, 2), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable");
});

test("prepare, get and commit preserve native AbortError during response body consumption", async () => {
  const operations = [
    (api: ReturnType<typeof createCatalogAdminApi>, signal: AbortSignal) => api.prepareImportPreview({ format: "native_csv", fileName: "x.csv", content: "csv" }, signal),
    (api: ReturnType<typeof createCatalogAdminApi>, signal: AbortSignal) => api.getImportPreview(ID, signal),
    (api: ReturnType<typeof createCatalogAdminApi>, signal: AbortSignal) => api.commitImportPreview(ID, 2, signal),
  ];
  for (const operation of operations) {
    const controller = new AbortController();
    let bodyStarted!: () => void;
    const consuming = new Promise<void>((resolve) => { bodyStarted = resolve; });
    const api = createCatalogAdminApi(async (_input, init) => {
      const response = new Response("{}", { headers: { "content-type": "application/json" } });
      Object.defineProperty(response, "json", { value: async () => {
        bodyStarted();
        return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
      } });
      return response;
    }, () => OP);
    const pending = operation(api, controller.signal);
    await consuming;
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error === controller.signal.reason && error instanceof DOMException && error.name === "AbortError");
  }
});

test("non-abort response JSON failures remain controlled unavailable errors", async () => {
  const api = createCatalogAdminApi(async () => new Response("{", { headers: { "content-type": "application/json" } }), () => OP);
  await assert.rejects(() => api.getImportPreview(ID), (error: unknown) => error instanceof CatalogAdminApiError && error.code === "unavailable" && error.status === 503);
});
