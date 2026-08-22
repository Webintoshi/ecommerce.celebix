import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import { StorefrontContentRepositoryError, type StorePolicyAdminRepository } from "@celebix/saas-data";

import { createStorePolicyHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const OTHER_TENANT_ADMIN_ORIGIN = "https://other-store.admin.saas-staging.celebix.site";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const REQUEST = "78000000-0000-4000-8000-000000000071";
const OPERATION = "79000000-0000-4000-8000-000000000071";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST,
    principal: { id: "10000000-0000-4000-8000-000000000071", issuer: "https://id.test/oidc", subject: "private" },
    store: { id: "20000000-0000-4000-8000-000000000071", slug: "guzide-kuyumcu-4", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000071", role, status: "active" },
    entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000071", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

const PAGE = Object.freeze({ key: "kvkk" as const, label: "KVKK", route: "/policies/kvkk", ordinal: 3, status: "published" as const, body: "## KVKK", version: 2, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });

function repository(overrides: Partial<StorePolicyAdminRepository> = {}): StorePolicyAdminRepository {
  return {
    async list() { return Object.freeze([PAGE]); },
    async save() { return PAGE; },
    ...overrides,
  };
}

function handlers(policies: StorePolicyAdminRepository, role: "store_owner" | "analyst" = "store_owner") {
  return createStorePolicyHttpHandlers({
    async resolveRuntime() {
      return {
        policies,
        access: {
          readiness: { mode: "approved_staging" },
          panelOrigin: ORIGIN,
          async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(role) }; },
          async rotateCredential() { return { kind: "unavailable" }; },
          async revokeCredential() { return { kind: "unavailable" }; },
        },
      } as never;
    },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
  });
}

function request(path: string, method = "GET", body?: unknown, origin = ORIGIN, extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  headers.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (method === "PATCH") {
    headers.set("origin", origin);
    headers.set("content-type", "application/json");
  }
  return new Request(`http://internal:3400${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("fixed policy GET lists and selects only server-authorized records", async () => {
  const calls: unknown[] = [];
  const selected = handlers(repository({ async list(input) { calls.push(input); return Object.freeze([PAGE]); } }));
  const list = await selected.collection(request("/api/storefront-policies"));
  const one = await selected.item(request("/api/storefront-policies/kvkk"), "kvkk");
  assert.equal(list.status, 200);
  assert.equal(one.status, 200);
  assert.equal((await one.json()).key, "kvkk");
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
});

test("policy PATCH accepts only body status version and operation without browser tenant authority", async () => {
  const calls: unknown[] = [];
  const selected = handlers(repository({ async save(input) { calls.push(input); return PAGE; } }));
  const response = await selected.item(request("/api/storefront-policies/kvkk", "PATCH", { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published" }), "kvkk");
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls).includes("storeId"), false);
  assert.equal((calls[0] as { key: string }).key, "kvkk");

  const privateAuthority = await selected.item(request("/api/storefront-policies/kvkk", "PATCH", { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published", storeId: "x" }), "kvkk");
  assert.equal(privateAuthority.status, 400);
  assert.equal(calls.length, 1);
});

test("tenant admin policy mutations survive internal proxy delivery and stay store-bound", async () => {
  const calls: unknown[] = [];
  const selected = handlers(repository({ async save(input) { calls.push(input); return PAGE; } }));

  const accepted = await selected.item(request("/api/storefront-policies/kvkk", "PATCH", {
    operationId: OPERATION,
    expectedVersion: 1,
    body: "## KVKK",
    status: "published",
  }, TENANT_ADMIN_ORIGIN), "kvkk");

  assert.equal(accepted.status, 200);
  assert.equal(calls.length, 1);

  const rejected = await selected.item(request("/api/storefront-policies/kvkk", "PATCH", {
    operationId: OPERATION,
    expectedVersion: 1,
    body: "## KVKK",
    status: "published",
  }, OTHER_TENANT_ADMIN_ORIGIN), "kvkk");

  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { code: "origin_denied" });
  assert.equal(calls.length, 1);
});

test("policy authority denies wrong origin paths private headers and analyst mutation", async () => {
  const selected = handlers(repository());
  assert.equal((await selected.item(request("/api/storefront-policies/kvkk", "PATCH", { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published" }, "https://attacker.test"), "kvkk")).status, 403);
  assert.equal((await selected.item(request("/api/storefront-policies/kvkk?x=1"), "kvkk")).status, 400);
  assert.equal((await selected.collection(request("/api/storefront-policies", "GET", undefined, ORIGIN, { "x-store-id": "x" }))).status, 400);
  assert.equal((await handlers(repository(), "analyst").item(request("/api/storefront-policies/kvkk", "PATCH", { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published" }), "kvkk")).status, 403);
});

test("policy conflicts remain finite and unavailable details never escape", async () => {
  for (const [code, status] of [["version_conflict", 409], ["commit_unknown", 503]] as const) {
    const selected = handlers(repository({ async save() { throw new StorefrontContentRepositoryError(code); } }));
    const response = await selected.item(request("/api/storefront-policies/kvkk", "PATCH", { operationId: OPERATION, expectedVersion: 1, body: "## KVKK", status: "published" }), "kvkk");
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code });
  }
});
