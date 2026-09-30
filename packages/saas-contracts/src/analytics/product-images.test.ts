import assert from "node:assert/strict";
import test from "node:test";

import { parseAnalyticsDashboard, parseCommerceAnalyticsSnapshot } from "./index.ts";

const PRODUCT = "40000000-0000-4000-8000-000000000001";
const IMAGE = "https://media.example.test/stores/atlas/product.jpg";
const START = "2026-07-01T00:00:00.000Z";
const END = "2026-07-26T00:00:00.000Z";

function dashboard(product: Record<string, unknown>) {
  return {
    period: "month", rangeStart: START, rangeEnd: END, generatedAt: END,
    currency: "TRY", revenueCents: 1200,
    orders: { total: 1, paid: 1, cancelled: 0, refunded: 0 },
    customers: { total: 1, newInPeriod: 1 },
    catalog: { activeProducts: 1, lowStockVariants: 0 }, series: [],
    topProducts: [{ productId: PRODUCT, title: "Atlas Mug", quantity: 1, revenueCents: 1200, ...product }],
  };
}

function commerce(product: Record<string, unknown>) {
  return {
    schemaVersion: 1, rangeStart: START, rangeEnd: END,
    currencies: [], attribution: [],
    products: [{ productId: PRODUCT, title: "Atlas Mug", currency: "TRY", quantity: 1, revenueMinor: 1200, ...product }],
    productPage: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    cartPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    worker: { pending: 0, claimed: 0, retry: 0, deadLetter: 0, oldestPendingSeconds: 0, lastSuccessfulDelivery: null, deliveryLatencyMilliseconds: 0 },
  };
}

for (const [label, fixture, parse, field] of [
  ["dashboard", dashboard, parseAnalyticsDashboard, "topProducts"],
  ["commerce", commerce, parseCommerceAnalyticsSnapshot, "products"],
] as const) {
  test(`${label} product image accepts URLs and explicit missing images without changing old payloads`, () => {
    const old = parse(fixture({})) as unknown as Record<string, readonly Record<string, unknown>[]>;
    assert.equal(Object.hasOwn(old[field]![0]!, "imageUrl"), false);
    for (const imageUrl of [IMAGE, null]) {
      const parsed = parse(fixture({ imageUrl })) as unknown as Record<string, readonly Record<string, unknown>[]>;
      assert.equal(parsed[field]![0]!.imageUrl, imageUrl);
      assert.equal(Object.isFrozen(parsed[field]![0]), true);
      assert.equal(parsed[field]![0]!.quantity, 1);
    }
  });

  test(`${label} product image rejects malformed or unsafe media URLs`, () => {
    for (const imageUrl of [undefined, "", 1, "javascript:alert(1)", "//media.example.test/product.jpg", "http://media.example.test/product.jpg", "https://user:secret@media.example.test/product.jpg", `${IMAGE}#private`, ` ${IMAGE}`, `${IMAGE}\n`]) {
      assert.throws(() => parse(fixture({ imageUrl })), /analytics_contract_invalid/);
    }
  });
}
