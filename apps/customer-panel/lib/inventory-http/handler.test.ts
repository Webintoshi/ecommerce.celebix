import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { InventoryRepository } from "@celebix/saas-data";
import { inventoryFailure } from "../../../../packages/saas-data/src/inventory/errors.ts";

import { createInventoryHttpHandler } from "./handler.ts";
import { prepareInventoryRouteRequest } from "./request-authority.ts";
import type { ServerInventoryRuntime } from "../server-inventory/runtime.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const LOCATION = "20000000-0000-4000-8000-000000000001";
const DESTINATION = "20000000-0000-4000-8000-000000000002";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const SECOND_VARIANT = "30000000-0000-4000-8000-000000000002";
const ORDER = "40000000-0000-4000-8000-000000000001";
const COUNT = "50000000-0000-4000-8000-000000000001";
const TRANSFER = "60000000-0000-4000-8000-000000000001";
const LINE = "70000000-0000-4000-8000-000000000001";
const SECOND_LINE = "70000000-0000-4000-8000-000000000002";
const OPERATION = "80000000-0000-4000-8000-000000000001";
const REQUEST_ID = "90000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-23T11:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: REQUEST_ID,
    principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active",
      features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}
const timestamp = NOW.toISOString();
const location = () => ({ id: LOCATION, name: "Ana Depo", isDefault: true, status: "active" as const, version: 1, createdAt: timestamp, updatedAt: timestamp });
const balance = () => ({ locationId: LOCATION, variantId: VARIANT, quantity: 7, version: 1, updatedAt: timestamp });
const purchase = () => ({ id: ORDER, locationId: LOCATION, supplierName: "Tedarikçi", status: "draft" as const, lines: [{ id: LINE, variantId: VARIANT, orderedQuantity: 2, receivedQuantity: 0, unitCostCents: 100, lineCostCents: 200 }], totalCostCents: 200, version: 1, createdAt: timestamp, updatedAt: timestamp });
const count = () => ({ id: COUNT, locationId: LOCATION, status: "draft" as const, lines: [{ id: LINE, variantId: VARIANT, expectedQuantity: 7 }], version: 1, createdAt: timestamp, updatedAt: timestamp });
const transfer = () => ({ id: TRANSFER, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, status: "draft" as const, lines: [{ id: LINE, variantId: VARIANT, quantity: 2 }], version: 1, createdAt: timestamp, updatedAt: timestamp });
const mutation = (id = ORDER, status = "draft") => ({ id, status, version: 2, updatedAt: timestamp, replayed: false });

function repository(overrides: Partial<InventoryRepository> = {}): InventoryRepository {
  const reject = async () => { throw new Error("unexpected repository call"); };
  return {
    listLocations: reject, saveLocation: reject, archiveLocation: reject, recoverLocationOperation: reject,
    listBalances: reject, listPurchaseOrders: reject, getPurchaseOrder: reject,
    savePurchaseOrder: reject, transitionPurchaseOrder: reject, receivePurchaseOrder: reject,
    listCounts: reject, getCount: reject, saveCount: reject, startCount: reject, commitCount: reject, cancelCount: reject,
    listTransfers: reject, getTransfer: reject, saveTransfer: reject, dispatchTransfer: reject, receiveTransfer: reject, cancelTransfer: reject,
    ...overrides,
  } as InventoryRepository;
}

function runtime(inventory: InventoryRepository, accessKind: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable" = "authenticated"): ServerInventoryRuntime {
  return {
    inventory,
    access: {
      readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN,
      async resolveCredential() {
        return accessKind === "authenticated"
          ? { kind: "authenticated", session: {}, tenantContext: tenant() } as never
          : { kind: accessKind };
      },
      async rotateCredential() { return { kind: "unavailable" }; },
      async revokeCredential() { return { kind: "unavailable" }; },
    },
  } as ServerInventoryRuntime;
}

function handler(inventory: InventoryRepository, accessKind?: "authenticated" | "unauthenticated" | "unauthorized" | "unavailable") {
  return createInventoryHttpHandler({
    async resolveRuntime() { return runtime(inventory, accessKind); },
    now: () => new Date(NOW),
    requestId: () => REQUEST_ID,
  });
}

function request(path: string, options: Readonly<{
  method?: string; body?: unknown; rawBody?: BodyInit; origin?: string | null; cookie?: string | null; headers?: HeadersInit;
}> = {}): Request {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.cookie !== null && !headers.has("cookie")) headers.set("cookie", options.cookie ?? COOKIE);
  if (method === "POST") {
    if (options.origin !== null && !headers.has("origin")) headers.set("origin", options.origin ?? ORIGIN);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  return new Request(`http://internal:3400${path}`, {
    method, headers, body: method === "POST" ? options.rawBody ?? JSON.stringify(options.body ?? {}) : undefined,
  });
}

test("finite inventory routes call each repository method once with only server TenantContext authority", async () => {
  const calls: Array<readonly [string, Record<string, unknown>]> = [];
  const capture = (name: string, value: unknown) => { calls.push([name, value as Record<string, unknown>]); };
  const inventory = repository({
    async listLocations(input) { capture("listLocations", input); return [location()]; },
    async saveLocation(input) { capture("saveLocation", input); return mutation(DESTINATION, "active"); },
    async archiveLocation(input) { capture("archiveLocation", input); return mutation(LOCATION, "archived"); },
    async listBalances(input) { capture("listBalances", input); return [balance()]; },
    async listPurchaseOrders(input) { capture("listPurchaseOrders", input); return [purchase()]; },
    async getPurchaseOrder(input) { capture("getPurchaseOrder", input); return purchase(); },
    async savePurchaseOrder(input) { capture("savePurchaseOrder", input); return mutation(); },
    async transitionPurchaseOrder(input) { capture("transitionPurchaseOrder", input); return mutation(ORDER, "ordered"); },
    async receivePurchaseOrder(input) { capture("receivePurchaseOrder", input); return mutation(ORDER, "received"); },
    async listCounts(input) { capture("listCounts", input); return [count()]; },
    async getCount(input) { capture("getCount", input); return count(); },
    async saveCount(input) { capture("saveCount", input); return mutation(COUNT); },
    async startCount(input) { capture("startCount", input); return mutation(COUNT, "counting"); },
    async commitCount(input) { capture("commitCount", input); return mutation(COUNT, "committed"); },
    async cancelCount(input) { capture("cancelCount", input); return mutation(COUNT, "cancelled"); },
    async listTransfers(input) { capture("listTransfers", input); return [transfer()]; },
    async getTransfer(input) { capture("getTransfer", input); return transfer(); },
    async saveTransfer(input) { capture("saveTransfer", input); return mutation(TRANSFER); },
    async dispatchTransfer(input) { capture("dispatchTransfer", input); return mutation(TRANSFER, "in_transit"); },
    async receiveTransfer(input) { capture("receiveTransfer", input); return mutation(TRANSFER, "received"); },
    async cancelTransfer(input) { capture("cancelTransfer", input); return mutation(TRANSFER, "cancelled"); },
  });
  const handle = handler(inventory);
  const cases: Array<readonly [string, string, unknown?]> = [
    ["GET", "/api/inventory/locations"],
    ["POST", "/api/inventory/locations", { operationId: OPERATION, name: "Secondary warehouse" }],
    ["POST", `/api/inventory/locations/${LOCATION}/archive`, { operationId: OPERATION, expectedVersion: 1 }],
    ["GET", `/api/inventory/balances?locationId=${LOCATION}`],
    ["GET", "/api/inventory/purchase-orders"],
    ["GET", `/api/inventory/purchase-orders/${ORDER}`],
    ["POST", "/api/inventory/purchase-orders", { operationId: OPERATION, locationId: LOCATION, supplierName: "Tedarikçi", lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 100 }] }],
    ["POST", `/api/inventory/purchase-orders/${ORDER}/transition`, { operationId: OPERATION, expectedVersion: 1, transition: "order" }],
    ["POST", `/api/inventory/purchase-orders/${ORDER}/receive`, { operationId: OPERATION, expectedVersion: 1, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 2 }] }],
    ["GET", "/api/inventory/counts"],
    ["GET", `/api/inventory/counts/${COUNT}`],
    ["POST", "/api/inventory/counts", { operationId: OPERATION, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 7 }] }],
    ["POST", `/api/inventory/counts/${COUNT}/start`, { operationId: OPERATION, expectedVersion: 1 }],
    ["POST", `/api/inventory/counts/${COUNT}/commit`, { operationId: OPERATION, expectedVersion: 1 }],
    ["POST", `/api/inventory/counts/${COUNT}/cancel`, { operationId: OPERATION, expectedVersion: 1 }],
    ["GET", "/api/inventory/transfers"],
    ["GET", `/api/inventory/transfers/${TRANSFER}`],
    ["POST", "/api/inventory/transfers", { operationId: OPERATION, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }] }],
    ["POST", `/api/inventory/transfers/${TRANSFER}/dispatch`, { operationId: OPERATION, expectedVersion: 1 }],
    ["POST", `/api/inventory/transfers/${TRANSFER}/receive`, { operationId: OPERATION, expectedVersion: 1 }],
    ["POST", `/api/inventory/transfers/${TRANSFER}/cancel`, { operationId: OPERATION, expectedVersion: 1 }],
  ];
  for (const [method, path, body] of cases) {
    const response = await handle(request(path, { method, body }));
    assert.equal(response.status, 200, `${method} ${path}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(calls.length, 21);
  for (const [, input] of calls) {
    assert.deepEqual(input.tenantContext, tenant());
    assert.deepEqual(input.now, NOW);
    for (const forbidden of ["storeId", "principalId", "membershipId", "planId", "credential"]) assert.equal(forbidden in input, false);
  }
});

test("mutation responses carry the exact server-selected entity kind", async () => {
  const handle = handler(repository({
    async transitionPurchaseOrder() { return mutation(ORDER, "ordered"); },
    async startCount() { return mutation(COUNT, "counting"); },
    async dispatchTransfer() { return mutation(TRANSFER, "in_transit"); },
  }));
  for (const [path, body, kind] of [
    [`/api/inventory/purchase-orders/${ORDER}/transition`, { operationId: OPERATION, expectedVersion: 1, transition: "order" }, "purchase_order"],
    [`/api/inventory/counts/${COUNT}/start`, { operationId: OPERATION, expectedVersion: 1 }, "inventory_count"],
    [`/api/inventory/transfers/${TRANSFER}/dispatch`, { operationId: OPERATION, expectedVersion: 1 }, "inventory_transfer"],
  ] as const) {
    const response = await handle(request(path, { method: "POST", body }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).kind, kind);
  }
});

test("wrong, child, encoded, prefix, method, and query paths are rejected before repository access", async () => {
  let calls = 0;
  const inventory = repository({ async listLocations() { calls += 1; return []; } });
  const handle = handler(inventory);
  for (const [method, path, status] of [
    ["GET", "/api/inventory", 404],
    ["GET", "/api/inventory/locations/", 404],
    ["GET", "/api/inventory/locations/child", 404],
    ["GET", "/api/inventory/%6cocations", 404],
    ["GET", "/api/inventory/purchase-orders-evil", 404],
    ["GET", "/api/inventory/locations?x=1", 400],
    ["POST", "/api/inventory/locations/", 404],
  ] as const) assert.equal((await handle(request(path, { method, body: {} }))).status, status);
  assert.equal(calls, 0);
});

test("every mutation family rejects URL query, fragment, and forwarded rescue before repository access", async () => {
  let calls = 0;
  const inventory = new Proxy(repository(), {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? async (...args: unknown[]) => { calls += 1; return value(...args); } : value;
    },
  });
  const handle = handler(inventory);
  const mutations: Array<readonly [string, unknown]> = [
    ["/api/inventory/purchase-orders", { operationId: OPERATION, locationId: LOCATION, supplierName: "Tedarikçi", lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 100 }] }],
    [`/api/inventory/purchase-orders/${ORDER}/transition`, { operationId: OPERATION, expectedVersion: 1, transition: "order" }],
    [`/api/inventory/purchase-orders/${ORDER}/receive`, { operationId: OPERATION, expectedVersion: 1, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 1 }] }],
    ["/api/inventory/counts", { operationId: OPERATION, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT }] }],
    [`/api/inventory/counts/${COUNT}/start`, { operationId: OPERATION, expectedVersion: 1 }],
    [`/api/inventory/counts/${COUNT}/commit`, { operationId: OPERATION, expectedVersion: 1 }],
    [`/api/inventory/counts/${COUNT}/cancel`, { operationId: OPERATION, expectedVersion: 1 }],
    ["/api/inventory/transfers", { operationId: OPERATION, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 1 }] }],
    [`/api/inventory/transfers/${TRANSFER}/dispatch`, { operationId: OPERATION, expectedVersion: 1 }],
    [`/api/inventory/transfers/${TRANSFER}/receive`, { operationId: OPERATION, expectedVersion: 1 }],
    [`/api/inventory/transfers/${TRANSFER}/cancel`, { operationId: OPERATION, expectedVersion: 1 }],
  ];
  for (const [path, body] of mutations) {
    assert.equal((await handle(request(`${path}?private=1`, { method: "POST", body }))).status, 400, `${path} query`);
    assert.equal((await handle(request(`${path}#private`, { method: "POST", body }))).status, 400, `${path} fragment`);
    assert.equal((await handle(request(`${path}?private=1`, {
      method: "POST", body, headers: { "x-forwarded-uri": path },
    }))).status, 400, `${path} forwarded query rescue`);
  }
  assert.equal(calls, 0);
});

test("method errors return the exact finite Allow header for collections, items, and actions", async () => {
  const handle = handler(repository());
  for (const [path, allow] of [
    ["/api/inventory/locations", "GET, POST"],
    [`/api/inventory/locations/${LOCATION}/archive`, "POST"],
    ["/api/inventory/balances", "GET"],
    ["/api/inventory/purchase-orders", "GET, POST"],
    [`/api/inventory/purchase-orders/${ORDER}`, "GET"],
    [`/api/inventory/purchase-orders/${ORDER}/transition`, "POST"],
    [`/api/inventory/purchase-orders/${ORDER}/receive`, "POST"],
    ["/api/inventory/counts", "GET, POST"],
    [`/api/inventory/counts/${COUNT}`, "GET"],
    [`/api/inventory/counts/${COUNT}/start`, "POST"],
    [`/api/inventory/counts/${COUNT}/commit`, "POST"],
    [`/api/inventory/counts/${COUNT}/cancel`, "POST"],
    ["/api/inventory/transfers", "GET, POST"],
    [`/api/inventory/transfers/${TRANSFER}`, "GET"],
    [`/api/inventory/transfers/${TRANSFER}/dispatch`, "POST"],
    [`/api/inventory/transfers/${TRANSFER}/receive`, "POST"],
    [`/api/inventory/transfers/${TRANSFER}/cancel`, "POST"],
  ] as const) {
    const response = await handle(request(path, { method: "PUT" }));
    assert.equal(response.status, 405, path);
    assert.equal(response.headers.get("allow"), allow, path);
  }
});

test("mutations require exact Origin and every route requires one valid cookie", async () => {
  const handle = handler(repository());
  for (const origin of [null, "https://attacker.test", "http://panel.saas-staging.celebix.site", `${ORIGIN}/path`]) {
    assert.equal((await handle(request(`/api/inventory/counts/${COUNT}/start`, {
      method: "POST", origin, body: { operationId: OPERATION, expectedVersion: 1 },
    }))).status, 403);
  }
  assert.equal((await handle(request("/api/inventory/locations", { cookie: null }))).status, 401);
  assert.equal((await handle(request("/api/inventory/locations", { cookie: "other=value" }))).status, 401);
});

test("authorization, Celebix, Host, and forwarded authority headers are rejected", async () => {
  const handle = handler(repository());
  for (const name of [
    "authorization", "x-celebix-store", "x-store-id", "host", "forwarded",
    "x-forwarded-host", "x-forwarded-proto", "x-forwarded-uri", "x-forwarded-prefix", "x-forwarded-ssl",
  ]) {
    assert.equal((await handle(request("/api/inventory/locations", { headers: { [name]: name === "authorization" ? "Bearer private" : "private" } }))).status, 400, name);
  }
});

test("route adapter removes only the framework transport Host before core classification", async () => {
  const handle = handler(repository({ async listLocations() { return []; } }));
  const transport = request("/api/inventory/locations", {
    headers: { host: "internal:3400", "x-forwarded-uri": "/api/inventory/locations" },
  });
  const prepared = prepareInventoryRouteRequest(transport);
  assert.equal(prepared.headers.has("host"), false);
  assert.equal(prepared.headers.get("x-forwarded-uri"), "/api/inventory/locations");
  assert.equal((await handle(prepared)).status, 400);

  const ordinary = prepareInventoryRouteRequest(request("/api/inventory/locations", {
    headers: { host: "internal:3400" },
  }));
  assert.equal((await handle(ordinary)).status, 200);
});

test("balances query rejects missing, duplicate, unknown, encoded, and noncanonical identifiers", async () => {
  const handle = handler(repository());
  for (const query of [
    "", `locationId=${LOCATION}&locationId=${LOCATION}`, `locationId=${LOCATION}&x=1`,
    `locationId=%32${LOCATION.slice(1)}`, "locationId=not-a-uuid",
  ]) assert.equal((await handle(request(`/api/inventory/balances${query ? `?${query}` : ""}`))).status, 400);
});

test("mutation JSON is exact, bounded, fatal UTF-8, and validated before one repository call", async () => {
  let calls = 0;
  const handle = handler(repository({
    async startCount() { calls += 1; return mutation(COUNT, "counting"); },
  }));
  const path = `/api/inventory/counts/${COUNT}/start`;
  const valid = { operationId: OPERATION, expectedVersion: 1 };
  for (const candidate of [
    request(path, { method: "POST", body: { ...valid, storeId: STORE } }),
    request(path, { method: "POST", body: { operationId: OPERATION, expectedVersion: 0 } }),
    request(path, { method: "POST", body: { operationId: OPERATION, expectedVersion: Number.MAX_SAFE_INTEGER } }),
    request(path, { method: "POST", rawBody: "{" }),
    request(path, { method: "POST", rawBody: new Uint8Array([0xc3, 0x28]) }),
    request(path, { method: "POST", body: valid, headers: { "content-type": "application/json; charset=utf-8" } }),
    request(path, { method: "POST", rawBody: JSON.stringify(valid), headers: { "content-length": "131073" } }),
    request(path, { method: "POST", rawBody: JSON.stringify(valid), headers: { "content-length": "1" } }),
  ]) assert.equal((await handle(candidate)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handle(request(path, { method: "POST", body: valid }))).status, 200);
  assert.equal(calls, 1);

  const purchaseCalls = { count: 0 };
  const purchaseHandle = handler(repository({
    async savePurchaseOrder() { purchaseCalls.count += 1; return mutation(); },
  }));
  assert.equal((await purchaseHandle(request("/api/inventory/purchase-orders", {
    method: "POST",
    body: {
      operationId: OPERATION,
      locationId: LOCATION,
      supplierName: "Tedarikçi",
      lines: [
        { lineId: LINE, variantId: VARIANT, orderedQuantity: 1, unitCostCents: 4_000_000_001 },
        { lineId: SECOND_LINE, variantId: SECOND_VARIANT, orderedQuantity: 1, unitCostCents: 4_000_000_001 },
      ],
    },
  }))).status, 400);
  assert.equal(purchaseCalls.count, 0);
});

test("repository outcomes collapse to stable safe HTTP errors with no SQL or authority detail", async () => {
  for (const [caught, status, code] of [
    [inventoryFailure("invalid_input"), 400, "invalid_input"],
    [inventoryFailure("version_conflict"), 409, "conflict"],
    [inventoryFailure("membership_denied"), 403, "forbidden"],
    [inventoryFailure("resource_not_found"), 404, "not_found"],
    [new Error(`SELECT private FROM store ${STORE}`), 503, "unavailable"],
  ] as const) {
    const handle = handler(repository({ async listLocations() { throw caught; } }));
    const response = await handle(request("/api/inventory/locations"));
    assert.equal(response.status, status);
    const payload = await response.json();
    assert.deepEqual(payload, { code });
    assert.doesNotMatch(JSON.stringify(payload), /SELECT|private|store_id|principal|membership|10000000/i);
  }
});

test("constructible lookalikes and hostile repository errors always collapse to a stable unavailable envelope", async () => {
  for (const caught of [
    Object.assign(new Error("membership_denied"), { code: "membership_denied" }),
    Object.defineProperty({}, "code", { get() { throw new Error(`private ${STORE}`); } }),
    new Proxy({}, { getPrototypeOf() { throw new Error(`private ${STORE}`); } }),
  ]) {
    const handle = handler(repository({ async listLocations() { throw caught; } }));
    const response = await handle(request("/api/inventory/locations"));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "unavailable" });
  }
});

test("handler rejects sparse, accessor, and symbol-bearing repository list arrays without serializing null holes", async () => {
  let accessorReads = 0;
  const accessor = [location()];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    configurable: true,
    get() { accessorReads += 1; return location(); },
  });
  const symbol = [location()];
  Object.defineProperty(symbol, Symbol("private"), { enumerable: true, value: STORE });
  const proxy = new Proxy([location()], {
    getPrototypeOf() { throw inventoryFailure("membership_denied"); },
  });
  for (const value of [new Array(1), accessor, symbol, proxy]) {
    const handle = handler(repository({ async listLocations() { return value; } }));
    const response = await handle(request("/api/inventory/locations"));
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.equal(body, JSON.stringify({ code: "unavailable" }));
    assert.doesNotMatch(body, /null|private|10000000/i);
  }
  assert.equal(accessorReads, 0);
});

test("disabled default runtime remains unavailable and contains no database construction", async () => {
  const handle = createInventoryHttpHandler({
    async resolveRuntime() { return null; }, now: () => new Date(NOW), requestId: () => REQUEST_ID,
  });
  assert.equal((await handle(request("/api/inventory/locations"))).status, 503);
  const source = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./default.ts", import.meta.url), "utf8"));
  assert.match(source, /resolveDefaultServerPanelAccessRuntime/);
  assert.doesNotMatch(source, /new Pool|PostgresInventoryRepository|approved_staging/);
});
