import assert from "node:assert/strict";
import test from "node:test";

import { ANALYTICS_PERIODS, parseAnalyticsDashboard } from "./index.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const RANGE_START = "2026-07-01T00:00:00.000Z";
const RANGE_END = "2026-07-21T12:00:00.000Z";

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    period: "month",
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    generatedAt: RANGE_END,
    currency: "TRY",
    revenueCents: 125_000,
    orders: { total: 12, paid: 10, cancelled: 1, refunded: 1 },
    customers: { total: 30, newInPeriod: 4 },
    catalog: { activeProducts: 8, lowStockVariants: 2 },
    series: [{ startsAt: RANGE_START, orders: 2, revenueCents: 20_000 }],
    topProducts: [{ productId: PRODUCT_ID, title: "Atlas Mug", quantity: 5, revenueCents: 50_000 }],
    ...overrides,
  };
}

test("parses and freezes an exact analytics dashboard", () => {
  const value = parseAnalyticsDashboard(fixture());
  assert.equal(value.period, "month");
  assert.equal(value.orders.total, 12);
  assert.equal(value.revenueCents, 125_000);
  for (const nested of [value, value.orders, value.customers, value.catalog, value.series, value.series[0], value.topProducts, value.topProducts[0]]) {
    assert.equal(Object.isFrozen(nested), true);
  }
  assert.throws(() => parseAnalyticsDashboard(fixture({ liveVisitors: 4 })), /analytics_contract_invalid/);
});

test("exports exact immutable analytics periods", () => {
  assert.deepEqual(ANALYTICS_PERIODS, ["today", "week", "month", "year"]);
  assert.equal(Object.isFrozen(ANALYTICS_PERIODS), true);
  assert.throws(() => (ANALYTICS_PERIODS as unknown as string[]).push("quarter"), TypeError);
});

test("rejects non-exact dashboards and invalid scalar values", () => {
  assert.throws(() => parseAnalyticsDashboard({ ...fixture(), topProducts: undefined }), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ period: "quarter" })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ currency: "try" })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ revenueCents: -1 })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ revenueCents: Number.MAX_SAFE_INTEGER + 1 })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ rangeStart: "2026-07-01T00:00:00Z" })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ rangeStart: "2026-07-01T00:00:00.000+00:00" })), /analytics_contract_invalid/);
});

test("rejects invalid nested analytics values and bounded arrays", () => {
  assert.throws(() => parseAnalyticsDashboard(fixture({ orders: { total: 1, paid: 2, cancelled: 0, refunded: 0 } })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ customers: { total: 3, newInPeriod: 4 } })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ series: [{ startsAt: RANGE_START, orders: -1, revenueCents: 0 }] })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ topProducts: [{ productId: "not-a-uuid", title: "Atlas Mug", quantity: 1, revenueCents: 1 }] })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ series: Array.from({ length: 367 }, () => ({ startsAt: RANGE_START, orders: 0, revenueCents: 0 })) })), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsDashboard(fixture({ topProducts: Array.from({ length: 21 }, () => ({ productId: PRODUCT_ID, title: "Atlas Mug", quantity: 0, revenueCents: 0 })) })), /analytics_contract_invalid/);
});
