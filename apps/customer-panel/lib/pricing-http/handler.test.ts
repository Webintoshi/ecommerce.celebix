import assert from "node:assert/strict";
import test from "node:test";
import type { PriceList, TenantContext } from "@celebix/saas-contracts";
import type { PricingRepository } from "@celebix/saas-data";
import { pricingFailure } from "../../../../packages/saas-data/src/pricing/errors.ts";
import { createPricingHttpHandler } from "./handler.ts";
import type { ServerPricingRuntime } from "../server-pricing/runtime.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const ID = "20000000-0000-4000-8000-000000000001";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const TAG = "40000000-0000-4000-8000-000000000001";
const OP = "50000000-0000-4000-8000-000000000001";
const REQUEST = "60000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const COOKIE = `__Host-celebix_panel=${CREDENTIAL}`;
const NOW = new Date("2026-07-23T12:00:00.000Z");
const list = (status: "draft" | "active" | "archived" = "draft", version = 1): PriceList => ({ id: ID, name: "VIP fiyatı", status, items: [{ variantId: VARIANT, priceCents: 1200 }], rules: [{ channel: "quick_order", customerTagId: TAG, priority: 10 }], version, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...(status === "active" ? { activatedAt: NOW.toISOString() } : {}), ...(status === "archived" ? { archivedAt: NOW.toISOString() } : {}) });
function tenant(): TenantContext { return { schemaVersion: 1, requestId: REQUEST, principal: { id: REQUEST, issuer: "https://id.test", subject: "private" }, store: { id: REQUEST, slug: "store", status: "active" }, membership: { id: REQUEST, role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: REQUEST, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_000_000 }, validFrom: NOW.toISOString() }, locale: "tr-TR" }; }
function repo(overrides: Partial<PricingRepository> = {}): PricingRepository { const reject = async () => { throw new Error("unexpected"); }; return { list: reject, get: reject, save: reject, activate: reject, archive: reject, ...overrides } as PricingRepository; }
function handler(pricing: PricingRepository) { const runtime = { pricing, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", tenantContext: tenant(), session: {} } as never; }, async rotateCredential() { return { kind: "unavailable" } as const; }, async revokeCredential() { return { kind: "unavailable" } as const; } } } satisfies ServerPricingRuntime; return createPricingHttpHandler({ async resolveRuntime() { return runtime; }, now: () => new Date(NOW), requestId: () => REQUEST }); }
function request(path: string, options: { method?: string; body?: unknown; origin?: string | null; cookie?: string | null; headers?: HeadersInit } = {}) { const method = options.method ?? "GET"; const headers = new Headers(options.headers); if (options.cookie !== null) headers.set("cookie", options.cookie ?? COOKIE); if (method === "POST") { headers.set("content-type", "application/json"); if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN); } return new Request(`http://internal:3400${path}`, { method, headers, body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined }); }

test("finite pricing routes call one repository method with server-only authority", async () => {
  const calls: Array<[string, object]> = [];
  const pricing = repo({
    async list(input) { calls.push(["list", input]); return [list()]; }, async get(input) { calls.push(["get", input]); return list(); },
    async save(input) { calls.push(["save", input]); return list(); }, async activate(input) { calls.push(["activate", input]); return list("active", 2); }, async archive(input) { calls.push(["archive", input]); return list("archived", 2); },
  });
  const handle = handler(pricing);
  const cases = [
    ["GET", "/api/pricing/price-lists", undefined], ["GET", `/api/pricing/price-lists/${ID}`, undefined],
    ["POST", "/api/pricing/price-lists", { operationId: OP, name: "VIP fiyatı", items: list().items, rules: list().rules }],
    ["POST", `/api/pricing/price-lists/${ID}/activate`, { operationId: OP, expectedVersion: 1 }],
    ["POST", `/api/pricing/price-lists/${ID}/archive`, { operationId: OP, expectedVersion: 1 }],
  ] as const;
  for (const [method, path, body] of cases) { const response = await handle(request(path, { method, body })); assert.equal(response.status, 200, path); }
  assert.deepEqual(calls.map(([name]) => name), ["list", "get", "save", "activate", "archive"]);
  for (const [, input] of calls) { assert.deepEqual((input as { tenantContext: TenantContext }).tenantContext, tenant()); for (const key of ["storeId", "currency", "customerId", "customerTagId"]) assert.equal(key in input, false); }
});

test("pricing HTTP rejects unknown duplicate query, private headers and wrong mutation origin before repository", async () => {
  let calls = 0; const handle = handler(repo({ async list() { calls += 1; return []; } }));
  for (const [method, path, options, status] of [
    ["GET", "/api/pricing/price-lists?x=1", {}, 400], ["GET", "/api/pricing/price-lists?a=1&a=2", {}, 400],
    ["GET", "/api/pricing/price-lists", { headers: { authorization: "private" } }, 400],
    ["POST", "/api/pricing/price-lists", { origin: "https://evil.test", body: { operationId: OP, name: "VIP", items: list().items, rules: list().rules } }, 403],
    ["GET", "/api/pricing/price-lists/", {}, 404], ["DELETE", `/api/pricing/price-lists/${ID}`, {}, 405],
  ] as const) { const response = await handle(request(path, { method, ...(options as object) })); assert.equal(response.status, status); if (status === 405) assert.equal(response.headers.get("allow"), "GET"); }
  assert.equal(calls, 0);
});

test("pricing HTTP enforces exact mutation bodies and stable repository error mapping", async () => {
  let calls = 0; const handle = handler(repo({ async save() { calls += 1; throw pricingFailure("pricing_conflict"); } }));
  for (const body of [
    { operationId: OP, name: "VIP", items: list().items, rules: list().rules, storeId: REQUEST },
    { operationId: OP, name: "VIP", items: [{ variantId: VARIANT, percentage: 10 }], rules: list().rules },
    { operationId: OP, name: "VIP", items: list().items, rules: [{ channel: "browser", priority: 1 }] },
  ]) assert.equal((await handle(request("/api/pricing/price-lists", { method: "POST", body }))).status, 400);
  const conflict = await handle(request("/api/pricing/price-lists", { method: "POST", body: { operationId: OP, name: "VIP", items: list().items, rules: list().rules } }));
  assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { code: "conflict" }); assert.equal(calls, 1);
  assert.equal((await handler(repo())(request("/api/pricing/price-lists", { cookie: null }))).status, 401);
});
