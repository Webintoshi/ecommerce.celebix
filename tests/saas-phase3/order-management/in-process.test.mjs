import assert from "node:assert/strict";
import test from "node:test";

import { OrderRepositoryError } from "../../../packages/saas-data/src/orders/errors.ts";
import { createOrderHttpHandlers } from "../../../apps/customer-panel/lib/order-http/handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const ORDERS = "/api/orders";
const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const REQUEST_ID = "88888888-8888-4888-8888-888888888888";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const COOKIE_NAME = ["__Host", "celebix_panel"].join("-");
const CREDENTIAL = ["v1", "panel", "current", Buffer.alloc(32, 0x31).toString("base64url")].join(".");
const COOKIE = COOKIE_NAME + String.fromCharCode(61) + CREDENTIAL;

function tenantContext(role = "store_owner") {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({
      id: "44444444-4444-4444-8444-444444444444",
      issuer: "https://identity.example/oidc",
      subject: "merchant-subject",
    }),
    store: Object.freeze({ id: STORE_ID, slug: "atlas-store", status: "active" }),
    membership: Object.freeze({
      id: "55555555-5555-4555-8555-555555555555",
      role,
      status: "active",
    }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: "66666666-6666-4666-8666-666666666666",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["orders"]),
      limits: Object.freeze({ products: 10, staff: 1, storageBytes: 1_024, monthlyOrders: 100 }),
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  });
}

function listItem() {
  return Object.freeze({
    id: ORDER_ID,
    orderNumber: "HMN-1001",
    source: "storefront",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 12_500,
    status: "confirmed",
    paymentStatus: "completed",
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
    shippingAddress: Object.freeze({
      recipientName: "Ada Lovelace",
      line1: "1 Road",
      city: "Istanbul",
      country: "TR",
    }),
    items: Object.freeze([]),
    events: Object.freeze([]),
    notes: Object.freeze([]),
  });
}

function mutation(overrides = {}) {
  return Object.freeze({
    id: ORDER_ID,
    status: "shipped",
    paymentStatus: "completed",
    version: 5,
    updatedAt: NOW.toISOString(),
    replayed: false,
    ...overrides,
  });
}

function repository(overrides = {}) {
  const unexpected = async () => { throw new Error("unexpected repository call"); };
  return Object.freeze({
    getDashboardSummary: unexpected,
    listOrders: unexpected,
    getOrder: unexpected,
    transitionStatus: unexpected,
    transitionPayment: unexpected,
    updateShipping: unexpected,
    addNote: unexpected,
    archiveNote: unexpected,
    ...overrides,
  });
}

function access(kind = "authenticated", role = "store_owner") {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" }),
    panelOrigin: ORIGIN,
    async resolveCredential() {
      return kind === "authenticated"
        ? Object.freeze({ kind, session: Object.freeze({}), tenantContext: tenantContext(role) })
        : Object.freeze({ kind });
    },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" }); },
  });
}

function handlers(orders, accessRuntime = access()) {
  return createOrderHttpHandlers({
    async resolveRuntime() { return Object.freeze({ access: accessRuntime, orders }); },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
  });
}

function request(path, options = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? COOKIE);
  if (method !== "GET") {
    headers.set("origin", options.origin ?? ORIGIN);
    headers.set("content-type", "application/json");
    headers.set("idempotency-key", options.operationId ?? OPERATION_ID);
  }
  return new Request(`http://customer-panel:3400${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
  });
}

async function json(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return response.json();
}

test("authenticated list and detail traverse the real HTTP handlers with server authority", async () => {
  const calls = [];
  const api = handlers(repository({
    async listOrders(input) {
      calls.push(["list", input]);
      return Object.freeze({ items: Object.freeze([listItem()]), nextCursor: "next_cursor" });
    },
    async getOrder(input) {
      calls.push(["detail", input]);
      return detail();
    },
  }));

  const listResponse = await api.listOrders(request(`${ORDERS}?pageSize=25&status=confirmed&search=Ada&sort=lowest`));
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await json(listResponse), { items: [listItem()], nextCursor: "next_cursor" });
  const detailResponse = await api.getOrder(request(`${ORDERS}/${ORDER_ID}`), ORDER_ID);
  assert.equal(detailResponse.status, 200);
  assert.deepEqual(await json(detailResponse), detail());

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1], {
    tenantContext: tenantContext(),
    now: NOW,
    pageSize: 25,
    status: "confirmed",
    search: "Ada",
    sort: "lowest",
  });
  assert.deepEqual(calls[1][1], { tenantContext: tenantContext(), now: NOW, orderId: ORDER_ID });
  assert.equal(calls.every(([, input]) => input.tenantContext.store.id === STORE_ID), true);
});

test("all five authenticated mutations traverse the real handlers with operation binding", async () => {
  const calls = [];
  const capture = (name) => async (input) => {
    calls.push([name, input]);
    return mutation();
  };
  const api = handlers(repository({
    transitionStatus: capture("status"),
    transitionPayment: capture("payment"),
    updateShipping: capture("shipping"),
    addNote: capture("note"),
    archiveNote: capture("archive"),
  }));
  const address = Object.freeze({ recipientName: "Ada", line1: "1 Road", city: "Istanbul", country: "TR" });
  const cases = [
    api.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, { method: "PATCH", body: { expectedVersion: 4, nextStatus: "shipped" } }), ORDER_ID),
    api.transitionPayment(request(`${ORDERS}/${ORDER_ID}/payment`, { method: "PATCH", body: { expectedVersion: 4, nextPaymentStatus: "completed" } }), ORDER_ID),
    api.updateShipping(request(`${ORDERS}/${ORDER_ID}/shipping`, { method: "PATCH", body: { expectedVersion: 4, shippingAddress: address } }), ORDER_ID),
    api.addNote(request(`${ORDERS}/${ORDER_ID}/notes`, { method: "POST", body: { body: "Packed carefully" } }), ORDER_ID),
    api.archiveNote(request(`${ORDERS}/${ORDER_ID}/notes/${NOTE_ID}/archive`, { method: "POST", body: {} }), ORDER_ID, NOTE_ID),
  ];
  for (const response of await Promise.all(cases)) {
    assert.equal(response.status, 200);
    assert.deepEqual(await json(response), mutation());
  }
  assert.deepEqual(calls.map(([name]) => name), ["status", "payment", "shipping", "note", "archive"]);
  for (const [, input] of calls) {
    assert.equal(input.tenantContext.store.id, STORE_ID);
    assert.equal(input.operationId, OPERATION_ID);
    assert.equal(input.orderId, ORDER_ID);
  }
  assert.equal(calls[4][1].noteId, NOTE_ID);
});

test("session and role denials fail closed through the real handlers before exposing data", async () => {
  let repositoryCalls = 0;
  const counting = repository({
    async listOrders() { repositoryCalls += 1; return Object.freeze({ items: Object.freeze([]) }); },
  });
  const missingCookie = await handlers(counting).listOrders(request(ORDERS, { cookie: null }));
  assert.equal(missingCookie.status, 401);
  assert.deepEqual(await json(missingCookie), { code: "unauthenticated" });
  const expiredSession = await handlers(counting, access("unauthenticated")).listOrders(request(ORDERS));
  assert.equal(expiredSession.status, 401);
  assert.deepEqual(await json(expiredSession), { code: "unauthenticated" });
  const revokedMembership = await handlers(counting, access("unauthorized")).listOrders(request(ORDERS));
  assert.equal(revokedMembership.status, 403);
  assert.deepEqual(await json(revokedMembership), { code: "membership_denied" });
  assert.equal(repositoryCalls, 0);

  const analystApi = handlers(repository({
    async transitionPayment(input) {
      assert.equal(input.tenantContext.membership.role, "analyst");
      throw new OrderRepositoryError("membership_denied");
    },
  }), access("authenticated", "analyst"));
  const roleDenied = await analystApi.transitionPayment(request(`${ORDERS}/${ORDER_ID}/payment`, {
    method: "PATCH",
    body: { expectedVersion: 4, nextPaymentStatus: "refunded" },
  }), ORDER_ID);
  assert.equal(roleDenied.status, 403);
  assert.deepEqual(await json(roleDenied), { code: "membership_denied" });
});

test("cross-store, conflict, and internal errors remain finite and non-disclosing", async () => {
  const foreignApi = handlers(repository({
    async getOrder(input) {
      assert.equal(input.orderId, FOREIGN_ORDER_ID);
      assert.equal(input.tenantContext.store.id, STORE_ID);
      throw new OrderRepositoryError("order_not_found");
    },
  }));
  const foreign = await foreignApi.getOrder(request(`${ORDERS}/${FOREIGN_ORDER_ID}`), FOREIGN_ORDER_ID);
  assert.equal(foreign.status, 404);
  assert.deepEqual(await json(foreign), { code: "order_not_found" });

  const conflictApi = handlers(repository({
    async transitionStatus() { throw new OrderRepositoryError("version_conflict"); },
  }));
  const conflict = await conflictApi.transitionStatus(request(`${ORDERS}/${ORDER_ID}/status`, {
    method: "PATCH",
    body: { expectedVersion: 3, nextStatus: "cancelled" },
  }), ORDER_ID);
  assert.equal(conflict.status, 409);
  assert.deepEqual(await json(conflict), { code: "version_conflict" });

  const privateMessage = "postgres private connection and constraint detail";
  const unavailableApi = handlers(repository({
    async listOrders() { throw new Error(privateMessage); },
  }));
  const unavailable = await unavailableApi.listOrders(request(ORDERS));
  assert.equal(unavailable.status, 503);
  const unavailableBody = await json(unavailable);
  assert.deepEqual(unavailableBody, { code: "unavailable" });
  assert.doesNotMatch(JSON.stringify(unavailableBody), new RegExp(privateMessage));
});
