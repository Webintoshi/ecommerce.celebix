import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import { AbandonedCartRepositoryError, type AbandonedCartRepository } from "@celebix/saas-data";

import type { ServerAbandonedCartRuntime } from "../server-abandoned-carts/runtime.ts";
import { createAbandonedCartHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://merchant.admin.saas-staging.celebix.site";
const OTHER_TENANT_ADMIN_ORIGIN = "https://other-merchant.admin.saas-staging.celebix.site";
const BASE = "/api/orders/abandoned-carts";
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REQUEST_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-07-22T16:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;

function tenantContext(): TenantContext {
  return { schemaVersion: 1, requestId: REQUEST_ID, principal: { id: "11111111-1111-4111-8111-111111111111", issuer: "https://id.example/oidc", subject: "merchant" }, store: { id: "22222222-2222-4222-8222-222222222222", slug: "merchant", status: "active" }, membership: { id: "33333333-3333-4333-8333-333333333333", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "44444444-4444-4444-8444-444444444444", planCode: "free_starter", version: 1, status: "active", features: ["orders"], limits: { products: 100, staff: 1, storageBytes: 1024, monthlyOrders: 100 }, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext;
}

function cart(status: "abandoned" | "recovered" = "abandoned") {
  return { id: ID, status, customerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", customerName: "Ada", customerEmail: "ada@example.test", currency: "TRY", subtotalCents: 10000, discountCents: 0, totalCents: 10000, itemCount: 1, firstProductName: "Ürün", checkoutStartedAt: NOW.toISOString(), lastActivityAt: NOW.toISOString(), ...(status === "abandoned" ? { abandonedAt: NOW.toISOString() } : { abandonedAt: NOW.toISOString(), recoveredAt: NOW.toISOString() }), version: 3, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() } as const;
}

function repository(overrides: Partial<AbandonedCartRepository> = {}): AbandonedCartRepository {
  const reject = async () => { throw new Error("unexpected"); };
  return { getSummary: reject, list: reject, get: reject, markRecovered: reject, archive: reject, ...overrides } as AbandonedCartRepository;
}

function runtime(carts: AbandonedCartRepository, accessKind: "authenticated" | "unauthenticated" = "authenticated"): ServerAbandonedCartRuntime {
  return { abandonedCarts: carts, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return accessKind === "authenticated" ? { kind: "authenticated", session: {}, tenantContext: tenantContext() } as never : { kind: "unauthenticated" }; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as ServerAbandonedCartRuntime;
}

function request(path: string, options: { method?: string; origin?: string | null; body?: unknown; cookie?: string | null; headers?: HeadersInit } = {}) {
  const method = options.method ?? "GET"; const headers = new Headers(options.headers);
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? `__Host-celebix_panel=${CREDENTIAL}`);
  if (method !== "GET") { headers.set("content-type", "application/json"); headers.set("idempotency-key", OPERATION); if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN); }
  return new Request(`http://internal:3400${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(options.body ?? { expectedVersion: 3 }) });
}

function handlers(carts: AbandonedCartRepository, accessKind: "authenticated" | "unauthenticated" = "authenticated") {
  return createAbandonedCartHttpHandlers({ async resolveRuntime() { return runtime(carts, accessKind); }, now: () => new Date(NOW), requestId: () => REQUEST_ID });
}

test("authenticated summary, list and detail receive only server TenantContext", async () => {
  const calls: unknown[] = []; const item = cart();
  const api = handlers(repository({
    async getSummary(input) { calls.push(input); return { abandoned: 1, recovered: 0, lostValueCents: 10000, recoveredValueCents: 0, currency: "TRY", asOf: NOW.toISOString() }; },
    async list(input) { calls.push(input); return { items: [item] }; },
    async get(input) { calls.push(input); return { ...item, items: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", position: 0, productName: "Ürün", unitPriceCents: 10000, quantity: 1, discountCents: 0, lineTotalCents: 10000 }] }; },
  }));
  assert.equal((await api.getSummary(request(`${BASE}/summary`))).status, 200);
  assert.equal((await api.list(request(`${BASE}?status=abandoned&sort=newest`))).status, 200);
  assert.equal((await api.get(request(`${BASE}/${ID}`), ID)).status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenantContext());
  assert.equal(JSON.stringify(calls).includes("__Host-celebix_panel"), false);
});

test("recovered and archive mutations require exact Origin and idempotency authority", async () => {
  const calls: unknown[] = [];
  const api = handlers(repository({
    async markRecovered(input) { calls.push(input); return { id: ID, status: "recovered", version: 4, updatedAt: NOW.toISOString(), replayed: false }; },
    async archive(input) { calls.push(input); return { id: ID, status: "archived", version: 4, updatedAt: NOW.toISOString(), replayed: false }; },
  }));
  assert.equal((await api.markRecovered(request(`${BASE}/${ID}/recovered`, { method: "POST" }), ID)).status, 200);
  assert.equal((await api.archive(request(`${BASE}/${ID}/archive`, { method: "POST" }), ID)).status, 200);
  assert.deepEqual(calls[0], { tenantContext: tenantContext(), now: NOW, cartId: ID, operationId: OPERATION, expectedVersion: 3 });
  assert.equal((await api.archive(request(`${BASE}/${ID}/archive`, { method: "POST", origin: null }), ID)).status, 403);
});

test("abandoned cart mutations survive tenant admin proxy delivery and stay store-bound", async () => {
  const calls: unknown[] = [];
  const api = handlers(repository({
    async archive(input) { calls.push(input); return { id: ID, status: "archived", version: 4, updatedAt: NOW.toISOString(), replayed: false }; },
  }));
  const forwarded = { host: "customer-panel:3400", forwarded: "host=attacker.example;proto=https", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" };
  assert.equal((await api.archive(request(`${BASE}/${ID}/archive`, { method: "POST", origin: TENANT_ADMIN_ORIGIN, headers: forwarded }), ID)).status, 200);
  assert.equal((await api.archive(request(`${BASE}/${ID}/archive`, { method: "POST", origin: OTHER_TENANT_ADMIN_ORIGIN, headers: { ...forwarded, "x-forwarded-host": "merchant.admin.saas-staging.celebix.site" } }), ID)).status, 403);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenantContext());
});

test("session, path, private authority, repository errors and disabled runtime fail closed", async () => {
  assert.equal((await handlers(repository(), "unauthenticated").getSummary(request(`${BASE}/summary`))).status, 401);
  assert.equal((await handlers(repository()).get(request(`${BASE}/bad`), "bad")).status, 400);
  assert.equal((await handlers(repository()).getSummary(request(`${BASE}/summary`, { headers: { "x-store-id": ID } }))).status, 400);
  assert.equal((await handlers(repository({ async getSummary() { throw new AbandonedCartRepositoryError("cart_not_found"); } })).getSummary(request(`${BASE}/summary`))).status, 404);
  const disabled = createAbandonedCartHttpHandlers({ async resolveRuntime() { return null; }, now: () => NOW, requestId: () => REQUEST_ID });
  assert.equal((await disabled.getSummary(request(`${BASE}/summary`))).status, 503);
});
