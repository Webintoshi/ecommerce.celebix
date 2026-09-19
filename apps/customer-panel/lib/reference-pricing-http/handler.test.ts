import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext, VariantPricingPolicy } from "@celebix/saas-contracts";
import { ReferencePricingRepositoryError, type ReferencePricingRepository } from "@celebix/saas-data";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const OTHER_ORIGIN = "https://other-store.admin.saas-staging.celebix.site";
const STORE = "10000000-0000-4000-8000-000000000001";
const SET = "20000000-0000-4000-8000-000000000001";
const REFERENCE = "30000000-0000-4000-8000-000000000001";
const VARIANT = "40000000-0000-4000-8000-000000000001";
const PRODUCT = "50000000-0000-4000-8000-000000000001";
const OP = "60000000-0000-4000-8000-000000000001";
const REQUEST = "70000000-0000-4000-8000-000000000001";
const DIGEST = "a".repeat(64);
const NOW = new Date("2026-09-20T12:00:00.000Z");
const UTC = "2026-09-20T12:00:00.000000Z";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;

function tenant(role: "store_owner" | "editor" = "store_owner"): TenantContext {
  return { schemaVersion: 1, requestId: REQUEST, principal: { id: REQUEST, issuer: "https://id.test", subject: "private" }, store: { id: STORE, slug: "guzide-kuyumcu-4", status: "active" }, membership: { id: REQUEST, role, status: "active" }, entitlements: { schemaVersion: 1, planId: REQUEST, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_000_000 }, validFrom: NOW.toISOString() }, locale: "tr-TR" };
}

function repository(overrides: Partial<ReferencePricingRepository> = {}): ReferencePricingRepository {
  const unexpected = async (): Promise<never> => { throw new Error("unexpected repository call"); };
  return { listDefinitions: unexpected, list: unexpected, get: unexpected, getPolicy: unexpected, preview: unexpected, define: unexpected, saveSet: unexpected, activate: unexpected, savePolicy: unexpected, ...overrides };
}

function request(path: string, options: { method?: string; body?: unknown; origin?: string | null; cookie?: string | null; headers?: HeadersInit } = {}): Request {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? COOKIE);
  if (method === "POST") {
    headers.set("content-type", "application/json");
    if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  }
  return new Request(`http://internal:3400${path}`, { method, headers, body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined });
}

async function handler(pricing: ReferencePricingRepository, role: "store_owner" | "editor" = "store_owner") {
  let credentials = 0;
  const module = await import("./handler.ts");
  const handle = module.createReferencePricingHttpHandler({
    async resolveRuntime() {
      return { referencePricing: pricing, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN,
        async resolveCredential() { credentials += 1; return { kind: "authenticated", tenantContext: tenant(role), session: {} } as never; },
      } } as never;
    },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
  });
  return { handle, credentialCalls: () => credentials };
}

test("finite read and write routes pass only parsed input with server tenant authority", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const observe = <K extends keyof ReferencePricingRepository>(name: K, result: Awaited<ReturnType<ReferencePricingRepository[K]>>) => async (input: Record<string, unknown>) => { calls.push([name, input]); return result; };
  const set = { setId: SET, version: 2, stateVersion: 3, isActive: false, createdAt: UTC, values: [{ referenceId: REFERENCE, kind: "usd" as const, label: "USD satış", rateTry: "40", active: true }] };
  const identity = { id: REFERENCE, kind: "usd" as const, label: "USD satış", createdAt: UTC };
  const policy: VariantPricingPolicy = { method: "fixed_try", fixedPriceCents: 12_000 };
  const policyProjection = { variantId: VARIANT, variantVersion: 4, version: 1, policy, updatedAt: UTC };
  const preview = { setId: SET, scopeDigest: DIGEST, affectedProducts: 1, affectedVariants: 1, fixedOverrideVariants: 0, unavailableVariants: 0, entries: [{ variantId: VARIANT, productId: PRODUCT, oldPriceCents: 10_000, newPriceCents: 12_000, overriddenByPriceList: false }], nextCursor: null };
  const pricing = repository({
    listDefinitions: observe("listDefinitions", { items: [identity] }) as ReferencePricingRepository["listDefinitions"],
    list: observe("list", { activeSetId: null, stateVersion: 3, items: [{ setId: SET, version: 2, createdAt: UTC, isActive: false }], nextCursor: null }) as ReferencePricingRepository["list"],
    get: observe("get", set) as ReferencePricingRepository["get"],
    getPolicy: observe("getPolicy", policyProjection) as ReferencePricingRepository["getPolicy"],
    preview: observe("preview", preview) as ReferencePricingRepository["preview"],
    define: observe("define", identity) as ReferencePricingRepository["define"],
    saveSet: observe("saveSet", set) as ReferencePricingRepository["saveSet"],
    activate: observe("activate", { setId: SET, version: 2, stateVersion: 4, activatedAt: UTC }) as ReferencePricingRepository["activate"],
    savePolicy: observe("savePolicy", policyProjection) as ReferencePricingRepository["savePolicy"],
  });
  const { handle } = await handler(pricing);
  const cases = [
    ["GET", "/api/reference-pricing/definitions", undefined],
    ["GET", "/api/reference-pricing/sets?pageSize=20&afterSetVersion=2", undefined],
    ["GET", "/api/reference-pricing/sets/current", undefined],
    ["GET", `/api/reference-pricing/sets/${SET}`, undefined],
    ["GET", `/api/reference-pricing/policies/${VARIANT}`, undefined],
    ["POST", "/api/reference-pricing/preview", { setId: SET, channel: "storefront", pageSize: 50 }],
    ["POST", "/api/reference-pricing/definitions", { operationId: OP, referenceId: REFERENCE, kind: "usd", label: "USD satış" }],
    ["POST", "/api/reference-pricing/sets", { operationId: OP, setId: SET, expectedStateVersion: 3, values: [{ referenceId: REFERENCE, rateTry: "40", active: true }] }],
    ["POST", `/api/reference-pricing/sets/${SET}/activate`, { operationId: OP, expectedStateVersion: 3, expectedScopeDigest: DIGEST }],
    ["POST", `/api/reference-pricing/policies/${VARIANT}`, { operationId: OP, expectedVariantVersion: 4, expectedPolicyVersion: 0, policy }],
  ] as const;
  for (const [method, path, body] of cases) assert.equal((await handle(request(path, { method, body }))).status, 200, path);
  assert.deepEqual(calls.map(([name]) => name), ["listDefinitions", "list", "get", "get", "getPolicy", "preview", "define", "saveSet", "activate", "savePolicy"]);
  for (const [, input] of calls) {
    assert.deepEqual(input.tenantContext, tenant());
    assert.deepEqual(input.now, NOW);
    for (const key of ["storeId", "tenantId", "principalId", "membershipId", "databaseRole"]) assert.equal(key in input, false);
  }
  assert.deepEqual(calls[1]![1], { tenantContext: tenant(), now: NOW, pageSize: 20, afterSetVersion: 2 });
  assert.deepEqual(calls[5]![1], { tenantContext: tenant(), now: NOW, setId: SET, channel: "storefront", pageSize: 50 });
  assert.deepEqual(calls[9]![1], { tenantContext: tenant(), now: NOW, operationId: OP, variantId: VARIANT, expectedVariantVersion: 4, expectedPolicyVersion: 0, policy });
});

test("missing session, read-only role, and cross-tenant origin deny mutation before repository", async () => {
  let calls = 0;
  const pricing = repository({ async define() { calls += 1; throw new Error("unreachable"); } });
  const owner = await handler(pricing);
  const body = { operationId: OP, referenceId: REFERENCE, kind: "usd", label: "USD satış" };
  assert.equal((await owner.handle(request("/api/reference-pricing/definitions", { method: "POST", body, cookie: null }))).status, 401);
  assert.equal((await owner.handle(request("/api/reference-pricing/definitions", { method: "POST", body, origin: OTHER_ORIGIN }))).status, 403);
  assert.equal((await owner.handle(request("/api/reference-pricing/definitions", { method: "POST", body, origin: TENANT_ORIGIN }))).status, 503);
  const editor = await handler(pricing, "editor");
  assert.equal((await editor.handle(request("/api/reference-pricing/definitions", { method: "POST", body }))).status, 403);
  assert.equal(calls, 1);
});

test("unexpected routes, query fields, private headers, and malformed bodies fail before repository", async () => {
  let calls = 0;
  const { handle, credentialCalls } = await handler(repository({ async list() { calls += 1; throw new Error("unreachable"); } }));
  for (const [method, path, options, status] of [
    ["GET", "/api/reference-pricing/sets?other=1", {}, 400],
    ["GET", "/api/reference-pricing/sets?pageSize=0", {}, 400],
    ["GET", "/api/reference-pricing/sets?pageSize=10&pageSize=20", {}, 400],
    ["GET", "/api/reference-pricing/sets/current?x=1", {}, 400],
    ["GET", "/api/reference-pricing/sets/not-an-id", {}, 404],
    ["GET", "/api/reference-pricing/sets", { headers: { "x-store-id": STORE } }, 400],
    ["POST", "/api/reference-pricing/sets", { body: { operationId: OP, setId: SET, expectedStateVersion: 0, values: [{ referenceId: REFERENCE, rateTry: "40", active: true }], storeId: STORE } }, 400],
    ["POST", "/api/reference-pricing/sets", { body: { operationId: OP, setId: SET, expectedStateVersion: 0, values: [{ referenceId: REFERENCE, rateTry: "0", active: true }] } }, 400],
    ["POST", "/api/reference-pricing/preview", { body: { setId: SET, channel: "browser", pageSize: 50 } }, 400],
    ["DELETE", `/api/reference-pricing/sets/${SET}`, {}, 405],
  ] as const) assert.equal((await handle(request(path, { method, ...options }))).status, status, `${method} ${path}`);
  assert.equal(calls, 0);
  assert.equal(credentialCalls(), 0);
});

test("trusted repository conflicts and unavailable failures map to finite public codes", async () => {
  for (const [repositoryCode, expectedStatus, expectedBody] of [
    ["version_conflict", 409, { code: "conflict" }],
    ["scope_conflict", 409, { code: "conflict" }],
    ["resource_not_found", 404, { code: "not_found" }],
    ["membership_denied", 403, { code: "forbidden" }],
    ["unavailable", 503, { code: "unavailable" }],
  ] as const) {
    const { handle } = await handler(repository({ async get() { throw new ReferencePricingRepositoryError(repositoryCode); } }));
    const response = await handle(request(`/api/reference-pricing/sets/${SET}`));
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(await response.json(), expectedBody);
  }
});

test("hostile repository output is not serialized as a successful browser response", async () => {
  let getterReads = 0;
  const hostile = Object.defineProperty({}, "items", { enumerable: true, get() { getterReads += 1; return []; } });
  const { handle } = await handler(repository({ async listDefinitions() { return hostile as never; } }));
  const response = await handle(request("/api/reference-pricing/definitions"));
  assert.equal(response.status, 503);
  assert.equal(getterReads, 0);
});
