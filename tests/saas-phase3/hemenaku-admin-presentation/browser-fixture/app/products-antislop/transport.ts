import { parseCatalogBulkProductIntent } from "@celebix/saas-contracts";
import { createFixtureProducts, FIXTURE_NOW, OPTIONS, type FixtureProductRecord } from "./data.ts";

export const PRODUCT_SCENARIOS = ["loaded", "rich", "empty", "error", "loading", "readonly", "stale", "reconciliation-error", "mutation-error", "options-error", "rank-error", "delete-error"] as const;
export type ProductsScenario = typeof PRODUCT_SCENARIOS[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LIST_PATH = "/api/catalog/products/v2";
const SUMMARY_PATH = "/api/catalog/summary";
const OPTIONS_PATH = "/api/catalog/onboarding/options";
const BULK_PATH = "/api/catalog/products/bulk";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-celebix-local-fixture": "products-antislop" } });
const denied = () => json({ code: "membership_denied" }, 403);

/** This transport owns memory only; it has no native fetch or server fallback. */
export function createProductsFixtureTransport({ state, origin }: { state: ProductsScenario; origin: string }) {
  let records = state === "empty" ? [] : createFixtureProducts();
  const knownProductIds = new Set(records.map(row => row.product.id));
  let recovered = false;
  let reconciliationFailed = false;
  let writes = 0;
  let blocked = 0;
  let failures = 0;
  const calls: { method: string; path: string; query: string; status: number }[] = [];
  const listeners = new Set<() => void>();
  const pending = new Set<() => void>();
  const operations = new Map<string, { fingerprint: string; result: unknown }>();
  const orders = new Map<string, { version: number; ids: string[] }>();
  const notify = () => listeners.forEach(listener => listener());
  const respond = (call: typeof calls[number], value: unknown, status = 200) => {
    call.status = status;
    if (status >= 400) failures += 1;
    notify();
    return json(value, status);
  };
  const fail = (call: typeof calls[number], code = "invalid_input", status = 400) => respond(call, { code }, status);
  const block = (call: typeof calls[number]) => { blocked += 1; return fail(call, "membership_denied", 403); };
  const liveRecords = () => records.filter(row => row.product.status !== "archived");
  const categoryRows = (categoryId: string) => liveRecords().filter(row => row.categoryId === categoryId || OPTIONS.categories.find(category => category.id === row.categoryId)?.parentId === categoryId);
  const orderFor = (categoryId: string) => {
    const members = categoryRows(categoryId);
    let order = orders.get(categoryId);
    if (!order) { order = { version: 1, ids: members.map(row => row.product.id) }; orders.set(categoryId, order); }
    order.ids = [...order.ids.filter(id => members.some(row => row.product.id === id)), ...members.filter(row => !order!.ids.includes(row.product.id)).map(row => row.product.id)];
    return { categoryId, version: order.version, items: order.ids.map((id, index) => {
      const row = members.find(item => item.product.id === id)!;
      return { productId: id, title: row.product.title, slug: row.product.slug, status: row.product.status, storefrontPosition: index };
    }) };
  };
  const markMutation = () => {
    writes += 1;
    if (!recovered && (state === "stale" || state === "reconciliation-error")) reconciliationFailed = true;
  };
  const update = (row: FixtureProductRecord, status: "active" | "draft" | "archived") => {
    row.product = { ...row.product, status, version: row.product.version + 1, updatedAt: FIXTURE_NOW };
    return clone(row.product);
  };
  const waitForRecovery = async (signal: AbortSignal) => {
    if (recovered) return;
    await new Promise<void>((resolve, reject) => {
      const finish = () => { pending.delete(finish); signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => { pending.delete(finish); signal.removeEventListener("abort", abort); reject(new DOMException("Local fixture request cancelled", "AbortError")); };
      if (signal.aborted) { abort(); return; }
      pending.add(finish);
      signal.addEventListener("abort", abort, { once: true });
    });
  };

  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(String(input), origin), init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const call = { method, path: url.pathname, query: url.search, status: 0 };
    calls.push(call);
    notify();
    const productMatch = /^\/api\/catalog\/products\/([a-f0-9-]{36})\/(archive|restore|deletion-impact|delete)$/.exec(url.pathname);
    const rankMatch = /^\/api\/catalog\/onboarding\/categories\/([a-f0-9-]{36})\/product-order$/.exec(url.pathname);
    const knownProductPath = productMatch && UUID.test(productMatch[1]) && knownProductIds.has(productMatch[1]);
    const knownRankPath = rankMatch && OPTIONS.categories.some(category => category.id === rankMatch[1]);
    const knownGet = method === "GET" && ([LIST_PATH, SUMMARY_PATH, OPTIONS_PATH].includes(url.pathname) || knownProductPath && productMatch[2] === "deletion-impact" || knownRankPath);
    const knownPost = method === "POST" && (url.pathname === BULK_PATH || knownProductPath && productMatch[2] !== "deletion-impact" || knownRankPath);
    if (url.origin !== origin || (!knownGet && !knownPost)) return block(call);
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length || (url.pathname !== LIST_PATH && keys.length > 0) || keys.some(key => !["limit", "q", "status", "stock", "category", "brand", "collection", "sort", "cursor"].includes(key))) return block(call);
    if (request.signal.aborted) throw new DOMException("Local fixture request cancelled", "AbortError");
    if (method === "GET") {
      if (state === "loading" && !recovered) await waitForRecovery(request.signal);
      if (state === "error" && !recovered || url.pathname === LIST_PATH && reconciliationFailed) return fail(call, "unavailable", 503);
      if (url.pathname === OPTIONS_PATH) {
        if (state === "options-error" && !recovered) return fail(call, "unavailable", 503);
        return respond(call, OPTIONS);
      }
      if (url.pathname === SUMMARY_PATH) {
        const visible = liveRecords();
        const outOfStock = visible.filter(row => row.variant.stockTracking && row.variant.stockQuantity === 0).length;
        return respond(call, {
          totalProducts: visible.length, activeProducts: visible.filter(row => row.product.status === "active").length,
          draftProducts: visible.filter(row => row.product.status === "draft").length, productLimit: 500,
          activeVariants: visible.length, outOfStockVariants: outOfStock, outOfStockProducts: outOfStock,
          productsWithoutMedia: visible.length, activeMedia: 0,
        });
      }
      if (url.pathname === LIST_PATH) {
        const limit = Number(url.searchParams.get("limit") ?? "20");
        const status = url.searchParams.get("status");
        const stock = url.searchParams.get("stock");
        const sort = url.searchParams.get("sort") ?? "updated-desc";
        const cursor = url.searchParams.get("cursor");
        if (![20, 50, 100].includes(limit) || status && !["active", "draft", "archived"].includes(status) || stock && !["in-stock", "out-of-stock", "untracked"].includes(stock) || !["updated-desc", "created-asc", "created-desc", "title-asc", "title-desc"].includes(sort) || cursor && !/^page_[0-9]+$/.test(cursor)) return fail(call);
        const offset = cursor ? Number(cursor.slice(5)) : 0;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset % limit !== 0) return fail(call);
        const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("tr-TR");
        const category = url.searchParams.get("category"), brand = url.searchParams.get("brand"), collection = url.searchParams.get("collection");
        let selected = records.filter(row => (status ? row.product.status === status : row.product.status !== "archived")
          && (!query || [row.product.title, row.product.slug, row.variant.sku ?? "", row.barcode].some(value => value.toLocaleLowerCase("tr-TR").includes(query)))
          && (!stock || (stock === "untracked" ? !row.variant.stockTracking : row.variant.stockTracking && (stock === "in-stock" ? row.variant.stockQuantity > 0 : row.variant.stockQuantity === 0)))
          && (!category || row.categoryId === category || OPTIONS.categories.find(option => option.id === row.categoryId)?.parentId === category)
          && (!brand || row.brandId === brand) && (!collection || row.collectionId === collection));
        selected.sort((a, b) => sort.startsWith("title")
          ? a.product.title.localeCompare(b.product.title, "tr") * (sort === "title-asc" ? 1 : -1)
          : (sort === "updated-desc" ? a.product.updatedAt.localeCompare(b.product.updatedAt) : a.product.createdAt.localeCompare(b.product.createdAt)) * (sort === "created-asc" ? 1 : -1) || a.product.id.localeCompare(b.product.id));
        const page = selected.slice(offset, offset + limit);
        return respond(call, {
          items: page.map(row => clone(row.product)), catalogTotal: liveRecords().length, featuredImages: {},
          variantSummaries: Object.fromEntries(page.map(row => [row.product.id, clone(row.variant)])),
          ...(offset + limit < selected.length ? { nextCursor: `page_${offset + limit}` } : {}),
        });
      }
      if (knownRankPath && rankMatch) {
        if (state === "rank-error" && !recovered) return fail(call, "unavailable", 503);
        return respond(call, orderFor(rankMatch[1]));
      }
      const row = records.find(item => item.product.id === productMatch?.[1]);
      if (!row) return fail(call, "product_not_found", 404);
      if (state === "delete-error" && !recovered) return fail(call, "unavailable", 503);
      return respond(call, {
        resourceKind: "product", resourceId: row.product.id, expectedVersion: row.product.version,
        confirmationLabel: row.product.title,
        effects: [{ kind: "variants", count: 1, disposition: "delete" }, { kind: "media", count: 0, disposition: "delete" }, { kind: "catalog_relations", count: 3, disposition: "detach" }, { kind: "order_line_snapshots", count: 0, disposition: "retain_snapshot" }],
      });
    }
    if (state === "readonly") return block(call);
    if (state === "mutation-error" && !recovered) return fail(call, "unavailable", 503);
    const operationId = request.headers.get("idempotency-key");
    if (!operationId || !UUID.test(operationId)) return fail(call);
    const bodyText = await request.text();
    const fingerprint = `${method} ${url.pathname} ${bodyText}`;
    const prior = operations.get(operationId);
    if (prior) return prior.fingerprint === fingerprint ? respond(call, { ...(prior.result as object), ...(Object.hasOwn(prior.result as object, "replayed") ? { replayed: true } : {}) }) : fail(call, "operation_mismatch", 409);
    let body: Record<string, unknown>;
    try { body = JSON.parse(bodyText); if (!body || typeof body !== "object" || Array.isArray(body)) return fail(call); }
    catch { return fail(call); }
    let result: unknown;
    if (url.pathname === BULK_PATH) {
      let intent;
      try { intent = parseCatalogBulkProductIntent(body); } catch { return fail(call); }
      const targets = intent.targets.map(target => records.find(row => row.product.id === target.productId));
      if (targets.some(row => !row)) return fail(call, "product_not_found", 404);
      if (targets.some((row, index) => row!.product.version !== intent.targets[index].expectedVersion)) return fail(call, "version_conflict", 409);
      if (targets.some(row => row!.product.status === "archived")) return fail(call, "invalid_input", 400);
      result = { products: targets.map(row => update(row!, intent.action === "archive" ? "archived" : intent.action)), replayed: false };
    } else if (knownRankPath && rankMatch) {
      if (Object.keys(body).sort().join(",") !== "expectedVersion,orderedProductIds" || !Array.isArray(body.orderedProductIds)) return fail(call);
      const current = orderFor(rankMatch[1]);
      if (body.expectedVersion !== current.version) return fail(call, "version_conflict", 409);
      const ids = body.orderedProductIds;
      if (new Set(ids).size !== ids.length || ids.length !== current.items.length || ids.some(id => !current.items.some(item => item.productId === id))) return fail(call, "order_membership_changed", 409);
      orders.set(rankMatch[1], { version: current.version + 1, ids: ids as string[] });
      result = orderFor(rankMatch[1]);
    } else {
      const row = records.find(item => item.product.id === productMatch?.[1]);
      if (!row) return fail(call, "product_not_found", 404);
      const action = productMatch![2];
      if (Object.keys(body).sort().join(",") !== (action === "delete" ? "confirmation,expectedVersion" : "expectedVersion")) return fail(call);
      if (body.expectedVersion !== row.product.version) return fail(call, "version_conflict", 409);
      if (action === "delete") {
        if (body.confirmation !== row.product.title) return fail(call, "invalid_confirmation", 400);
        records = records.filter(item => item !== row);
        result = { resourceKind: "product", resourceId: row.product.id, deleted: true, auditId: operationId, replayed: false };
      } else {
        if (action === "restore" ? row.product.status !== "archived" : row.product.status === "archived") return fail(call);
        result = { product: update(row, action === "restore" ? "draft" : "archived"), replayed: false };
      }
    }
    operations.set(operationId, { fingerprint, result: clone(result) });
    markMutation();
    return respond(call, result);
  };

  return {
    fetch: fetcher,
    recover() { recovered = true; reconciliationFailed = false; [...pending].forEach(resolve => resolve()); notify(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => ({ state, liveWrites: false, calls: clone(calls), apiReads: calls.filter(call => call.method === "GET").length, localWrites: writes, blockedRequests: blocked, failedRequests: failures, pendingRequests: calls.filter(call => call.status === 0).length, records: clone(records) }),
  };
}

export type ProductsFixtureTransport = ReturnType<typeof createProductsFixtureTransport>;

/** A captured ranking client keeps this function across Strict Mode effect replays. */
export function createProductsFixtureFetchBridge({ origin, frameworkFetch }: { origin: string; frameworkFetch: typeof fetch }) {
  let active: { token: symbol; transport: ProductsFixtureTransport } | undefined;
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== origin) return active ? active.transport.fetch(input, init) : Promise.resolve(denied());
    if (url.pathname.startsWith("/api/")) return active ? active.transport.fetch(input, init) : Promise.resolve(denied());
    if (["GET", "HEAD"].includes(method) && /^\/_next\/(?:static|webpack-hmr)(?:\/|$)/.test(url.pathname)) return frameworkFetch(input, init);
    if (["GET", "HEAD"].includes(method) && (/^\/products\/(?:new|bulk-upload|barcode-labels)$/.test(url.pathname) || active?.transport.snapshot().records.some(row => url.pathname === `/products/${row.product.id}`))) return frameworkFetch(input, init);
    return active ? active.transport.fetch(input, init) : Promise.resolve(denied());
  };
  return {
    fetch: fetcher,
    activate(transport: ProductsFixtureTransport) {
      const token = Symbol("local-products-fixture");
      active = { token, transport };
      return () => {
        if (active?.token !== token) return false;
        active = undefined;
        return true;
      };
    },
  };
}
