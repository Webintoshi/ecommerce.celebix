import assert from "node:assert/strict";
import test from "node:test";

import { createCommerceAnalyticsHttpHandlers } from "./commerce-handler.ts";

const PANEL = "https://panel.saas-staging.celebix.site";
const COOKIE = "v1.key.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const STORE = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-26T12:00:00.000Z");

function tenant() {
  return {
    schemaVersion: 1,
    requestId: STORE,
    principal: {
      id: "20000000-0000-4000-8000-000000000001",
      issuer: "https://id.test",
      subject: "safe",
    },
    store: { id: STORE, slug: "store", status: "active" },
    membership: {
      id: "30000000-0000-4000-8000-000000000001",
      role: "store_owner",
      status: "active",
    },
    entitlements: {
      schemaVersion: 1,
      planId: "00000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 1,
      status: "active",
      features: ["analytics"],
      limits: { products: 100, staff: 5, storageBytes: 1000 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}
function snapshot(start: Date, end: Date) {
  return {
    schemaVersion: 1,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    currencies: [
      {
        currency: "TRY",
        activeCarts: 4,
        candidateCarts: 1,
        eligibleCarts: 5,
        checkoutStarts: 3,
        eligibleCheckoutStarts: 2,
        checkoutAbandoned: 1,
        paymentFailures: 1,
        paidOrders: 2,
        grossRevenueMinor: 20000,
        refundedMinor: 1000,
        abandonedCarts: 3,
        abandonedValueMinor: 30000,
        recoveredCarts: 1,
        recoveredGrossMinor: 10000,
        recoveredRefundedMinor: 1000,
        recoveredNetMinor: 9000,
      },
      {
        currency: "EUR",
        activeCarts: 1,
        candidateCarts: 0,
        eligibleCarts: 1,
        checkoutStarts: 1,
        eligibleCheckoutStarts: 1,
        checkoutAbandoned: 0,
        paymentFailures: 0,
        paidOrders: 1,
        grossRevenueMinor: 5000,
        refundedMinor: 0,
        abandonedCarts: 0,
        abandonedValueMinor: 0,
        recoveredCarts: 0,
        recoveredGrossMinor: 0,
        recoveredRefundedMinor: 0,
        recoveredNetMinor: 0,
      },
    ],
    attribution: [
      {
        touch: "last",
        source: "atlas-qa",
        medium: "test",
        campaign: "cart-recovery",
        currency: "TRY",
        paidOrders: 2,
        grossRevenueMinor: 20000,
        abandonedCarts: 3,
        recoveredRevenueMinor: 10000,
      },
    ],
    products: [
      {
        productId: "40000000-0000-4000-8000-000000000001",
        title: "Ürün",
        currency: "TRY",
        categoryId: null,
        categoryName: null,
        brandId: null,
        brandName: null,
        checkoutStarts: 1,
        paidOrders: 1,
        quantity: 2,
        revenueMinor: 20000,
        abandonedAppearances: 1,
        recoveredRevenueMinor: 10000,
      },
    ],
    productPage: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
    cartPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    series: [],
    carts: [],
    worker: {
      pending: 1,
      claimed: 0,
      retry: 0,
      deadLetter: 0,
      oldestPendingSeconds: 2,
      lastSuccessfulDelivery: NOW.toISOString(),
      deliveryLatencyMilliseconds: 25,
    },
  };
}
function request(path: string, cookie = true) {
  const headers = new Headers({
    host: "store.admin.saas-staging.celebix.site",
  });
  if (cookie) headers.set("cookie", `__Host-celebix_panel=${COOKIE}`);
  return new Request(`http://internal:3400${path}`, { headers });
}
function fixture(
  providerFails = false,
  worker = {
    pending: 1,
    claimed: 0,
    retry: 0,
    deadLetter: 0,
    oldestPendingSeconds: 10,
  },
) {
  const calls: string[] = [];
  const runtime = {
    mode: "approved_staging",
    providerConfigured: true,
    access: {
      readiness: { mode: "approved_staging" },
      panelOrigin: PANEL,
      async resolveCredential() {
        return { kind: "authenticated", tenantContext: tenant() };
      },
    },
    analytics: {
      async commerceTimezone() {
        calls.push("timezone");
        return "Europe/Istanbul";
      },
      async commerceSnapshot(input: { rangeStart: Date; rangeEnd: Date }) {
        calls.push("commerce");
        return snapshot(input.rangeStart, input.rangeEnd);
      },
      async paidFunnelSessions() {
        calls.push("paidFunnelSessions");
        return [];
      },
      async getConnectionAuthority() {
        calls.push("authority");
        return {
          connectionId: "40000000-0000-4000-8000-000000000001",
          websiteId: "50000000-0000-4000-8000-000000000001",
          hostname: "store.example.test",
          status: "active",
          version: 1,
          lastVerifiedAt: NOW.toISOString(),
        };
      },
      async dashboard() {
        calls.push("dashboard");
        return {
          period: "month",
          rangeStart: "2026-07-01T00:00:00.000Z",
          rangeEnd: NOW.toISOString(),
          generatedAt: NOW.toISOString(),
          currency: "TRY",
          revenueCents: 20000,
          orders: { total: 2, paid: 2, cancelled: 0, refunded: 0 },
          customers: { total: 2, newInPeriod: 2 },
          catalog: { activeProducts: 1, lowStockVariants: 0 },
          series: [],
          topProducts: [],
        };
      },
    },
    umami: {
      async summary(input: { start?: Date; end?: Date }) {
        calls.push("summary");
        if (input.start && input.end)
          calls.push(
            `summaryRange:${input.start.toISOString()}:${input.end.toISOString()}`,
          );
        if (providerFails) throw new Error("private provider credential");
        return {
          schemaVersion: 1,
          range: "30d",
          asOf: NOW.toISOString(),
          pageviews: 20,
          visitors: 10,
          visits: 12,
          bounces: 3,
          totalTimeSeconds: 100,
          activeVisitors: 1,
          bounceRateBasisPoints: 2500,
          averageVisitSeconds: 8,
          comparison: null,
          pageviewsSeries: [],
          visitsSeries: [],
        };
      },
      async metrics(input: { type: string; start?: Date; end?: Date }) {
        calls.push(`metrics:${input.type}`);
        if (input.start && input.end)
          calls.push(
            `metricsRange:${input.start.toISOString()}:${input.end.toISOString()}`,
          );
        if (providerFails) throw new Error("private provider credential");
        return {
          schemaVersion: 1,
          range: "30d",
          type: input.type,
          asOf: NOW.toISOString(),
          items: [],
        };
      },
      async eventSessions(input: {
        eventNames: readonly string[];
        filters?: Readonly<Record<string, string>>;
      }) {
        calls.push(`eventSessions:${input.eventNames.join(",")}`);
        if (input.filters && Object.keys(input.filters).length)
          calls.push(`eventFilters:${JSON.stringify(input.filters)}`);
        if (providerFails) throw new Error("private provider credential");
        return {
          items: input.eventNames.map((label) => ({
            label,
            value: label === "product_view" ? 8 : 4,
          })),
        };
      },
      async independentEventSessions(input: {
        eventNames: readonly string[];
        filters?: Readonly<Record<string, string>>;
      }) {
        calls.push(`independentEventSessions:${input.eventNames.join(",")}`);
        if (input.filters && Object.keys(input.filters).length)
          calls.push(
            `independentEventFilters:${JSON.stringify(input.filters)}`,
          );
        if (providerFails) throw new Error("private provider credential");
        return {
          items: input.eventNames.map((label) => ({
            label,
            value: label === "product_view" ? 8 : 4,
          })),
        };
      },
      async acquisitionBreakdown(input: {
        filters?: Readonly<Record<string, string>>;
      }) {
        calls.push("acquisitionBreakdown");
        if (input.filters && Object.keys(input.filters).length)
          calls.push(`acquisitionFilters:${JSON.stringify(input.filters)}`);
        if (providerFails) throw new Error("private provider credential");
        return {
          items: [
            {
              source: "google",
              medium: "cpc",
              campaign: "summer",
              visitors: 8,
              pageviews: 10,
              productViews: 6,
              addsToCart: 4,
              checkouts: 2,
            },
          ],
        };
      },
      async eventPropertyValues(input: {
        filters?: Readonly<Record<string, string>>;
      }) {
        calls.push("eventPropertyValues");
        if (input.filters && Object.keys(input.filters).length)
          calls.push(`propertyFilters:${JSON.stringify(input.filters)}`);
        if (providerFails) throw new Error("private provider credential");
        return { items: [] };
      },
      async getWebsite() {
        calls.push("getWebsite");
        if (providerFails) throw new Error("private provider credential");
        return {
          id: "50000000-0000-4000-8000-000000000001",
          name: "Store",
          domain: "store.example.test",
        };
      },
    },
  };
  runtime.analytics.commerceSnapshot = async (input: {
    rangeStart: Date;
    rangeEnd: Date;
  }) => {
    calls.push("commerce");
    const value = snapshot(input.rangeStart, input.rangeEnd);
    return { ...value, worker: { ...value.worker, ...worker } };
  };
  return {
    calls,
    handlers: createCommerceAnalyticsHttpHandlers({
      resolveRuntime: async () => runtime as never,
      now: () => new Date(NOW),
      requestId: () => STORE,
    }),
  };
}

test("overview remains HTTP 200 with current PostgreSQL commerce truth when Umami is unavailable", async () => {
  const value = fixture(true);
  const response = await value.handlers.overview(
    request("/api/analytics/overview?range=30d"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.traffic, null);
  assert.equal(body.commerce.currencies[0].grossRevenueMinor, 20000);
  assert.match(body.message, /Trafik verileri geçici olarak alınamıyor/);
  assert.doesNotMatch(
    JSON.stringify(body),
    /credential|websiteId|connectionId/,
  );
});
test("all commerce views are authenticated tenant reads with exact stable routes", async () => {
  const value = fixture();
  for (const view of [
    "overview",
    "funnel",
    "abandoned-carts",
    "acquisition",
    "products",
    "status",
  ] as const) {
    const response = await value.handlers[view](
      request(`/api/analytics/${view}?range=30d`),
    );
    assert.equal(response.status, 200, view);
    assert.equal((await response.json()).view, view);
  }
  assert.ok(value.calls.filter((value) => value === "commerce").length === 6);
});
test("invalid dates, unknown query authority, private headers and missing sessions fail before data access", async () => {
  for (const path of [
    "/api/analytics/overview?range=365d",
    "/api/analytics/overview?range=30d&storeId=x",
    "/api/analytics/overview?from=2025-01-01&to=2026-07-26&timezone=Europe%2FIstanbul",
  ]) {
    const value = fixture();
    assert.equal((await value.handlers.overview(request(path))).status, 400);
    assert.deepEqual(value.calls, []);
  }
  const privateRequest = request("/api/analytics/overview?range=30d");
  privateRequest.headers.set("x-store-id", STORE);
  assert.equal((await fixture().handlers.overview(privateRequest)).status, 400);
  assert.equal(
    (
      await fixture().handlers.overview(
        request("/api/analytics/overview?range=30d", false),
      )
    ).status,
    401,
  );
});
test("each view rejects hidden stale filters before any tenant data access", async () => {
  for (const [view, path] of [
    ["overview", "/api/analytics/overview?range=30d&search=x"],
    ["products", "/api/analytics/products?range=30d&lifecycle=abandoned"],
    ["funnel", "/api/analytics/funnel?range=30d&lifecycle=abandoned"],
  ] as const) {
    const value = fixture();
    assert.equal((await value.handlers[view](request(path))).status, 400);
    assert.deepEqual(value.calls, []);
  }
});
test("traffic filters reject PII before repository or Umami access", async () => {
  for (const [view, path] of [
    ["funnel", "/api/analytics/funnel?range=30d&source=user%40example.test"],
    [
      "acquisition",
      "/api/analytics/acquisition?range=30d&campaign=https%3A%2F%2Fexample.test%2Fprivate",
    ],
    [
      "products",
      "/api/analytics/products?range=30d&source=%2B90%20555%20111%2022%2033",
    ],
  ] as const) {
    const value = fixture();
    assert.equal((await value.handlers[view](request(path))).status, 400);
    assert.deepEqual(value.calls, []);
  }
});
test("custom date range accepts at most thirteen months and returns no-store responses", async () => {
  const value = fixture();
  const response = await value.handlers.overview(
    request(
      "/api/analytics/overview?from=2026-01-01&to=2026-07-26&timezone=Europe%2FIstanbul",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).range.timezone, "Europe/Istanbul");
});
test("funnel reads unique event sessions while keeping paid orders canonical", async () => {
  const value = fixture();
  const response = await value.handlers.funnel(
    request("/api/analytics/funnel?range=30d"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "complete");
  assert.equal(body.traffic.events.items[0].label, "product_view");
  assert.equal(body.commerce.currencies[0].paidOrders, 2);
  assert.deepEqual(value.calls, [
    "timezone",
    "commerce",
    "authority",
    "paidFunnelSessions",
    "eventSessions:product_view,add_to_cart,view_cart,begin_checkout,payment_method_selected,purchase",
  ]);
});

test("finite URL filters are reflected and forwarded without tenant authority", async () => {
  const funnel = fixture();
  const funnelResponse = await funnel.handlers.funnel(
    request(
      "/api/analytics/funnel?range=30d&currency=TRY&device=mobile&source=google&campaign=summer&product=50000000-0000-4000-8000-000000000001&category=50000000-0000-4000-8000-000000000002",
    ),
  );
  assert.equal(funnelResponse.status, 200);
  assert.deepEqual((await funnelResponse.json()).filters, {
    currency: "TRY",
    device: "mobile",
    source: "google",
    campaign: "summer",
    productId: "50000000-0000-4000-8000-000000000001",
    categoryId: "50000000-0000-4000-8000-000000000002",
  });
  assert.ok(
    funnel.calls.includes(
      'eventFilters:{"device":"mobile","source":"google","campaign":"summer","currency":"TRY","productId":"50000000-0000-4000-8000-000000000001","categoryId":"50000000-0000-4000-8000-000000000002"}',
    ),
  );
  assert.ok(
    funnel.calls.includes(
      "eventSessions:product_view,add_to_cart,view_cart,begin_checkout,payment_method_selected,purchase",
    ),
  );
  const products = fixture();
  assert.equal(
    (
      await products.handlers.products(
        request(
          "/api/analytics/products?range=30d&currency=TRY&device=desktop&source=direct&category=50000000-0000-4000-8000-000000000002",
        ),
      )
    ).status,
    200,
  );
  assert.equal(
    products.calls.filter(
      (entry) =>
        entry ===
        'propertyFilters:{"device":"desktop","source":"direct","currency":"TRY","categoryId":"50000000-0000-4000-8000-000000000002"}',
    ).length,
    2,
  );
});

test("currency filter applies equally to current and previous commerce projections", async () => {
  const value = fixture();
  const response = await value.handlers.overview(
    request("/api/analytics/overview?range=30d&compare=1&currency=TRY"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.commerce.currencies.map((row: { currency: string }) => row.currency),
    ["TRY"],
  );
  assert.deepEqual(
    body.comparisonCommerce.currencies.map(
      (row: { currency: string }) => row.currency,
    ),
    ["TRY"],
  );
  assert.equal(body.providerAvailable, false);
  assert.equal(body.status, "degraded");
  assert.equal(value.calls.includes("authority"), false);
});

test("currency-scoped acquisition never mixes unfilterable traffic cohorts", async () => {
  const value = fixture();
  const response = await value.handlers.acquisition(
    request("/api/analytics/acquisition?range=30d&currency=TRY"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.providerAvailable, false);
  assert.equal(body.traffic, null);
  assert.equal(body.status, "degraded");
  assert.equal(value.calls.includes("acquisitionBreakdown"), false);
});

test("cart amount bounds are exact minor units and invalid ranges fail before data access", async () => {
  const value = fixture();
  const response = await value.handlers["abandoned-carts"](
    request(
      "/api/analytics/abandoned-carts?range=30d&minValue=1000&maxValue=25000",
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).filters, {
    minimumValueMinor: 1000,
    maximumValueMinor: 25000,
  });
  const invalid = fixture();
  assert.equal(
    (
      await invalid.handlers["abandoned-carts"](
        request(
          "/api/analytics/abandoned-carts?range=30d&minValue=25001&maxValue=25000",
        ),
      )
    ).status,
    400,
  );
  assert.deepEqual(invalid.calls, []);
});

test("today uses merchant-local midnight and never substitutes a seven-day Umami window", async () => {
  const value = fixture();
  const response = await value.handlers.overview(
    request("/api/analytics/overview?range=today"),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.range.start, "2026-07-25T21:00:00.000Z");
  assert.equal(body.status, "complete");
  assert.deepEqual(value.calls, [
    "timezone",
    "commerce",
    "authority",
    "summary",
    "summaryRange:2026-07-25T21:00:00.000Z:2026-07-26T12:00:00.000Z",
    "independentEventSessions:product_view,add_to_cart,begin_checkout",
    "metrics:referrer",
    "metricsRange:2026-07-25T21:00:00.000Z:2026-07-26T12:00:00.000Z",
  ]);
});

test("status probes Umami and independently degrades for provider or worker health", async () => {
  const healthy = fixture();
  assert.equal(
    (
      await (
        await healthy.handlers.status(
          request("/api/analytics/status?range=30d"),
        )
      ).json()
    ).status,
    "complete",
  );
  assert.ok(healthy.calls.includes("getWebsite"));
  assert.equal(
    (
      await (
        await fixture(true).handlers.status(
          request("/api/analytics/status?range=30d"),
        )
      ).json()
    ).providerAvailable,
    false,
  );
  const workerBody = await (
    await fixture(false, {
      pending: 2,
      claimed: 0,
      retry: 1,
      deadLetter: 0,
      oldestPendingSeconds: 10,
    }).handlers.status(request("/api/analytics/status?range=30d"))
  ).json();
  assert.equal(workerBody.status, "degraded");
  assert.match(workerBody.message, /event teslimatında gecikme/);
  assert.doesNotMatch(workerBody.message, /Trafik verileri geçici/);
});
