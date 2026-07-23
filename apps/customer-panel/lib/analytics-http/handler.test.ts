import assert from "node:assert/strict";
import test from "node:test";

import type { AnalyticsRepository } from "@celebix/saas-data";
import type { TenantContext } from "@celebix/saas-contracts";
import type { ServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { createAnalyticsHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const REQUEST = "87000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const NOW = new Date("2026-07-22T15:00:00.000Z");
const PRODUCT = "77777777-7777-4777-8777-777777777777";
function tenant(): TenantContext { return { schemaVersion: 1, requestId: REQUEST, principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "private" }, store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001", planCode: "growth", version: 1, status: "active", features: ["analytics"], limits: { products: 100, staff: 1, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext; }
function dashboard(period = "month") { return { period, rangeStart: "2026-07-01T00:00:00.000Z", rangeEnd: NOW.toISOString(), generatedAt: NOW.toISOString(), currency: "TRY", revenueCents: 42000, orders: { total: 3, paid: 2, cancelled: 1, refunded: 0 }, customers: { total: 4, newInPeriod: 1 }, catalog: { activeProducts: 2, lowStockVariants: 1 }, series: [{ startsAt: "2026-07-01T00:00:00.000Z", orders: 2, revenueCents: 42000 }], topProducts: [{ productId: PRODUCT, title: "Atlas Mug", quantity: 2, revenueCents: 42000 }] }; }
function repository(calls: unknown[]): AnalyticsRepository { return { async dashboard(value) { calls.push(value); return dashboard(value.period) as never; } }; }
function runtime(calls: unknown[]): ServerAnalyticsRuntime { return { analytics: repository(calls), access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as ServerAnalyticsRuntime; }
function request(path: string, headers?: HeadersInit, method = "GET") { const values = new Headers(headers); values.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`); return new Request(`http://internal:3400${path}`, { method, headers: values }); }
function handlers(calls: unknown[]) { return createAnalyticsHttpHandlers({ async resolveRuntime() { return runtime(calls); }, now: () => new Date(NOW), requestId: () => REQUEST }); }

test("dashboard derives only durable TenantContext and accepts exact GET query without Origin authority", async () => {
  const calls: unknown[] = [], response = await handlers(calls).dashboard(request("/api/analytics/dashboard?period=month", { origin: "https://attacker.test" }));
  assert.equal(response.status, 200); assert.equal((await response.json()).period, "month"); assert.equal(calls.length, 1); assert.deepEqual((calls[0] as Record<string, unknown>).tenantContext, tenant()); assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("analytics GET fails closed on duplicate or unknown query, private headers, body, missing cookie and disabled runtime", async () => {
  const calls: unknown[] = [], h = handlers(calls);
  assert.equal((await h.dashboard(request("/api/analytics/dashboard?period=month&period=week"))).status, 400);
  assert.equal((await h.dashboard(request("/api/analytics/dashboard?period=month&store=x"))).status, 400);
  assert.equal((await h.dashboard(request("/api/analytics/dashboard?period=month", { "x-store-id": "x" }))).status, 400);
  assert.equal((await h.dashboard(request("/api/analytics/dashboard?period=month", { "content-length": "1" }))).status, 400);
  assert.equal((await h.dashboard(new Request("http://internal:3400/api/analytics/dashboard?period=month"))).status, 401);
  const disabled = createAnalyticsHttpHandlers({ async resolveRuntime() { return null; }, now: () => NOW, requestId: () => REQUEST });
  assert.equal((await disabled.dashboard(request("/api/analytics/dashboard?period=month"))).status, 503);
  assert.equal(calls.length, 0);
});

test("export uses safe fixed JSON and bounded CSV responses", async () => {
  const calls: unknown[] = [], h = handlers(calls);
  const csv = await h.export(request("/api/analytics/export?period=month&format=csv"));
  assert.equal(csv.status, 200); assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8"); assert.equal(csv.headers.get("content-disposition"), 'attachment; filename="merchant-analytics.csv"'); assert.equal(await csv.text(), "bucket_start,orders,revenue_cents\r\n2026-07-01T00:00:00.000Z,2,42000\r\n");
  const json = await h.export(request("/api/analytics/export?period=month&format=json")); assert.equal(json.status, 200); assert.equal((await json.json()).period, "month");
  assert.equal((await h.export(request("/api/analytics/export?format=csv&period=month&period=week"))).status, 400);
});
