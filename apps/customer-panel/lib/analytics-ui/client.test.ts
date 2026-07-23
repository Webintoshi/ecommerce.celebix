import assert from "node:assert/strict";
import test from "node:test";

import { AnalyticsApiError, createAnalyticsApi } from "./client.ts";

const dashboard = { period: "month", rangeStart: "2026-07-01T00:00:00.000Z", rangeEnd: "2026-07-22T15:00:00.000Z", generatedAt: "2026-07-22T15:00:00.000Z", currency: "TRY", revenueCents: 0, orders: { total: 0, paid: 0, cancelled: 0, refunded: 0 }, customers: { total: 0, newInPeriod: 0 }, catalog: { activeProducts: 0, lowStockVariants: 0 }, series: [], topProducts: [] };
test("browser analytics client sends safe same-origin GET requests and parses only exact dashboards", async () => {
  const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
  const api = createAnalyticsApi(async (input, init) => { calls.push([input, init]); return Response.json(dashboard, { headers: { "content-type": "application/json" } }); });
  assert.equal((await api.dashboard("month")).period, "month"); assert.equal(String(calls[0]?.[0]), "/api/analytics/dashboard?period=month"); assert.equal(calls[0]?.[1]?.credentials, "same-origin");
});
test("browser analytics client rejects invalid period and unsafe error payload", async () => {
  const api = createAnalyticsApi(async () => Response.json({ detail: "private" }, { status: 500 }));
  assert.throws(() => api.dashboard("quarter" as never), TypeError);
  await assert.rejects(() => api.dashboard("month"), (error: unknown) => error instanceof AnalyticsApiError && error.code === "unavailable");
});
