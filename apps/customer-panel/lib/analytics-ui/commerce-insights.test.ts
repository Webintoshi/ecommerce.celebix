import assert from "node:assert/strict";
import test from "node:test";

import { dailySalesPointsForCurrency, largestFunnelDrop, salesPointsForCurrency } from "./commerce-insights.ts";

test("largestFunnelDrop uses measured adjacent steps rather than inventing a trend", () => {
  assert.deepEqual(
    largestFunnelDrop({
      product_view: 100,
      add_to_cart: 80,
      view_cart: 60,
      begin_checkout: 50,
      payment_method_selected: 30,
      purchase: 12,
    }),
    { from: "Ürün görüntüleme", to: "Sepete ekleme", lost: 20, rate: 0.2 },
  );
  assert.equal(largestFunnelDrop({}), null);
  assert.equal(largestFunnelDrop({ product_view: 0, add_to_cart: 0 }), null);
  assert.equal(largestFunnelDrop({ product_view: 4, add_to_cart: 8 }), null);
});

test("largestFunnelDrop ranks lost sessions rather than a small high-percentage step", () => {
  assert.deepEqual(
    largestFunnelDrop({
      product_view: 1000,
      add_to_cart: 700,
      view_cart: 500,
      begin_checkout: 300,
      payment_method_selected: 100,
      purchase: 10,
    }),
    { from: "Ürün görüntüleme", to: "Sepete ekleme", lost: 300, rate: 0.3 },
  );
});

test("salesPointsForCurrency keeps monetary series separate by currency", () => {
  const series = [
    { startsAt: "2026-09-01T00:00:00.000Z", currency: "TRY", grossRevenueMinor: 12000 },
    { startsAt: "2026-09-01T00:00:00.000Z", currency: "USD", grossRevenueMinor: 3300 },
    { startsAt: "2026-09-02T00:00:00.000Z", currency: "TRY", grossRevenueMinor: 8000, paidOrders: 2 },
  ];
  assert.deepEqual(salesPointsForCurrency(series, "TRY"), [
    { startsAt: "2026-09-01T00:00:00.000Z", value: 12000 },
    { startsAt: "2026-09-02T00:00:00.000Z", value: 8000, paidOrders: 2 },
  ]);
});

test("dailySalesPointsForCurrency fills measured zero-sale days in the store timezone", () => {
  const points = dailySalesPointsForCurrency([
    { startsAt: "2026-09-01T21:00:00.000Z", currency: "TRY", grossRevenueMinor: 14000, paidOrders: 2 },
    { startsAt: "2026-09-03T21:00:00.000Z", currency: "TRY", grossRevenueMinor: 9000, paidOrders: 1 },
    { startsAt: "2026-09-02T21:00:00.000Z", currency: "USD", grossRevenueMinor: 9900, paidOrders: 2 },
  ], "TRY", { start: "2026-09-01T21:00:00.000Z", end: "2026-09-05T12:00:00.000Z", timezone: "Europe/Istanbul" });
  assert.deepEqual(points, [
    { day: "2026-09-02", value: 14000, paidOrders: 2 },
    { day: "2026-09-03", value: 0, paidOrders: 0 },
    { day: "2026-09-04", value: 9000, paidOrders: 1 },
    { day: "2026-09-05", value: 0, paidOrders: 0 },
  ]);
});
