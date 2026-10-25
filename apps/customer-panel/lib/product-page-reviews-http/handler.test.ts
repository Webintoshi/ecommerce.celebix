import assert from "node:assert/strict";
import test from "node:test";
import * as saasData from "@celebix/saas-data";
import { createProductPageReviewHttpHandlers } from "./handler.ts";
const PATH = "/api/catalog/admin/product-page-reviews/settings", ORIGIN = "https://panel.saas-staging.celebix.site";
const OP = "74000000-0000-4000-8000-000000000001", REQ = "78000000-0000-4000-8000-000000000001", NOW = new Date("2026-10-24T09:00:00Z");
const COOKIE = `__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
function tenant(role = "store_owner") { return { schemaVersion: 1, requestId: REQ, principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "fixture", subject: "owner" }, store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00Z" }, locale: "tr-TR" }; }
function handlers(repository: any, role = "store_owner", authenticated = true) {
  return createProductPageReviewHttpHandlers({ resolveRuntime: async () => ({ catalogAdmin: {}, productPageReviews: repository, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, resolveCredential: async () => authenticated ? { kind: "authenticated", tenantContext: tenant(role), session: {} } : { kind: "unauthenticated" } } }) as any, now: () => new Date(NOW), requestId: () => REQ });
}
function request(method = "GET", body?: unknown, extras: HeadersInit = {}, path = PATH) { const headers = new Headers({ cookie: COOKIE, ...(method === "POST" ? { origin: ORIGIN, "content-type": "application/json", "idempotency-key": OP } : {}) }); for (const [name, value] of new Headers(extras)) headers.set(name, value); return new Request(`http://customer-panel:3400${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }

test("settings reject missing sessions foreign origins and forged tenant authority before data access", async () => {
  let calls = 0; const repo = { settings: async () => { calls++; return { enabled: false, version: 0 }; }, saveSettings: async () => { calls++; return { enabled: true, version: 1 }; } }, h = handlers(repo);
  assert.equal((await h.get(new Request(`http://internal${PATH}`))).status, 401);
  assert.equal((await handlers(repo, "store_owner", false).get(request())).status, 401);
  for (const origin of ["https://attacker.test", "https://other.admin.saas-staging.celebix.site"]) assert.equal((await h.save(request("POST", { expectedVersion: 0, enabled: true }, { origin }))).status, 403);
  assert.equal((await h.get(request("GET", undefined, { "x-store-id": OP }))).status, 400);
  assert.equal((await h.get(request("GET", undefined, {}, `${PATH}?storeId=${OP}`))).status, 400);
  assert.equal((await h.get(request("GET", undefined, {}, `${PATH}-other`))).status, 400);
  assert.equal(calls, 0);
});

test("settings pass only authenticated authority and exact version-zero command and operation", async () => {
  const calls: any[] = [], h = handlers({ settings: async (value: any) => { calls.push(value); return { enabled: false, version: 0 }; }, saveSettings: async (value: any) => { calls.push(value); return { enabled: true, version: 1 }; } });
  const read = await h.get(request()); assert.equal(read.status, 200); assert.deepEqual(await read.json(), { enabled: false, version: 0 }); assert.equal(read.headers.get("cache-control"), "no-store");
  const saved = await h.save(request("POST", { expectedVersion: 0, enabled: true }, { origin: "https://store.admin.saas-staging.celebix.site", host: "customer-panel:3400", "x-forwarded-host": "attacker.test" }));
  assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { enabled: true, version: 1 });
  assert.deepEqual(calls, [{ tenantContext: tenant(), now: NOW }, { tenantContext: tenant(), now: NOW, operationId: OP, expectedVersion: 0, enabled: true }]);
});

test("read-only catalog roles can view the setting and cannot save it", async () => {
  let saves = 0; const h = handlers({ settings: async () => ({ enabled: true, version: 4 }), saveSettings: async () => { saves++; return { enabled: false, version: 5 }; } }, "analyst");
  assert.equal((await h.get(request())).status, 200); assert.equal((await h.save(request("POST", { expectedVersion: 4, enabled: false }))).status, 403); assert.equal(saves, 0);
});

test("settings reject extra fields unsafe versions invalid booleans missing keys and oversized bodies", async () => {
  let saves = 0; const h = handlers({ saveSettings: async () => { saves++; return { enabled: true, version: 1 }; } });
  for (const body of [{ expectedVersion: -1, enabled: true }, { expectedVersion: .5, enabled: true }, { expectedVersion: 0, enabled: "true" }, { expectedVersion: 0, enabled: true, storeId: OP }, { enabled: true }, { expectedVersion: 0, enabled: true, content: "x".repeat(9000) }]) assert.equal((await h.save(request("POST", body))).status, 400);
  assert.equal((await h.save(request("POST", { expectedVersion: 0, enabled: true }, { "idempotency-key": "" }))).status, 400);
  assert.equal((await h.save(new Request(`http://customer-panel:3400${PATH}`, { method: "POST", headers: { cookie: COOKIE, origin: ORIGIN, "content-type": "application/json", "idempotency-key": OP }, body: `{"expectedVersion":0,"enabled":true}${" ".repeat(3000)}` }))).status, 400);
  assert.equal((await h.save(request("POST", { expectedVersion: 0, enabled: true }, { "content-type": "text/plain" }))).status, 400); assert.equal(saves, 0);
});

test("malformed repository success and unknown failures become unavailable", async () => {
  for (const value of [{ enabled: true, version: -1 }, { enabled: true, version: 1, storeId: OP }, null]) {
    const h = handlers({ settings: async () => value, saveSettings: async () => value });
    for (const response of [await h.get(request()), await h.save(request("POST", { expectedVersion: 0, enabled: true }))]) { assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "unavailable" }); }
  }
  const response = await handlers({ settings: async () => { throw new Error("private database failure"); } }).get(request()); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "unavailable" });
  assert.equal((await handlers({ saveSettings: async () => ({ enabled: false, version: 1 }) }).save(request("POST", { expectedVersion: 0, enabled: true }))).status, 503);
});

test("finite native conflicts and denied memberships retain safe HTTP statuses", async () => {
  for (const [code, status] of [["version_conflict", 409], ["operation_mismatch", 409], ["membership_denied", 403], ["invalid_input", 400], ["unavailable", 503]] as const) {
    const response = await handlers({ saveSettings: async () => { throw new saasData.ProductPageReviewError(code); } }).save(request("POST", { expectedVersion: 0, enabled: true })); assert.equal(response.status, status); assert.deepEqual(await response.json(), { code });
  }
});
