import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_ADMIN_RESOURCE_KINDS } from "@celebix/saas-contracts";
import { CatalogAdminApiError, createCatalogAdminApi } from "./client.ts";
const ID = "71000000-0000-4000-8000-000000000001", OP = "74000000-0000-4000-8000-000000000001", NOW = "2026-07-22T18:00:00.000Z";
function response(value: unknown, status = 200) { return Response.json(value, { status }); }
test("client gets one fixed-kind resource by exact ID", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createCatalogAdminApi(async (input, init) => {
    calls.push({ url: String(input), init });
    return response({ id: ID, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW });
  }, () => OP);
  assert.equal((await api.resource("collection", ID)).id, ID);
  assert.equal(calls[0]?.url, `/api/catalog/admin/resources/collection/${ID}`);
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(calls[0]?.init?.cache, "no-store");
  await assert.rejects(() => api.resource("collection", "../private"), TypeError);
});
test("client projects resources and binds replay-safe mutations", async () => { const calls: Array<{ url: string; init?: RequestInit }> = []; const fetcher: typeof fetch = async (input, init) => { const url = String(input); calls.push({ url, init }); if (init?.method === "POST") return response({ id: ID, version: 1, status: "active", updatedAt: NOW, replayed: false }); return response({ items: [{ id: ID, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW }] }); }; const api = createCatalogAdminApi(fetcher, () => OP); assert.equal((await api.resources("collection"))[0]?.name, "Yeni Gelenler"); await api.saveResource("collection", { name: "Yeni Gelenler", slug: "yeni-gelenler", config: {}, productIds: [] }); assert.equal(calls[1]?.url, "/api/catalog/admin/resources/collection"); assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OP); });
test("client executes review list moderation with reply and durable import reads", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/moderate")) return response({ id: ID, version: 2, status: "approved", updatedAt: NOW, replayed: false });
    if (url.includes("/reviews")) return response({ items: [{ id: ID, productId: ID, productTitle: "Ürün", reviewerName: "Ada", rating: 5, body: "Çok iyi", status: "pending", version: 1, createdAt: NOW, updatedAt: NOW }] });
    return response({ items: [{ id: ID, fileName: "urunler.csv", status: "completed", totalRows: 1, succeededRows: 1, failedRows: 0, version: 1, createdAt: NOW, updatedAt: NOW }] });
  };
  const api = createCatalogAdminApi(fetcher, () => OP);
  assert.equal((await api.reviews("pending"))[0]?.rating, 5);
  assert.equal((await api.moderateReview(ID, { expectedVersion: 1, status: "approved", reply: "Teşekkürler." })).status, "approved");
  assert.equal((await api.imports())[0]?.succeededRows, 1);
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/catalog/admin/reviews?status=pending",
    `/api/catalog/admin/reviews/${ID}/moderate`,
    "/api/catalog/admin/imports",
  ]);
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).reply, "Teşekkürler.");
  assert.equal(new Headers(calls[1]?.init?.headers).get("idempotency-key"), OP);
});
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

test("catalog resource family client executes exact CRUD for every finite resource kind", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createCatalogAdminApi(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const match = /^\/api\/catalog\/admin\/resources\/([^/]+)(?:\/([^/]+))?(?:\/archive)?$/.exec(url);
    assert.ok(match, url);
    const kind = match[1]!;
    if (init?.method !== "POST") {
      const value = { id: ID, kind, name: `${kind} fixture`, slug: `${kind}-fixture`, config: {}, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW, updatedAt: NOW };
      return response(match[2] ? value : { items: [value] });
    }
    if (url.endsWith("/archive")) return response({ id: ID, version: 3, status: "archived", updatedAt: NOW, replayed: false });
    const body = JSON.parse(String(init?.body)) as { resourceId?: string };
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
  for (const kind of CATALOG_ADMIN_RESOURCE_KINDS) {
    assert.equal(calls.some(({ url }) => url === `/api/catalog/admin/resources/${kind}/${ID}`), true, kind);
    assert.equal(calls.some(({ url }) => url === `/api/catalog/admin/resources/${kind}/${ID}/archive`), true, kind);
  }
  assert.equal(calls.every(({ init }) => init?.credentials === "same-origin" && init.cache === "no-store"), true);
});
