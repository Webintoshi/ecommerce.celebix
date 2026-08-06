import assert from "node:assert/strict";
import test from "node:test";

import type { Shipment, ShippingConnection, ShippingQuoteSession, ShippingResource, TenantContext } from "@celebix/saas-contracts";
import type { ServerShippingRuntime } from "../server-shipping/runtime.ts";
import { createShippingHttpHandlers } from "./handler.ts";

const ORIGIN = "https://guzide.admin.saas-staging.celebix.site";
const REQUEST = "72000000-0000-4000-8000-000000000002";
const OPERATION = "72000000-0000-4000-8000-000000000003";
const JOB = "72000000-0000-4000-8000-000000000004";
const BRAND = "72000000-0000-4000-8000-000000000005";
const ADDRESS = "72000000-0000-4000-8000-000000000006";
const ORDER = "72000000-0000-4000-8000-000000000007";
const QUOTE = "72000000-0000-4000-8000-000000000008";
const OPTION = "72000000-0000-4000-8000-000000000009";
const SHIPMENT = "72000000-0000-4000-8000-000000000010";
const QUOTE_CREDENTIAL = "quote_0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

const PENDING: ShippingConnection = Object.freeze({
  providerCode: "basit_kargo", displayName: "Basit Kargo", status: "pending",
  credentialVersion: 1, codDeliveredMarksPaid: false, version: 1,
});
const ACTIVE: ShippingConnection = Object.freeze({
  ...PENDING, status: "active", selectedBrandLabel: "Güzide", selectedAddressLabel: "Merkez", version: 3,
});
const RESOURCES: readonly ShippingResource[] = Object.freeze([
  Object.freeze({ id: BRAND, kind: "brand", label: "Güzide", active: true, verifiedAt: NOW.toISOString() }),
  Object.freeze({ id: ADDRESS, kind: "address", label: "Merkez", active: true, verifiedAt: NOW.toISOString() }),
]);
const QUOTED: ShippingQuoteSession = Object.freeze({
  credential: QUOTE_CREDENTIAL, status: "quoted", expiresAt: "2026-08-06T12:15:00.000Z", currency: "TRY",
  packages: Object.freeze([Object.freeze({ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 2 })]),
  options: Object.freeze([Object.freeze({ id: OPTION, handlerCode: "YURTICI", handlerName: "Yurtiçi Kargo", desiKg: 2, priceCents: 12990, currency: "TRY" })]),
});
const READY: Shipment = Object.freeze({
  id: SHIPMENT, providerCode: "basit_kargo", direction: "outgoing", status: "ready", carrier: "Yurtiçi Kargo",
  barcode: "BK-123", trackingNumber: "TRK-123", priceCents: 12990, codAmountCents: 0, currency: "TRY",
  items: Object.freeze([Object.freeze({ orderItemId: "72000000-0000-4000-8000-000000000015", productName: "Kolye", quantity: 1 })]),
  events: Object.freeze([Object.freeze({ id: "72000000-0000-4000-8000-000000000016", status: "ready", occurredAt: NOW.toISOString() })]),
  label: Object.freeze({ available: false }), version: 2, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
});

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1, requestId: REQUEST,
    principal: { id: "72000000-0000-4000-8000-000000000011", issuer: "https://id.test", subject: "merchant" },
    store: { id: "72000000-0000-4000-8000-000000000012", slug: "guzide", status: "active" },
    membership: { id: "72000000-0000-4000-8000-000000000013", role, status: "active" },
    entitlements: { schemaVersion: 1, planId: "72000000-0000-4000-8000-000000000014", planCode: "starter", version: 1, status: "active", features: ["integrations"], limits: { products: 100, staff: 5, storageBytes: 1_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

function request(path: string, method = "GET", value?: unknown, origin = ORIGIN, headers: HeadersInit = {}) {
  const selected = new Headers(headers);
  selected.set("cookie", `__Host-celebix_panel=${COOKIE}`);
  if (method !== "GET") {
    selected.set("origin", origin);
    selected.set("content-type", "application/json");
  }
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body !== undefined) selected.set("content-length", String(Buffer.byteLength(body)));
  return new Request(`http://customer-panel:3400${path}`, { method, headers: selected, body });
}

function fixture(role: "store_owner" | "analyst" = "store_owner") {
  const calls = {
    saved: [] as unknown[], selected: [] as unknown[], revoked: [] as unknown[], validated: [] as unknown[],
    quoted: [] as unknown[], shipped: [] as unknown[], fulfilled: [] as unknown[],
  };
  let setup: Readonly<{ connection: ShippingConnection; resources: readonly ShippingResource[] }> | null = null;
  const admin = {
    async current() { return setup?.connection ?? null; },
    async setup() { return setup; },
    async saveConnection(input: unknown) { calls.saved.push(input); setup = { connection: PENDING, resources: RESOURCES }; return { connection: PENDING, validationJobId: JOB }; },
    async selectResources(input: unknown) { calls.selected.push(input); setup = { connection: ACTIVE, resources: RESOURCES }; return ACTIVE; },
    async revokeConnection(input: unknown) { calls.revoked.push(input); setup = { connection: { ...ACTIVE, status: "revoked", version: 4 }, resources: [] }; return setup.connection; },
    async beginQuote(input: unknown) { calls.quoted.push(input); return { credential: QUOTE_CREDENTIAL, quoteId: QUOTE, jobId: JOB, expiresAt: QUOTED.expiresAt, packages: QUOTED.packages, replayed: false }; },
    async currentQuote() { return QUOTED; },
    async beginShipment(input: unknown) { calls.shipped.push(input); return { shipment: { ...READY, status: "creating" }, jobId: JOB, replayed: false }; },
    async currentShipment() { return READY; },
    async currentShipmentForOrder() { return READY; },
  };
  const runtime = {
    access: {
      readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN,
      async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(role) }; },
    },
    admin,
  } as unknown as ServerShippingRuntime;
  return {
    calls,
    handlers: createShippingHttpHandlers({
      async resolveRuntime() { return runtime; }, now: () => new Date(NOW), requestId: () => REQUEST,
      async validateJob(input) { calls.validated.push(input); return "completed"; },
      async fulfillJob(input) { calls.fulfilled.push(input); return "completed"; },
    }),
  };
}

test("shipping connection GET returns only safe tenant connection resources", async () => {
  const selected = fixture();
  const response = await selected.handlers.connection(request("/api/settings/shipping/connection"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connection: null, resources: [] });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("order quote and shipment endpoints accept only safe browser choices", async () => {
  const selected = fixture();
  const quoteResponse = await selected.handlers.quote(request(`/api/orders/${ORDER}/shipping/quotes`, "POST", {
    operationId: OPERATION, expectedOrderVersion: 3,
    packages: [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 2 }],
  }), ORDER);
  assert.equal(quoteResponse.status, 200);
  assert.deepEqual(await quoteResponse.json(), { quote: QUOTED });
  assert.equal(selected.calls.quoted.length, 1);
  assert.equal(selected.calls.fulfilled.length, 1);

  const shipmentResponse = await selected.handlers.shipment(request(`/api/orders/${ORDER}/shipping/shipments`, "POST", {
    operationId: OPERATION, expectedOrderVersion: 3, quoteCredential: QUOTE_CREDENTIAL, optionId: OPTION,
  }), ORDER);
  assert.equal(shipmentResponse.status, 201);
  assert.deepEqual(await shipmentResponse.json(), { shipment: READY });
  assert.equal(selected.calls.shipped.length, 1);

  const currentResponse = await selected.handlers.shipmentDetail(request(`/api/orders/${ORDER}/shipping/shipments/${SHIPMENT}`), ORDER, SHIPMENT);
  assert.equal(currentResponse.status, 200);
  assert.deepEqual(await currentResponse.json(), { shipment: READY });
  const orderShipmentResponse = await selected.handlers.shipmentForOrder(request(`/api/orders/${ORDER}/shipping/shipments`), ORDER);
  assert.equal(orderShipmentResponse.status, 200);
  assert.deepEqual(await orderShipmentResponse.json(), { shipment: READY });
});

test("fulfillment endpoints reject forged identifiers and private provider input", async () => {
  const selected = fixture();
  const invalid = [
    await selected.handlers.quote(request(`/api/orders/${ORDER}/shipping/quotes`, "POST", { operationId: OPERATION, expectedOrderVersion: 3, packages: [], storeId: BRAND }), ORDER),
    await selected.handlers.shipment(request(`/api/orders/${ORDER}/shipping/shipments`, "POST", { operationId: OPERATION, expectedOrderVersion: 3, quoteCredential: QUOTE_CREDENTIAL, optionId: OPTION, handlerCode: "FORGED" }), ORDER),
    await selected.handlers.shipmentDetail(request(`/api/orders/${ORDER}/shipping/shipments/not-a-uuid`), ORDER, "not-a-uuid"),
  ];
  for (const response of invalid) assert.equal(response.status, 400);
  assert.equal(selected.calls.quoted.length + selected.calls.shipped.length, 0);
});

test("connection save accepts only token and operation identity then runs exact validation job", async () => {
  const selected = fixture();
  const response = await selected.handlers.connection(request("/api/settings/shipping/connection", "POST", {
    token: "bk_live_secret_123456789", operationId: OPERATION,
  }));
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(JSON.stringify(payload).includes("bk_live_secret"), false);
  assert.equal(selected.calls.saved.length, 1);
  assert.equal(selected.calls.validated.length, 1);
  assert.equal((selected.calls.validated[0] as { jobId: string }).jobId, JOB);
});

test("resource selection and revoke carry only safe browser choices", async () => {
  const selected = fixture();
  await selected.handlers.connection(request("/api/settings/shipping/connection", "POST", { token: "bk_live_secret_123456789", operationId: OPERATION }));
  const resourceResponse = await selected.handlers.resources(request("/api/settings/shipping/connection/resources", "PATCH", {
    operationId: OPERATION, brandResourceId: BRAND, addressResourceId: ADDRESS, codDeliveredMarksPaid: true,
  }));
  assert.equal(resourceResponse.status, 200);
  assert.equal((await resourceResponse.json()).connection.status, "active");
  assert.equal(selected.calls.selected.length, 1);
  const revokeResponse = await selected.handlers.revoke(request("/api/settings/shipping/connection/revoke", "DELETE", { operationId: OPERATION }));
  assert.equal(revokeResponse.status, 200);
  assert.equal((await revokeResponse.json()).connection.status, "revoked");
  assert.equal(selected.calls.revoked.length, 1);
});

test("wrong origin analyst mutation private headers and malformed token fail before writes", async () => {
  const wrongOrigin = fixture();
  const analyst = fixture("analyst");
  const privateHeader = fixture();
  const malformed = fixture();
  const responses = [
    await wrongOrigin.handlers.connection(request("/api/settings/shipping/connection", "POST", { token: "bk_live_secret_123456789", operationId: OPERATION }, "https://attacker.test")),
    await analyst.handlers.connection(request("/api/settings/shipping/connection", "POST", { token: "bk_live_secret_123456789", operationId: OPERATION })),
    await privateHeader.handlers.connection(request("/api/settings/shipping/connection", "GET", undefined, ORIGIN, { authorization: "Bearer private" })),
    await malformed.handlers.connection(request("/api/settings/shipping/connection", "POST", { token: "short", operationId: OPERATION })),
  ];
  for (const response of responses) assert.notEqual(response.status, 200);
  assert.equal(wrongOrigin.calls.saved.length + analyst.calls.saved.length + privateHeader.calls.saved.length + malformed.calls.saved.length, 0);
});
