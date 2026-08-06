import assert from "node:assert/strict";
import test from "node:test";

import type { ShippingConnection, ShippingResource, TenantContext } from "@celebix/saas-contracts";
import type { ServerShippingRuntime } from "../server-shipping/runtime.ts";
import { createShippingHttpHandlers } from "./handler.ts";

const ORIGIN = "https://guzide.admin.saas-staging.celebix.site";
const REQUEST = "72000000-0000-4000-8000-000000000002";
const OPERATION = "72000000-0000-4000-8000-000000000003";
const JOB = "72000000-0000-4000-8000-000000000004";
const BRAND = "72000000-0000-4000-8000-000000000005";
const ADDRESS = "72000000-0000-4000-8000-000000000006";
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
  const calls = { saved: [] as unknown[], selected: [] as unknown[], revoked: [] as unknown[], validated: [] as unknown[] };
  let setup: Readonly<{ connection: ShippingConnection; resources: readonly ShippingResource[] }> | null = null;
  const admin = {
    async current() { return setup?.connection ?? null; },
    async setup() { return setup; },
    async saveConnection(input: unknown) { calls.saved.push(input); setup = { connection: PENDING, resources: RESOURCES }; return { connection: PENDING, validationJobId: JOB }; },
    async selectResources(input: unknown) { calls.selected.push(input); setup = { connection: ACTIVE, resources: RESOURCES }; return ACTIVE; },
    async revokeConnection(input: unknown) { calls.revoked.push(input); setup = { connection: { ...ACTIVE, status: "revoked", version: 4 }, resources: [] }; return setup.connection; },
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
