import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { PostgresReviewCollectionRepository, ReviewCollectionError, type ReviewCollectionRepository, type CatalogAdminRepository } from "@celebix/saas-data";
import type { ServerReviewCollectionRuntime } from "../server-review-collection/runtime.ts";
import { createReviewCollectionHttpHandlers } from "./handler.ts";

const BASE = "/api/catalog/admin/review-collection";
const ORIGIN = "https://panel.saas-staging.celebix.site";
const STORE_ORIGIN = "https://store.admin.saas-staging.celebix.site";
const OP = "74000000-0000-4000-8000-000000000001";
const REQ = "78000000-0000-4000-8000-000000000001";
const ORDER = "71000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-03T07:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
function tenant(): TenantContext {
  return { schemaVersion: 1, requestId: REQ, principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "owner" }, store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext;
}
function repository(overrides: Partial<ReviewCollectionRepository> = {}): ReviewCollectionRepository {
  const unexpected = async () => { throw new Error("unexpected_repository_call"); };
  return { overview: unexpected, saveSettings: unexpected, requestOrder: unexpected, invitation: unexpected, submit: unexpected, unsubscribe: unexpected, claim: unexpected, seal: unexpected, finish: unexpected, ...overrides };
}
function runtime(reviewCollection: ReviewCollectionRepository, authenticated = true): ServerReviewCollectionRuntime {
  return { reviewCollection, catalogAdmin: {} as CatalogAdminRepository, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return authenticated ? { kind: "authenticated", session: {}, tenantContext: tenant() } as never : { kind: "unauthenticated" }; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as ServerReviewCollectionRuntime;
}
function handlers(reviewCollection: ReviewCollectionRepository, authenticated = true) {
  return createReviewCollectionHttpHandlers({ async resolveRuntime() { return runtime(reviewCollection, authenticated); }, now: () => new Date(NOW), requestId: () => REQ });
}
function request(path = BASE, method = "GET", value?: unknown, origin = ORIGIN, extra?: HeadersInit): Request {
  const headers = new Headers({ cookie: `__Host-celebix_panel=${CREDENTIAL}` });
  if (method === "POST") { headers.set("origin", origin); headers.set("content-type", "application/json"); headers.set("idempotency-key", OP); }
  for (const [name, entry] of new Headers(extra)) headers.set(name, entry);
  return new Request(`http://customer-panel:3400${path}`, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}

test("review collection authority rejects missing sessions, foreign origins, private claims and malformed routes before data access", async () => {
  let calls = 0;
  const repo = repository({ async overview() { calls += 1; return { settings: { enabled: false, delayDays: 7, version: 0 }, requests: [], eligibleOrders: [] }; }, async saveSettings() { calls += 1; return { enabled: true, delayDays: 7, version: 1 }; } });
  const h = handlers(repo), input = { enabled: true, delayDays: 7, expectedVersion: 0 };
  assert.equal((await h.overview(new Request(`http://internal${BASE}`))).status, 401);
  assert.equal((await handlers(repo, false).overview(request())).status, 401);
  assert.equal((await h.settings(request(`${BASE}/settings`, "POST", input, "https://attacker.test"))).status, 403);
  assert.equal((await h.settings(request(`${BASE}/settings`, "POST", input, "https://other.admin.saas-staging.celebix.site"))).status, 403);
  assert.equal((await h.overview(request(BASE, "GET", undefined, ORIGIN, { "x-store-id": ORDER }))).status, 400);
  assert.equal((await h.overview(request(`${BASE}?storeId=${ORDER}`))).status, 400);
  assert.equal((await h.overview(request(`${BASE}-other`))).status, 400);
  assert.equal(calls, 0);
});

test("default collection settings and manual requests carry only authenticated store authority", async () => {
  const calls: unknown[] = [];
  const overview = { settings: { enabled: false, delayDays: 7, version: 0 }, requests: [], eligibleOrders: [] } as const;
  const h = handlers(repository({ async overview(input) { calls.push(input); return overview; }, async requestOrder(input) { calls.push(input); return { queuedCount: 2 }; } }));
  const read = await h.overview(request());
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), overview);
  assert.equal(read.headers.get("cache-control"), "no-store");
  const result = await h.request(request(`${BASE}/request`, "POST", { orderId: ORDER, expectedVersion: 3 }, STORE_ORIGIN, { host: "customer-panel:3400", "x-forwarded-host": "attacker.test" }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { queuedCount: 2 });
  assert.deepEqual(calls, [{ tenantContext: tenant(), now: NOW }, { tenantContext: tenant(), now: NOW, operationId: OP, orderId: ORDER, expectedVersion: 3 }]);
  assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
});

test("version zero settings creation and identical retries preserve PostgreSQL operation and fingerprint", async () => {
  const calls: unknown[][] = [];
  const outcomes = ["saved", "operation_replayed", "version_conflict", "operation_mismatch"];
  const client = { async query(sql: string, values: unknown[] = []) {
    if (sql.includes("saas.review_collection_admin_mutate")) { calls.push(values); const outcome = outcomes.shift(); return { command: "SELECT", oid: 0, fields: [], rows: [{ outcome, result_payload: { enabled: true, delayDays: 7, version: 1 } }], rowCount: 1 }; }
    return { command: "", oid: 0, fields: [], rows: [], rowCount: 0 };
  }, release() {} };
  const postgres = new PostgresReviewCollectionRepository({ pool: { async connect() { return client; } }, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 } });
  const h = handlers(postgres), input = { enabled: true, delayDays: 7, expectedVersion: 0 };
  for (let index = 0; index < 2; index += 1) { const saved = await h.settings(request(`${BASE}/settings`, "POST", input)); assert.equal(saved.status, 200); assert.deepEqual(await saved.json(), { enabled: true, delayDays: 7, version: 1 }); }
  const conflict = await h.settings(request(`${BASE}/settings`, "POST", input, ORIGIN, { "idempotency-key": "74000000-0000-4000-8000-000000000002" }));
  assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { code: "version_conflict" });
  const mismatch = await h.settings(request(`${BASE}/settings`, "POST", { ...input, delayDays: 8 }));
  assert.equal(mismatch.status, 409); assert.deepEqual(await mismatch.json(), { code: "operation_mismatch" });
  assert.deepEqual(calls[0]?.slice(0, 8), [tenant().store.id, tenant().principal.id, tenant().membership.id, tenant().entitlements.planId, "growth", 2, NOW, OP]);
  assert.equal(calls[0]?.[8], calls[1]?.[8]);
  assert.notEqual(calls[0]?.[8], calls[3]?.[8]);
  assert.equal(calls[0]?.[9], "settings");
  assert.deepEqual(JSON.parse(String(calls[0]?.[10])), input);
});

test("collection writes reject forged authority, invalid limits and missing operation keys", async () => {
  let calls = 0;
  const h = handlers(repository({ async saveSettings() { calls += 1; return { enabled: false, delayDays: 7, version: 1 }; }, async requestOrder() { calls += 1; return { queuedCount: 1 }; } }));
  for (const input of [{ enabled: true, delayDays: 0, expectedVersion: 0 }, { enabled: true, delayDays: 61, expectedVersion: 0 }, { enabled: true, delayDays: 7, expectedVersion: -1 }, { enabled: true, delayDays: 7, expectedVersion: 0, storeId: ORDER }, { enabled: "true", delayDays: 7, expectedVersion: 0 }]) assert.equal((await h.settings(request(`${BASE}/settings`, "POST", input))).status, 400);
  for (const input of [{ orderId: ORDER, expectedVersion: 0 }, { orderId: "not-an-order", expectedVersion: 1 }, { orderId: ORDER, expectedVersion: 1, customerId: ORDER }]) assert.equal((await h.request(request(`${BASE}/request`, "POST", input))).status, 400);
  assert.equal((await h.settings(request(`${BASE}/settings`, "POST", { enabled: true, delayDays: 7, expectedVersion: 0 }, ORIGIN, { "idempotency-key": "" }))).status, 400);
  assert.equal(calls, 0);
});

test("manual review requests expose stale and ineligible order conflicts without leaking repository details", async () => {
  for (const [code, status] of [["version_conflict", 409], ["ineligible_order", 409], ["membership_denied", 403], ["unavailable", 503]] as const) {
    const h = handlers(repository({ async requestOrder() { throw new ReviewCollectionError(code); } }));
    const response = await h.request(request(`${BASE}/request`, "POST", { orderId: ORDER, expectedVersion: 2 }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { code });
  }
});
