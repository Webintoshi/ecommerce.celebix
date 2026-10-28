import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogApiClient, CatalogApiError } from "../../../../../../apps/customer-panel/lib/catalog-ui/client.ts";
import { createCatalogOnboardingClient } from "../../../../../../apps/customer-panel/lib/catalog-onboarding-ui/client.ts";
import { createProductOrderClient } from "../../../../../../apps/customer-panel/lib/catalog-ui/product-order-client.ts";
import { createProductsFixtureTransport, createProductsFixtureFetchBridge } from "./transport.ts";

const origin = "http://127.0.0.1:3547";
const operationId = "ac100000-0000-4000-8000-000000000001";
const make = (state: Parameters<typeof createProductsFixtureTransport>[0]["state"] = "loaded") => {
  const transport = createProductsFixtureTransport({ state, origin });
  return { transport, api: createCatalogApiClient({ fetch: transport.fetch }), onboarding: createCatalogOnboardingClient({ fetch: transport.fetch }) };
};

test("synthetic catalog counts, options and variant summaries pass the real clients", async () => {
  const { api, onboarding, transport } = make();
  const [summary, page, options] = await Promise.all([api.getDashboardSummary(), api.listProducts(), onboarding.getOptions()]);
  assert.equal(summary.totalProducts, 106);
  assert.equal(summary.activeProducts, 70);
  assert.equal(summary.draftProducts, 36);
  assert.equal(summary.productsWithoutMedia, 106);
  assert.equal(summary.activeMedia, 0);
  assert.equal(page.items.length, 20);
  assert.equal(page.catalogTotal, 106);
  assert.equal(Object.keys(page.variantSummaries ?? {}).length, 20);
  assert.deepEqual(page.featuredImages, {});
  assert.ok(page.items.every(item => item.title.startsWith("Örnek ")));
  assert.equal(options.categories.length, 3);
  assert.equal(options.resources.filter(item => item.kind === "brand").length, 2);
  assert.equal(options.resources.filter(item => item.kind === "collection").length, 2);
  assert.equal(transport.snapshot().liveWrites, false);
});

test("every page size has deterministic next pages without duplicates", async () => {
  for (const pageSize of [20, 50, 100] as const) {
    const { api } = make();
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pageCount = 0;
    do {
      const page = await api.listProducts({ pageSize, ...(cursor ? { cursor } : {}) });
      assert.ok(page.items.length <= pageSize);
      for (const item of page.items) { assert.equal(seen.has(item.id), false); seen.add(item.id); }
      cursor = page.nextCursor;
      pageCount += 1;
    } while (cursor);
    assert.equal(seen.size, 106);
    assert.equal(pageCount, Math.ceil(106 / pageSize));
  }
});

test("search, sorting and all global filters change the actual result set", async () => {
  const { api, onboarding, transport } = make();
  const options = await onboarding.getOptions();
  const first = await api.listProducts({ sort: "title-asc" });
  const product = first.items[0];
  const sku = first.variantSummaries![product.id].sku!;
  assert.equal((await api.listProducts({ search: sku })).items[0].id, product.id);
  assert.equal((await api.listProducts({ search: product.slug })).items[0].id, product.id);
  assert.equal((await api.listProducts({ search: transport.snapshot().records.find(row => row.product.id === product.id)!.barcode })).items[0].id, product.id);
  assert.equal((await api.listProducts({ search: "bulunmayan-senaryo" })).items.length, 0);
  assert.equal((await api.listProducts({ status: "active", pageSize: 100 })).items.length, 70);
  assert.equal((await api.listProducts({ status: "draft", pageSize: 100 })).items.length, 36);
  assert.equal((await api.listProducts({ status: "archived", pageSize: 100 })).items.length, 17);
  for (const stock of ["in-stock", "out-of-stock", "untracked"] as const) {
    const page = await api.listProducts({ stock, pageSize: 100 });
    assert.ok(page.items.length > 0 && page.items.length < 106);
    assert.ok(page.items.every(item => {
      const variant = page.variantSummaries![item.id];
      return stock === "untracked" ? !variant.stockTracking : variant.stockTracking && (stock === "in-stock" ? variant.stockQuantity > 0 : variant.stockQuantity === 0);
    }));
  }
  for (const query of [{ categoryId: options.categories[0].id }, { brandId: options.resources.find(item => item.kind === "brand")!.id }, { collectionId: options.resources.find(item => item.kind === "collection")!.id }]) {
    const filtered = await api.listProducts({ ...query, pageSize: 100 });
    assert.ok(filtered.items.length > 0 && filtered.items.length < 106);
  }
  const ascending = await api.listProducts({ sort: "title-asc", pageSize: 100 });
  const descending = await api.listProducts({ sort: "title-desc", pageSize: 100 });
  assert.notEqual(ascending.items[0].id, descending.items[0].id);
  assert.equal((await api.listProducts({ sort: "created-asc" })).items[0].slug, "ornek-urun-001");
  assert.equal((await api.listProducts({ sort: "created-desc" })).items[0].slug, "ornek-urun-123");
});

test("status, archive, restore and confirmed permanent deletion change memory only", async () => {
  const { api, transport } = make();
  const product = (await api.listProducts({ status: "active" })).items[0];
  const draft = await api.setProductStatus(product.id, product.version, "draft");
  assert.equal(draft.product.status, "draft");
  await assert.rejects(api.archiveProduct(product.id, product.version), error => error instanceof CatalogApiError && error.code === "version_conflict");
  const archived = await api.archiveProduct(product.id, draft.product.version);
  assert.equal(archived.product.status, "archived");
  const restored = await api.restoreProduct(product.id, archived.product.version);
  assert.equal(restored.product.status, "draft");
  const impact = await api.getProductDeletionImpact(product.id);
  assert.equal(impact.expectedVersion, restored.product.version);
  assert.equal(impact.effects.find(effect => effect.kind === "variants")?.count, 1);
  const deleted = await api.deleteProduct(product.id, { operationId, expectedVersion: impact.expectedVersion, confirmation: impact.confirmationLabel });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.auditId, operationId);
  const replay = await api.deleteProduct(product.id, { operationId, expectedVersion: impact.expectedVersion, confirmation: impact.confirmationLabel });
  assert.equal(replay.replayed, true);
  assert.equal(transport.snapshot().records.some(row => row.product.id === product.id), false);
  assert.equal((await api.getDashboardSummary()).totalProducts, 105);
  assert.equal(transport.snapshot().liveWrites, false);
});

test("bulk changes validate every target before changing any record", async () => {
  const { api, transport } = make();
  const products = (await api.listProducts()).items.slice(0, 2);
  await assert.rejects(api.bulkMutateProducts({ action: "draft", targets: products.map((item, index) => ({ productId: item.id, expectedVersion: item.version + index })) }), error => error instanceof CatalogApiError && error.code === "version_conflict");
  assert.equal(transport.snapshot().records.find(row => row.product.id === products[0].id)!.product.version, products[0].version);
  const result = await api.bulkMutateProducts({ action: "archive", targets: products.map(item => ({ productId: item.id, expectedVersion: item.version })) });
  assert.equal(result.products.length, 2);
  assert.ok(result.products.every(item => item.status === "archived"));
  assert.equal((await api.getDashboardSummary()).totalProducts, 104);
});

test("category ordering persists exact membership and rejects a stale version", async () => {
  const { transport, onboarding } = make();
  const orderApi = createProductOrderClient(transport.fetch);
  const category = (await onboarding.getOptions()).categories[0];
  const order = await orderApi.get(category.id);
  assert.ok(order.items.length > 1);
  const ids = order.items.map(item => item.productId).reverse();
  const saved = await orderApi.save(category.id, order.version, ids);
  assert.equal(saved.version, order.version + 1);
  assert.deepEqual((await orderApi.get(category.id)).items.map(item => item.productId), ids);
  await assert.rejects(orderApi.save(category.id, order.version, ids), /Kategori sizden önce değişti/);
});

test("empty, load-error, readonly and reconciliation-error scenarios are deterministic", async () => {
  const empty = make("empty");
  assert.equal((await empty.api.listProducts()).items.length, 0);
  assert.equal((await empty.api.getDashboardSummary()).totalProducts, 0);
  const failed = make("error");
  await assert.rejects(failed.api.listProducts(), CatalogApiError);
  failed.transport.recover();
  assert.equal((await failed.api.listProducts()).items.length, 20);
  const readonly = make("readonly");
  const item = (await readonly.api.listProducts()).items[0];
  await assert.rejects(readonly.api.archiveProduct(item.id, item.version), error => error instanceof CatalogApiError && error.code === "membership_denied");
  const stale = make("reconciliation-error");
  const current = (await stale.api.listProducts()).items[0];
  await stale.api.setProductStatus(current.id, current.version, current.status === "active" ? "draft" : "active");
  await assert.rejects(stale.api.listProducts(), CatalogApiError);
  stale.transport.recover();
  assert.equal((await stale.api.listProducts()).items[0].version, current.version + 1);
});

test("unknown paths, origins, methods and query keys fail closed without a fallback", async () => {
  const { transport } = make();
  for (const input of ["https://example.com/api/catalog/summary", "/api/unknown", "/api/catalog/products/v2?limit=20&other=1", "/api/session/logout", "/api/catalog/products/ac200000-0000-4000-8000-000000999999/deletion-impact"]) assert.equal((await transport.fetch(input)).status, 403);
  assert.equal((await transport.fetch("/api/catalog/summary", { method: "POST" })).status, 403);
  assert.equal((await transport.fetch("/api/catalog/products/v2?limit=20&limit=50")).status, 403);
});

test("Request inputs retain mutation headers and body while init overrides are honored", async () => {
  const { api, transport } = make();
  const item = (await api.listProducts()).items[0];
  const request = new Request(`${origin}/api/catalog/products/${item.id}/archive`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify({ expectedVersion: item.version }),
  });
  assert.equal((await transport.fetch(request)).status, 200);
  assert.equal(transport.snapshot().records.find(row => row.product.id === item.id)!.product.status, "archived");
  const summary = new Request(`${origin}/api/catalog/summary`, { method: "POST" });
  assert.equal((await transport.fetch(summary, { method: "GET" })).status, 200);
});

test("option, ranking and deletion-impact errors recover without changing memory", async () => {
  for (const state of ["options-error", "rank-error", "delete-error"] as const) {
    const { transport, api } = make(state);
    const path = state === "options-error" ? "/api/catalog/onboarding/options" : state === "rank-error" ? "/api/catalog/onboarding/categories/ac300000-0000-4000-8000-000000000001/product-order" : `/api/catalog/products/${(await api.listProducts()).items[0].id}/deletion-impact`;
    assert.equal((await transport.fetch(path)).status, 503);
    transport.recover();
    assert.equal((await transport.fetch(path)).status, 200);
    assert.equal(transport.snapshot().localWrites, 0);
  }
});

test("captured fetch survives a Strict Mode release and reactivation while unknown requests stay blocked", async () => {
  let assetReads = 0;
  const bridge = createProductsFixtureFetchBridge({ origin, frameworkFetch: async () => { assetReads += 1; return new Response("local framework"); } });
  const transport = make().transport;
  const releaseFirst = bridge.activate(transport);
  const capturedFetch = bridge.fetch;
  releaseFirst();
  assert.equal((await capturedFetch("/api/catalog/summary")).status, 403);
  const releaseSecond = bridge.activate(transport);
  assert.equal((await capturedFetch("/api/catalog/summary")).status, 200);
  assert.equal((await capturedFetch("https://example.com/_next/chunk.js")).status, 403);
  assert.equal((await capturedFetch("/_next/image?url=https://example.com/image.png")).status, 403);
  assert.equal((await capturedFetch("/unknown")).status, 403);
  assert.equal((await capturedFetch("/_next/static/local.js")).status, 200);
  assert.equal(assetReads, 1);
  releaseFirst();
  assert.equal((await capturedFetch("/api/catalog/summary")).status, 200);
  releaseSecond();
});

test("loading requests release only through the fixture and honor cancellation", async () => {
  const { transport } = make("loading");
  const controller = new AbortController();
  const aborted = transport.fetch("/api/catalog/products/v2?limit=20", { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, error => error instanceof DOMException && error.name === "AbortError");
  const pending = transport.fetch("/api/catalog/summary");
  transport.recover();
  assert.equal((await pending).status, 200);
});
