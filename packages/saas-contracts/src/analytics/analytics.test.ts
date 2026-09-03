import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBrowserCommerceEvent,
  parseAnalyticsSafeDimension,
  parseServerCommerceEvent,
  sanitizeAnalyticsSearchTerm,
  parseAnalyticsConnectionMutationResult,
  parseAnalyticsConnectionView,
  parseAnalyticsMetricResult,
  parseAnalyticsSummary,
  parseCommerceAnalyticsSnapshot,
} from "./index.ts";

const NOW = "2026-07-26T12:00:00.000Z";
const LATER = "2026-07-26T13:00:00.000Z";

function connectionFixture() {
  return {
    schemaVersion: 1,
    provider: "umami",
    status: "active",
    configured: true,
    hostname: "pilot.saas-staging.celebix.site",
    version: 2,
    lastVerifiedAt: NOW,
  };
}

function summaryFixture() {
  return {
    schemaVersion: 1,
    range: "30d",
    asOf: LATER,
    pageviews: 20,
    visitors: 8,
    visits: 12,
    bounces: 3,
    totalTimeSeconds: 360,
    activeVisitors: 2,
    bounceRateBasisPoints: 2_500,
    averageVisitSeconds: 30,
    comparison: { pageviews: 15, visitors: 7, visits: 10, bounces: 2 },
    pageviewsSeries: [{ at: NOW, value: 20 }],
    visitsSeries: [{ at: NOW, value: 12 }],
  };
}

test("parses the exact analytics connection projection", () => {
  const parsed = parseAnalyticsConnectionView(connectionFixture());
  assert.deepEqual(parsed, connectionFixture());
  assert.equal(Object.isFrozen(parsed), true);

  const disabled = parseAnalyticsConnectionView({
    ...connectionFixture(),
    status: "disabled",
    configured: false,
    hostname: null,
    version: null,
    lastVerifiedAt: null,
  });
  assert.equal(disabled.configured, false);
  assert.equal(disabled.hostname, null);
});

test("parses and deeply freezes one internally consistent analytics summary", () => {
  const parsed = parseAnalyticsSummary(summaryFixture());
  assert.equal(parsed.bounceRateBasisPoints, 2_500);
  assert.equal(parsed.averageVisitSeconds, 30);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.comparison), true);
  assert.equal(Object.isFrozen(parsed.pageviewsSeries), true);
  assert.equal(parsed.pageviewsSeries.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(parsed.visitsSeries), true);
});

test("parses exact metric and replay-aware mutation projections", () => {
  const metric = parseAnalyticsMetricResult({
    schemaVersion: 1,
    range: "7d",
    type: "country",
    asOf: NOW,
    items: [
      { label: "TR", value: 9 },
      { label: "DE", value: 2 },
    ],
  });
  const mutation = parseAnalyticsConnectionMutationResult({
    status: "active",
    version: 3,
    updatedAt: LATER,
    replayed: true,
  });
  assert.deepEqual(
    metric.items.map((item) => item.label),
    ["TR", "DE"],
  );
  assert.equal(Object.isFrozen(metric.items), true);
  assert.equal(metric.items.every(Object.isFrozen), true);
  assert.equal(mutation.replayed, true);
  assert.equal(Object.isFrozen(mutation), true);
});

test("rejects unknown keys and private analytics authority material", () => {
  for (const key of [
    "websiteId",
    "storeId",
    "sessionId",
    "token",
    "providerBody",
  ]) {
    assert.throws(
      () => parseAnalyticsSummary({ ...summaryFixture(), [key]: "private" }),
      /analytics_contract_invalid/,
    );
  }
  assert.throws(
    () =>
      parseAnalyticsConnectionView({
        ...connectionFixture(),
        websiteId: "10000000-0000-4000-8000-000000000001",
      }),
    /analytics_contract_invalid/,
  );
  assert.throws(
    () =>
      parseAnalyticsMetricResult({
        schemaVersion: 1,
        range: "7d",
        type: "country",
        asOf: NOW,
        items: [],
        tenantContext: {},
      }),
    /analytics_contract_invalid/,
  );
});

test("rejects invalid counters arithmetic ranges and timestamps", () => {
  for (const invalid of [
    { ...summaryFixture(), range: "365d" },
    { ...summaryFixture(), visits: 2, bounces: 3 },
    { ...summaryFixture(), bounceRateBasisPoints: 2_499 },
    { ...summaryFixture(), averageVisitSeconds: 31 },
    { ...summaryFixture(), pageviews: -1 },
    { ...summaryFixture(), visitors: Number.MAX_SAFE_INTEGER + 1 },
    { ...summaryFixture(), asOf: "2026-07-26T13:00:00Z" },
    { ...summaryFixture(), asOf: "not-a-time" },
  ])
    assert.throws(
      () => parseAnalyticsSummary(invalid),
      /analytics_contract_invalid/,
    );
});

test("accepts only safe path and referrer metric labels", () => {
  const base = { schemaVersion: 1, range: "30d", asOf: NOW };
  assert.deepEqual(
    parseAnalyticsMetricResult({
      ...base,
      type: "path",
      items: [{ label: "/products/sku", value: 1 }],
    }).items[0],
    { label: "/products/sku", value: 1 },
  );
  for (const label of [
    "products/sku",
    "/products/sku?coupon=secret",
    "/products/sku#reviews",
    "//evil.example/path",
    "/bad\u0000path",
  ]) {
    assert.throws(
      () =>
        parseAnalyticsMetricResult({
          ...base,
          type: "path",
          items: [{ label, value: 1 }],
        }),
      /analytics_contract_invalid/,
    );
  }
  for (const label of ["direct", "unknown", "https://search.example"]) {
    assert.equal(
      parseAnalyticsMetricResult({
        ...base,
        type: "referrer",
        items: [{ label, value: 1 }],
      }).items[0]?.label,
      label,
    );
  }
  for (const label of [
    "http://search.example",
    "https://search.example/path",
    "https://search.example/?q=private",
    "https://user@search.example",
  ]) {
    assert.throws(
      () =>
        parseAnalyticsMetricResult({
          ...base,
          type: "referrer",
          items: [{ label, value: 1 }],
        }),
      /analytics_contract_invalid/,
    );
  }
});

test("enforces dense series and metric cardinality bounds", () => {
  const tooManyPoints = Array.from({ length: 367 }, (_, index) => ({
    at: NOW,
    value: index,
  }));
  assert.throws(
    () =>
      parseAnalyticsSummary({
        ...summaryFixture(),
        pageviewsSeries: tooManyPoints,
      }),
    /analytics_contract_invalid/,
  );
  const sparse = new Array(2);
  sparse[0] = { at: NOW, value: 1 };
  assert.throws(
    () =>
      parseAnalyticsSummary({ ...summaryFixture(), pageviewsSeries: sparse }),
    /analytics_contract_invalid/,
  );
  const items = Array.from({ length: 101 }, (_, index) => ({
    label: `country-${index}`,
    value: index,
  }));
  assert.throws(
    () =>
      parseAnalyticsMetricResult({
        schemaVersion: 1,
        range: "90d",
        type: "country",
        asOf: NOW,
        items,
      }),
    /analytics_contract_invalid/,
  );
});

test("copies recursive values without mutating caller-owned inputs", () => {
  const source = summaryFixture();
  const parsed = parseAnalyticsSummary(source);
  source.comparison.pageviews = 999;
  source.pageviewsSeries[0]!.value = 999;
  assert.equal(parsed.comparison?.pageviews, 15);
  assert.equal(parsed.pageviewsSeries[0]?.value, 20);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.pageviewsSeries), false);
});

test("accepts every versioned browser commerce event with exact safe fields", () => {
  const names = [
    "storefront_view",
    "product_view",
    "category_view",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "begin_checkout",
    "checkout_address_completed",
    "shipping_method_selected",
    "payment_method_selected",
    "checkout_validation_error",
    "coupon_applied",
    "whatsapp_click",
    "phone_click",
  ] as const;
  for (const eventName of names) {
    const parsed = parseBrowserCommerceEvent({
      schemaVersion: 1,
      eventName,
      occurredAt: NOW,
      anonymousSessionRef: `h1_${"a".repeat(64)}`,
      currency: "TRY",
      valueMinor: 1250,
    });
    assert.equal(parsed.eventName, eventName);
    assert.equal(Object.isFrozen(parsed), true);
  }
});

test("accepts server commerce events but rejects them at the browser boundary", () => {
  const names = [
    "purchase",
    "payment_failed",
    "refund",
    "order_cancelled",
    "cart_abandoned",
    "cart_resumed",
    "cart_recovered",
    "recovery_message_queued",
    "recovery_message_sent",
    "recovery_message_failed",
  ] as const;
  for (const eventName of names) {
    const event = {
      schemaVersion: 1,
      eventName,
      occurredAt: NOW,
      orderRef: `h1_${"b".repeat(64)}`,
      currency: "TRY",
      valueMinor: 1250,
    };
    assert.equal(parseServerCommerceEvent(event).eventName, eventName);
    assert.throws(
      () => parseBrowserCommerceEvent(event),
      /analytics_contract_invalid/,
    );
  }
});

test("rejects unknown keys PII-like keys raw entity ids and oversized commerce payloads", () => {
  const valid = { schemaVersion: 1, eventName: "add_to_cart", occurredAt: NOW };
  for (const extra of [
    { email: "merchant@example.test" },
    { phone: "+905551112233" },
    { customerId: "10000000-0000-4000-8000-000000000001" },
    { cartRef: "10000000-0000-4000-8000-000000000001" },
    { recoveryToken: "secret" },
    { unexpected: "value" },
  ])
    assert.throws(
      () => parseBrowserCommerceEvent({ ...valid, ...extra }),
      /analytics_contract_invalid/,
    );
  assert.throws(
    () => parseBrowserCommerceEvent({ ...valid, campaign: "x".repeat(129) }),
    /analytics_contract_invalid/,
  );
  for (const dimension of [
    { source: "905551112233" },
    { medium: "+90 555 111 22 33" },
    { campaign: "4111111111111111" },
    { paymentMethod: "merchant@example.test" },
  ])
    assert.throws(
      () => parseBrowserCommerceEvent({ ...valid, ...dimension }),
      /analytics_contract_invalid/,
    );
});

test("preserves integer minor units and exact currency formatting", () => {
  const parsed = parseServerCommerceEvent({
    schemaVersion: 1,
    eventName: "purchase",
    occurredAt: NOW,
    orderRef: `h1_${"c".repeat(64)}`,
    currency: "TRY",
    valueMinor: 5,
  });
  assert.equal(parsed.valueMinor, 5);
  assert.equal(parsed.currency, "TRY");
  for (const valueMinor of [1.5, -1, Number.MAX_SAFE_INTEGER + 1, "005"]) {
    assert.throws(
      () => parseServerCommerceEvent({ ...parsed, valueMinor }),
      /analytics_contract_invalid/,
    );
  }
});

test("normalizes safe search terms and redacts high-risk patterns", () => {
  assert.equal(sanitizeAnalyticsSearchTerm("  altın   yüzük  "), "altın yüzük");
  assert.equal(sanitizeAnalyticsSearchTerm("user@example.test"), "redacted");
  assert.equal(sanitizeAnalyticsSearchTerm("+90 555 111 22 33"), "redacted");
  assert.equal(
    sanitizeAnalyticsSearchTerm("https://example.test/private"),
    "redacted",
  );
  assert.equal(sanitizeAnalyticsSearchTerm("4111 1111 1111 1111"), "redacted");
  assert.equal(sanitizeAnalyticsSearchTerm("a".repeat(65)), "redacted");
  assert.equal(sanitizeAnalyticsSearchTerm("token=abc.def.ghi"), "redacted");
});

test("traffic dimensions reject PII and credential-like filter values", () => {
  assert.equal(parseAnalyticsSafeDimension("atlas-qa"), "atlas-qa");
  for (const value of [
    "user@example.test",
    "+90 555 111 22 33",
    "https://example.test/private",
    "4111 1111 1111 1111",
    "token=abc.def.ghi",
  ])
    assert.throws(
      () => parseAnalyticsSafeDimension(value),
      /analytics_contract_invalid/,
    );
});

test("parses currency-separated PostgreSQL commerce truth and worker status", () => {
  const parsed = parseCommerceAnalyticsSnapshot({
    schemaVersion: 1,
    rangeStart: NOW,
    rangeEnd: LATER,
    currencies: [
      {
        currency: "TRY",
        activeCarts: 3,
        candidateCarts: 2,
        eligibleCarts: 6,
        checkoutStarts: 5,
        eligibleCheckoutStarts: 4,
        checkoutAbandoned: 2,
        paymentFailures: 1,
        paidOrders: 2,
        grossRevenueMinor: 15000,
        refundedMinor: 2000,
        abandonedCarts: 4,
        abandonedValueMinor: 19000,
        recoveredCarts: 1,
        recoveredGrossMinor: 5000,
        recoveredRefundedMinor: 1000,
        recoveredNetMinor: 4000,
      },
    ],
    attribution: [
      {
        source: "atlas-qa",
        medium: "test",
        campaign: "cart-recovery",
        currency: "TRY",
        paidOrders: 2,
        grossRevenueMinor: 15000,
        abandonedCarts: 4,
        recoveredRevenueMinor: 5000,
      },
    ],
    products: [
      {
        productId: "40000000-0000-4000-8000-000000000001",
        title: "Ürün",
        currency: "TRY",
        quantity: 2,
        revenueMinor: 15000,
      },
    ],
    productPage: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    cartPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    worker: {
      pending: 2,
      claimed: 1,
      retry: 1,
      deadLetter: 0,
      oldestPendingSeconds: 30,
      lastSuccessfulDelivery: NOW,
      deliveryLatencyMilliseconds: 250,
    },
  });
  assert.equal(parsed.currencies[0]?.recoveredNetMinor, 4000);
  assert.equal(Object.isFrozen(parsed.currencies), true);
  assert.equal(Object.isFrozen(parsed.attribution), true);
  assert.equal(Object.isFrozen(parsed.products), true);
  assert.equal(Object.isFrozen(parsed.worker), true);
  assert.throws(
    () =>
      parseCommerceAnalyticsSnapshot({
        ...parsed,
        currencies: [...parsed.currencies, { ...parsed.currencies[0]! }],
      }),
    /analytics_contract_invalid/,
  );
  assert.throws(
    () =>
      parseCommerceAnalyticsSnapshot({
        ...parsed,
        currencies: [{ ...parsed.currencies[0]!, recoveredNetMinor: 3999 }],
      }),
    /analytics_contract_invalid/,
  );
});
