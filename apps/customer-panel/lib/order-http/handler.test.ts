import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import {
  OrderRepositoryError,
  type OrderErrorCode,
  type OrderRepository,
} from "@celebix/saas-data";

import { createOrderHttpHandlers } from "./handler.ts";
import { createOrderRequestAuthorityValidator } from "./request-authority.ts";
import type { ServerOrdersRuntime } from "../server-orders/runtime.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const TENANT_ADMIN_HOSTNAME = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const ORDERS = "/api/orders";
const SUMMARY = "/api/orders/summary";
const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const DRAFT_ID = "12121212-1212-4121-8121-121212121212";
const DRAFT_LINE_ID = "13131313-1313-4131-8131-131313131313";
const PRODUCT_ID = "14141414-1414-4141-8141-141414141414";
const VARIANT_ID = "15151515-1515-4151-8151-151515151515";
const REQUEST_ID = "88888888-8888-4888-8888-888888888888";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;

function tenantContext(): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({ id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "subject-1" }),
    store: Object.freeze({ id: STORE_ID, slug: "atlas-store", status: "active" }),
    membership: Object.freeze({ id: MEMBERSHIP_ID, role: "store_owner", status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["orders"]),
      limits: Object.freeze({ products: 10, staff: 1, storageBytes: 1_024, monthlyOrders: 100 }),
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  }) as TenantContext;
}

function summary() {
  return Object.freeze({
    totalOrders: 4,
    pendingOrders: 1,
    fulfilledOrders: 2,
    revenueCents: 24_500,
    currency: "TRY",
    asOf: NOW.toISOString(),
  });
}

function listItem() {
  return Object.freeze({
    id: ORDER_ID,
    orderNumber: "HMN-1001",
    source: "storefront" as const,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 12_500,
    status: "confirmed" as const,
    paymentStatus: "completed" as const,
    itemCount: 0,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 4,
  });
}

function detail() {
  return Object.freeze({
    ...listItem(),
    subtotalCents: 12_000,
    shippingCents: 500,
    discountCents: 0,
    shippingAddress: Object.freeze({ recipientName: "Ada Lovelace", line1: "1 Road", city: "Istanbul", country: "TR" }),
    items: Object.freeze([]),
    events: Object.freeze([]),
    notes: Object.freeze([]),
  });
}

function neighbors() {
  return Object.freeze({
    previous: Object.freeze({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orderNumber: "HMN-1002" }),
    next: Object.freeze({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", orderNumber: "HMN-1000" }),
  });
}

function mutation() {
  return Object.freeze({
    id: ORDER_ID,
    status: "shipped" as const,
    paymentStatus: "completed" as const,
    version: 5,
    updatedAt: NOW.toISOString(),
    replayed: false,
  });
}

function draftIntent(expectedVersion?: number) {
  return Object.freeze({
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    currency: "TRY" as const,
    shippingCents: 500,
    discountCents: 100,
    shippingAddress: Object.freeze({ recipientName: "Ada Lovelace", line1: "1 Road", city: "Istanbul", country: "TR" }),
    billingAddress: Object.freeze({ recipientName: "Ada Lovelace", line1: "2 Road", city: "Istanbul", country: "TR" }),
    note: "Hediye paketi",
    adjustInventory: true,
    lines: Object.freeze([Object.freeze({
      lineId: DRAFT_LINE_ID, productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2, discountCents: 100,
    })]),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  });
}

function draftDetail(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: DRAFT_ID,
    draftNumber: "TSL-a1b2c3d4e5f6a7b8c9d0",
    status: "draft" as const,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    currency: "TRY" as const,
    totalCents: 2_300,
    lineCount: 1,
    adjustInventory: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 1,
    subtotalCents: 1_900,
    shippingCents: 500,
    discountCents: 100,
    shippingAddress: draftIntent().shippingAddress,
    billingAddress: draftIntent().billingAddress,
    note: "Hediye paketi",
    lines: Object.freeze([Object.freeze({
      lineId: DRAFT_LINE_ID, position: 0, productId: PRODUCT_ID, variantId: VARIANT_ID,
      productName: "Atlas Kolye", variantName: "Altın", sku: "ATL-KOL-ALT",
      unitPriceCents: 1_000, quantity: 2, discountCents: 100, lineTotalCents: 1_900,
    })]),
    ...overrides,
  });
}

function draftListItem() {
  const draft = draftDetail();
  return Object.freeze({
    id: draft.id,
    draftNumber: draft.draftNumber,
    status: draft.status,
    customerName: draft.customerName,
    customerEmail: draft.customerEmail,
    currency: draft.currency,
    totalCents: draft.totalCents,
    lineCount: draft.lineCount,
    adjustInventory: draft.adjustInventory,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    version: draft.version,
  });
}

function repository(overrides: Partial<OrderRepository> = {}): OrderRepository {
  const reject = async () => { throw new Error("unexpected repository call"); };
  return Object.freeze({
    getDashboardSummary: reject,
    listOrders: reject,
    getOrder: reject,
    getOrderNeighbors: reject,
    transitionStatus: reject,
    transitionPayment: reject,
    updateShipping: reject,
    addNote: reject,
    archiveNote: reject,
    listDrafts: reject,
    getDraft: reject,
    createDraft: reject,
    updateDraft: reject,
    archiveDraft: reject,
    convertDraft: reject,
    ...overrides,
  }) as OrderRepository;
}

function access(
  kind: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable" = "authenticated",
): ServerOrdersRuntime["access"] {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: ORIGIN,
    async resolveCredential() {
      return kind === "authenticated"
        ? Object.freeze({ kind, session: Object.freeze({}), tenantContext: tenantContext() }) as never
        : Object.freeze({ kind });
    },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function dependencies(orders: OrderRepository, accessRuntime = access()) {
  return {
    async resolveRuntime(): Promise<ServerOrdersRuntime | null> {
      return Object.freeze({ access: accessRuntime, orders });
    },
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
  rawBody?: BodyInit;
} = {}): Request {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (method !== "GET") {
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (options.origin !== null && !headers.has("origin")) headers.set("origin", options.origin ?? ORIGIN);
    if (options.operationId !== null && !headers.has("idempotency-key")) {
      headers.set("idempotency-key", options.operationId ?? OPERATION_ID);
    }
  }
  if (options.cookie !== null && !headers.has("cookie")) headers.set("cookie", options.cookie ?? COOKIE);
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : options.rawBody ?? JSON.stringify(options.body ?? {}),
  });
}

async function body(response: Response | undefined) {
  assert.ok(response);
  return response.json();
}

test("disabled/default order runtime stays unavailable in production by default", async () => {
  const handlers = createOrderHttpHandlers({
    async resolveRuntime() { return null; },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
  });
  const response = await handlers.getDashboardSummary(request(SUMMARY));
  assert.equal(response.status, 503);
  assert.deepEqual(await body(response), { code: "unavailable" });
  const source = readFileSync(new URL("./default.ts", import.meta.url), "utf8");
  assert.match(source, /resolveDefaultServerOrdersRuntime/);
  assert.doesNotMatch(source, /approved_staging|PostgresOrderRepository|new Pool/);
  const throwing = new Proxy({} as never, { get() { throw new Error("private getter detail"); } });
  assert.throws(() => createOrderHttpHandlers(throwing), /^Error: order_http_handler_invalid$/);
});

test("authenticated summary forwards only server TenantContext and returns safe no-store JSON", async () => {
  const calls: unknown[] = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async getDashboardSummary(input) { calls.push(input); return summary(); },
  })));
  const response = await handlers.getDashboardSummary(request(SUMMARY));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), summary());
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(calls, [{ tenantContext: tenantContext(), now: NOW }]);
  assert.doesNotMatch(JSON.stringify(await (await handlers.getDashboardSummary(request(SUMMARY))).json()), /storeId|principalId|membershipId|issuer|subject/i);
});

test("authenticated list accepts only pageSize cursor status search and sort with a safe default", async () => {
  const calls: unknown[] = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async listOrders(input) { calls.push(input); return Object.freeze({ items: Object.freeze([listItem()]), nextCursor: "eyJ2IjoxfQ" }); },
  })));
  const response = await handlers.listOrders(request(`${ORDERS}?pageSize=25&cursor=eyJ2IjoxfQ&status=confirmed&search=Ada%20Lovelace&sort=highest`));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { items: [listItem()], nextCursor: "eyJ2IjoxfQ" });
  assert.deepEqual(calls, [{
    tenantContext: tenantContext(), now: NOW, pageSize: 25, cursor: "eyJ2IjoxfQ", status: "confirmed", search: "Ada Lovelace", sort: "highest",
  }]);
  const defaultResponse = await handlers.listOrders(request(ORDERS));
  assert.equal(defaultResponse.status, 200);
  assert.deepEqual(calls[1], { tenantContext: tenantContext(), now: NOW, pageSize: 20, sort: "newest" });
});

test("authenticated order detail validates the path ID and calls once", async () => {
  const calls: unknown[] = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async getOrder(input) { calls.push(input); return detail(); },
  })));
  const response = await handlers.getOrder(request(`${ORDERS}/${ORDER_ID}`), ORDER_ID);
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), detail());
  assert.deepEqual(calls, [{ tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID }]);
});

test("draft HTTP surface lists reads saves archives and converts with session-only authority", async () => {
  const calls: Array<readonly [string, unknown]> = [];
  const converted = Object.freeze({
    draftId: DRAFT_ID,
    orderId: ORDER_ID,
    orderNumber: "MAN-aaaaaaaaaaaa4aaa8aaa",
    draftVersion: 2,
    adjustedInventory: true,
    replayed: false,
  });
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async listDrafts(input) { calls.push(["list", input]); return Object.freeze({ items: Object.freeze([draftListItem()]), nextCursor: "eyJ2IjoxfQ" }); },
    async getDraft(input) { calls.push(["get", input]); return draftDetail(); },
    async createDraft(input) { calls.push(["create", input]); return draftDetail(); },
    async updateDraft(input) { calls.push(["update", input]); return draftDetail({ version: 2 }); },
    async archiveDraft(input) { calls.push(["archive", input]); return draftDetail({ status: "archived", version: 2 }); },
    async convertDraft(input) { calls.push(["convert", input]); return converted; },
  })));
  const base = ORDERS + "/drafts";
  const detailPath = base + "/" + DRAFT_ID;
  const responses = [
    await handlers.listDrafts(request(base + "?pageSize=10&cursor=eyJ2IjoxfQ")),
    await handlers.getDraft(request(detailPath), DRAFT_ID),
    await handlers.createDraft(request(base, { method: "POST", body: draftIntent() })),
    await handlers.updateDraft(request(detailPath, { method: "POST", body: draftIntent(1) }), DRAFT_ID),
    await handlers.archiveDraft(request(detailPath + "/archive", { method: "POST", body: { expectedVersion: 1 } }), DRAFT_ID),
    await handlers.convertDraft(request(detailPath + "/convert", { method: "POST", body: { expectedVersion: 1 } }), DRAFT_ID),
  ];
  assert.equal(responses.every((response) => response.status === 200), true);
  assert.deepEqual(await body(responses[5]), converted);
  assert.deepEqual(calls[0]?.[1], {
    tenantContext: tenantContext(), now: NOW, pageSize: 10, cursor: "eyJ2IjoxfQ",
  });
  assert.deepEqual(calls[2]?.[1], {
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, intent: draftIntent(),
  });
  assert.deepEqual(calls[3]?.[1], {
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, draftId: DRAFT_ID,
    expectedVersion: 1, intent: draftIntent(1),
  });
  assert.deepEqual(calls[5]?.[1], {
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, draftId: DRAFT_ID, expectedVersion: 1,
  });
  assert.doesNotMatch(JSON.stringify(await body(responses[0])), /storeId|principalId|membershipId|planId|database|provider/i);
  for (const response of responses) assert.equal(response.headers.get("cache-control"), "no-store");
});

test("tenant admin same-origin draft mutations work without trusting a different tenant admin origin", async () => {
  const calls: unknown[] = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async createDraft(input) { calls.push(input); return draftDetail(); },
  })));
  const base = ORDERS + "/drafts";
  const accepted = await handlers.createDraft(request(base, {
    method: "POST",
    body: draftIntent(),
    origin: TENANT_ADMIN_ORIGIN,
    headers: { host: TENANT_ADMIN_HOSTNAME },
  }));
  assert.equal(accepted.status, 200);
  assert.equal(calls.length, 1);

  const rejected = await handlers.createDraft(request(base, {
    method: "POST",
    body: draftIntent(),
    origin: "https://other-store.admin.saas-staging.celebix.site",
    headers: { host: TENANT_ADMIN_HOSTNAME },
  }));
  assert.equal(rejected.status, 403);
  assert.deepEqual(await body(rejected), { code: "origin_denied" });
  assert.equal(calls.length, 1);
});

test("draft HTTP rejects unsafe methods origins queries IDs bodies and private authority", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  const base = ORDERS + "/drafts";
  const detailPath = base + "/" + DRAFT_ID;
  const cases = [
    handlers.listDrafts(request(base + "?status=draft")),
    handlers.getDraft(request(base + "/bad"), "bad"),
    handlers.createDraft(request(base, { method: "GET" })),
    handlers.createDraft(request(base, { method: "POST", body: { ...draftIntent(), storeId: STORE_ID } })),
    handlers.createDraft(request(base, { method: "POST", body: draftIntent(), origin: "https://attacker.example" })),
    handlers.updateDraft(request(detailPath, { method: "POST", body: draftIntent() }), DRAFT_ID),
    handlers.convertDraft(request(detailPath + "/convert", {
      method: "POST", body: { expectedVersion: 1 }, headers: { "x-store-id": STORE_ID },
    }), DRAFT_ID),
  ];
  const responses = await Promise.all(cases);
  assert.deepEqual(responses.map(({ status }) => status), [400, 400, 405, 400, 403, 400, 400]);
});

test("authenticated order neighbors are tenant-scoped, parsed, and no-store", async () => {
  const calls: unknown[] = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async getOrderNeighbors(input) { calls.push(input); return neighbors(); },
  })));
  const response = await handlers.getOrderNeighbors(request(`${ORDERS}/${ORDER_ID}/neighbors`), ORDER_ID);
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), neighbors());
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls, [{ tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID }]);
  assert.doesNotMatch(JSON.stringify(await (await handlers.getOrderNeighbors(request(`${ORDERS}/${ORDER_ID}/neighbors`), ORDER_ID)).json()), /storeId|principalId|membershipId|issuer|subject/i);
});

test("five authenticated mutation endpoints forward exact safe commands", async () => {
  const calls: Array<readonly [string, unknown]> = [];
  const handlers = createOrderHttpHandlers(dependencies(repository({
    async transitionStatus(input) { calls.push(["status", input]); return mutation(); },
    async transitionPayment(input) { calls.push(["payment", input]); return mutation(); },
    async updateShipping(input) { calls.push(["shipping", input]); return mutation(); },
    async addNote(input) { calls.push(["note", input]); return mutation(); },
    async archiveNote(input) { calls.push(["archive", input]); return mutation(); },
  })));
  const address = { recipientName: "Ada Lovelace", line1: "1 Road", city: "Istanbul", country: "TR" };
  const tracking = { carrier: "Yurtici", trackingNumber: "TRK-1" };
  const cases = [
    handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", body: { expectedVersion: 4, nextStatus: "shipped" } }), ORDER_ID),
    handlers.transitionPayment(request(`${ORDERS}/${ORDER_ID}/payment`, { method: "PATCH", body: { expectedVersion: 4, nextPaymentStatus: "completed" } }), ORDER_ID),
    handlers.updateShipping(request(`${ORDERS}/${ORDER_ID}/shipping`, { method: "PATCH", body: { expectedVersion: 4, shippingAddress: address, tracking } }), ORDER_ID),
    handlers.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, { method: "POST", body: { body: "Packed carefully" } }), ORDER_ID),
    handlers.archiveNote(request(`${ORDERS}/${ORDER_ID}/notes/${NOTE_ID}/archive`, { method: "POST", body: {} }), ORDER_ID, NOTE_ID),
  ];
  for (const response of await Promise.all(cases)) assert.equal(response.status, 200);
  const authority = { tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, orderId: ORDER_ID };
  assert.deepEqual(calls, [
    ["status", { ...authority, expectedVersion: 4, nextStatus: "shipped" }],
    ["payment", { ...authority, expectedVersion: 4, nextPaymentStatus: "completed" }],
    ["shipping", { ...authority, expectedVersion: 4, shippingAddress: address, tracking }],
    ["note", { ...authority, body: "Packed carefully" }],
    ["archive", { ...authority, noteId: NOTE_ID }],
  ]);
});

test("every endpoint enforces its exact method", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const [invoke, allow] of [
    [(r: Request) => handlers.getDashboardSummary(r), "GET"],
    [(r: Request) => handlers.listOrders(r), "GET"],
    [(r: Request) => handlers.getOrder(r, ORDER_ID), "GET"],
    [(r: Request) => handlers.getOrderNeighbors(r, ORDER_ID), "GET"],
    [(r: Request) => handlers.transitionStatus(r, ORDER_ID), "PATCH"],
    [(r: Request) => handlers.transitionPayment(r, ORDER_ID), "PATCH"],
    [(r: Request) => handlers.updateShipping(r, ORDER_ID), "PATCH"],
    [(r: Request) => handlers.addNote(r, ORDER_ID), "POST"],
    [(r: Request) => handlers.archiveNote(r, ORDER_ID, NOTE_ID), "POST"],
  ] as const) {
    const response = await invoke(request(SUMMARY, { method: allow === "GET" ? "POST" : "GET" }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), allow);
  }
  assert.throws(
    () => createOrderRequestAuthorityValidator(new Proxy({} as never, { get() { throw new Error("private"); } })),
    /^Error: order_request_authority_invalid$/,
  );
  const validator = createOrderRequestAuthorityValidator({ panelOrigin: ORIGIN });
  assert.equal(
    validator.validate(request(SUMMARY), new Proxy({} as never, { get() { throw new Error("private"); } })),
    "request_invalid",
  );
});

test("GET routes reject exact-path near matches, fragments, and forbidden queries", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const response of [
    await handlers.getDashboardSummary(request(`${SUMMARY}/`)),
    await handlers.getDashboardSummary(request(`${SUMMARY}-evil`)),
    await handlers.getDashboardSummary(request(`${SUMMARY}?storeId=${STORE_ID}`)),
    await handlers.getOrder(request(`${ORDERS}/${ORDER_ID}?x=1`), ORDER_ID),
    await handlers.getOrder(request(`${ORDERS}/${ORDER_ID}#fragment`), ORDER_ID),
    await handlers.getOrderNeighbors(request(`${ORDERS}/${ORDER_ID}/neighbors?x=1`), ORDER_ID),
    await handlers.getOrderNeighbors(request(`${ORDERS}/${ORDER_ID}/neighbors/`), ORDER_ID),
  ]) {
    assert.equal(response.status, 400);
    assert.deepEqual(await body(response), { code: "invalid_input" });
  }
});

test("list rejects unknown, duplicate, empty, malformed, and oversized query keys", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const query of [
    `storeId=${STORE_ID}`, "pageSize=10&pageSize=20", "pageSize=", "cursor=", "status=", "search=", "sort=", "sort=newest&sort=oldest", `search=${"a".repeat(4100)}`,
  ]) {
    assert.equal((await handlers.listOrders(request(`${ORDERS}?${query}`))).status, 400);
  }
});

test("list validates page size cursor status and normalized bounded search", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const query of [
    "pageSize=0", "pageSize=101", "pageSize=01", "cursor=bad%2Fcursor", "status=unknown", "sort=unknown",
    "search=%20Ada", "search=Ada%20", `search=${"a".repeat(201)}`,
  ]) {
    assert.equal((await handlers.listOrders(request(`${ORDERS}?${query}`))).status, 400);
  }
});

test("all mutations require the exact configured panel Origin", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const origin of [null, "https://attacker.example", "http://panel.saas-staging.celebix.site", `${ORIGIN}/path`]) {
    const response = await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, {
      method: "PATCH", origin, body: { expectedVersion: 4, nextStatus: "shipped" },
    }), ORDER_ID);
    assert.equal(response.status, 403);
    assert.deepEqual(await body(response), { code: "origin_denied" });
  }
});

test("mutations reject near paths, queries, and fragments before repository calls", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const path of [
    `${ORDERS}/${ORDER_ID}/status/`, `${ORDERS}/${ORDER_ID}/status-evil`,
    `${ORDERS}/${ORDER_ID}/status?x=1`, `${ORDERS}/${ORDER_ID}/status#x`,
  ]) {
    const response = await handlers.transitionStatus(request(path, { method: "PATCH", body: { expectedVersion: 4, nextStatus: "shipped" } }), ORDER_ID);
    assert.equal(response.status, 400);
  }
});

test("browser-supplied private authority headers are denied before access or repository use", async () => {
  let calls = 0;
  const handlers = createOrderHttpHandlers(dependencies(repository({ async getDashboardSummary() { calls += 1; return summary(); } })));
  for (const name of [
    "authorization", "x-celebix-session", "x-celebix-anything", "x-panel-session-credential",
    "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
  ]) {
    const response = await handlers.getDashboardSummary(request(SUMMARY, { headers: { [name]: "private" } }));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("missing, duplicate, and malformed panel cookies are unauthenticated", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const cookie of [null, "__Host-celebix_panel=v1.bad", `${COOKIE}; ${COOKIE}`]) {
    const response = await handlers.getDashboardSummary(request(SUMMARY, { cookie }));
    assert.equal(response.status, 401);
    assert.deepEqual(await body(response), { code: "unauthenticated" });
  }
});

test("durable access denial maps before one repository call can occur", async () => {
  let calls = 0;
  const orders = repository({ async getDashboardSummary() { calls += 1; return summary(); } });
  for (const [kind, status, code] of [
    ["unauthenticated", 401, "unauthenticated"],
    ["unauthorized", 403, "membership_denied"],
    ["unavailable", 503, "unavailable"],
  ] as const) {
    const response = await createOrderHttpHandlers(dependencies(orders, access(kind))).getDashboardSummary(request(SUMMARY));
    assert.equal(response.status, status);
    assert.deepEqual(await body(response), { code });
  }
  for (const result of [
    new Proxy({ kind: "unavailable" }, {
      get(_target, property) {
        if (property === "kind") throw new Error("private authority getter");
        return undefined;
      },
    }),
    new Proxy({ kind: "authenticated", tenantContext: tenantContext() }, {
      get(target, property, receiver) {
        if (property === "tenantContext") throw new Error("private tenant getter");
        return Reflect.get(target, property, receiver);
      },
    }),
  ]) {
    const hostileAccess = Object.freeze({
      ...access(),
      async resolveCredential() { return result as never; },
    });
    const response = await createOrderHttpHandlers(dependencies(orders, hostileAccess)).getDashboardSummary(request(SUMMARY));
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text, JSON.stringify({ code: "unavailable" }));
    assert.doesNotMatch(text, /private|authority|tenant|getter/i);
  }
  assert.equal(calls, 0);
});

test("mutation bodies require exact JSON media type, bounded bytes, and no transfer encoding", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  const invalidHeaders: HeadersInit[] = [
    { "content-type": "application/json; charset=utf-8" },
    { "content-type": "text/plain" },
    { "content-type": "application/json", "content-length": "32769" },
    { "content-type": "application/json", "content-length": "nope" },
    { "content-type": "application/json", "transfer-encoding": "chunked" },
  ];
  for (const headers of invalidHeaders) {
    const response = await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, {
      method: "PATCH", headers, body: { expectedVersion: 4, nextStatus: "shipped" },
    }), ORDER_ID);
    assert.equal(response.status, 400);
  }
  const oversized = await handlers.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, {
    method: "POST", rawBody: JSON.stringify({ body: "a".repeat(33_000) }),
  }), ORDER_ID);
  assert.equal(oversized.status, 400);
});

test("every mutation body rejects missing and unknown keys", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const response of [
    await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", body: { expectedVersion: 4, nextStatus: "shipped", storeId: STORE_ID } }), ORDER_ID),
    await handlers.transitionPayment(request(`${ORDERS}/${ORDER_ID}/payment`, { method: "PATCH", body: { expectedVersion: 4 } }), ORDER_ID),
    await handlers.updateShipping(request(`${ORDERS}/${ORDER_ID}/shipping`, { method: "PATCH", body: { expectedVersion: 4, shippingAddress: {}, secret: true } }), ORDER_ID),
    await handlers.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, { method: "POST", body: { body: "note", membershipId: MEMBERSHIP_ID } }), ORDER_ID),
    await handlers.archiveNote(request(`${ORDERS}/${ORDER_ID}/notes/${NOTE_ID}/archive`, { method: "POST", body: { expectedVersion: 4 } }), ORDER_ID, NOTE_ID),
  ]) assert.equal(response.status, 400);
});

test("path order and note identifiers are strict UUIDs", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  assert.equal((await handlers.getOrder(request(`${ORDERS}/bad`), "bad")).status, 400);
  assert.equal((await handlers.archiveNote(request(`${ORDERS}/${ORDER_ID}/notes/bad/archive`, { method: "POST", body: {} }), ORDER_ID, "bad")).status, 400);
  assert.equal((await handlers.getOrder(request(`${ORDERS}/${ORDER_ID.toUpperCase()}`), ORDER_ID.toUpperCase())).status, 400);
});

test("versions statuses payment states and operation IDs are strict", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const response of [
    await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", operationId: "bad", body: { expectedVersion: 4, nextStatus: "shipped" } }), ORDER_ID),
    await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", body: { expectedVersion: 0, nextStatus: "shipped" } }), ORDER_ID),
    await handlers.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", body: { expectedVersion: 4, nextStatus: "unknown" } }), ORDER_ID),
    await handlers.transitionPayment(request(`${ORDERS}/${ORDER_ID}/payment`, { method: "PATCH", body: { expectedVersion: 4, nextPaymentStatus: "paid" } }), ORDER_ID),
  ]) assert.equal(response.status, 400);
});

test("shipping and note inputs enforce exact safe bounded contracts", async () => {
  const handlers = createOrderHttpHandlers(dependencies(repository()));
  for (const response of [
    await handlers.updateShipping(request(`${ORDERS}/${ORDER_ID}/shipping`, { method: "PATCH", body: { expectedVersion: 4, shippingAddress: { recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "tur" } } }), ORDER_ID),
    await handlers.updateShipping(request(`${ORDERS}/${ORDER_ID}/shipping`, { method: "PATCH", body: { expectedVersion: 4, shippingAddress: { recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "TR" }, tracking: { carrier: "Yurtici", trackingNumber: "T1", secret: "x" } } }), ORDER_ID),
    await handlers.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, { method: "POST", body: { body: " padded " } }), ORDER_ID),
    await handlers.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, { method: "POST", body: { body: "a".repeat(2001) } }), ORDER_ID),
  ]) assert.equal(response.status, 400);
});

test("all stable repository errors map to their safe HTTP statuses", async () => {
  const statuses: Readonly<Record<OrderErrorCode, number>> = {
    invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403,
    feature_not_enabled: 403, order_not_found: 404, note_not_found: 404, draft_not_found: 404,
    draft_not_editable: 409, inventory_conflict: 409, catalog_conflict: 409, customer_conflict: 409, invalid_transition: 409,
    version_conflict: 409, operation_replayed: 409, operation_mismatch: 409,
    durable_authority_invalid: 409, unavailable: 503,
  };
  for (const [code, status] of Object.entries(statuses) as [OrderErrorCode, number][]) {
    const handlers = createOrderHttpHandlers(dependencies(repository({
      async getDashboardSummary() { throw new OrderRepositoryError(code); },
    })));
    const response = await handlers.getDashboardSummary(request(SUMMARY));
    assert.equal(response.status, status);
    assert.deepEqual(await body(response), { code });
  }
});

test("unknown repository and runtime failures never leak SQL driver or credential details", async () => {
  const hostileRepositoryError = new Proxy(new OrderRepositoryError("unavailable"), {
    get(target, property, receiver) {
      if (property === "code") throw new Error("private repository getter");
      return Reflect.get(target, property, receiver);
    },
  });
  for (const dependenciesValue of [
    dependencies(repository({ async getDashboardSummary() { throw new Error("postgres SELECT secret password"); } })),
    dependencies(repository({ async getDashboardSummary() { throw hostileRepositoryError; } })),
    { async resolveRuntime() { throw new Error("DATABASE_URL=private"); }, now() { return new Date(NOW); }, requestId() { return REQUEST_ID; } },
  ]) {
    const response = await createOrderHttpHandlers(dependenciesValue).getDashboardSummary(request(SUMMARY));
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text, JSON.stringify({ code: "unavailable" }));
    assert.doesNotMatch(text, /postgres|select|secret|password|database|driver|sql/i);
  }
});
