import assert from "node:assert/strict";
import test from "node:test";
import * as traffic from "./traffic.ts";

import {
  analyticsProductMetricCount,
  analyticsTrafficMetric,
  analyticsTrafficSources,
} from "./traffic.ts";

test("a product without an event row is a truthful zero when the metric is available", () => {
  assert.equal(
    analyticsProductMetricCount(
      { views: { items: [] } },
      "views",
      "50000000-0000-4000-8000-000000000001",
    ),
    0,
  );
});

test("an existing product event count is preserved exactly", () => {
  assert.equal(
    analyticsProductMetricCount(
      {
        views: {
          items: [
            {
              label: "50000000-0000-4000-8000-000000000001",
              value: 7,
            },
          ],
        },
      },
      "views",
      "50000000-0000-4000-8000-000000000001",
    ),
    7,
  );
});

test("a specifically unavailable product metric stays unavailable", () => {
  assert.equal(
    analyticsProductMetricCount(
      { views: null },
      "views",
      "50000000-0000-4000-8000-000000000001",
    ),
    null,
  );
});

test("a product metric stays unavailable when the provider result is unavailable", () => {
  assert.equal(
    analyticsProductMetricCount(
      null,
      "views",
      "50000000-0000-4000-8000-000000000001",
    ),
    null,
  );
});

test("an unavailable referrer result keeps the traffic-source chart unavailable", () => {
  assert.equal(
    analyticsTrafficSources({
      sources: null,
      metrics: { referrer: null },
    }),
    null,
  );
});

test("an unavailable traffic dimension stays unavailable instead of becoming an empty result", () => {
  assert.equal(
    analyticsTrafficMetric(
      { metrics: { country: null } },
      "country",
    ),
    null,
  );
});

test("an available empty traffic dimension remains a truthful empty result", () => {
  assert.deepEqual(
    analyticsTrafficMetric(
      { metrics: { country: { items: [] } } },
      "country",
    ),
    [],
  );
});

test("traffic dimension parser preserves bounded valid rows", () => {
  assert.deepEqual(
    analyticsTrafficMetric(
      { metrics: { path: { items: [{ label: "/urunler", value: 3 }] } } },
      "path",
    ),
    [{ label: "/urunler", value: 3 }],
  );
});


test("event outage stays distinct from a measured empty cohort", async () => {
  const {analyticsTrafficEvents} = await import("./traffic.ts");
  assert.equal(analyticsTrafficEvents({summary: {visitors: 12}, events: null}), null);
  assert.deepEqual(analyticsTrafficEvents({events: {items: []}}), {});
  assert.deepEqual(analyticsTrafficEvents({events: {items: [{label: "add_to_cart", value: 20}, {label: "product_view", value: 10}]}}), {add_to_cart: 20, product_view: 10});
});

test("indexed product counts distinguish unavailable metrics from measured missing products", () => {
  assert.equal(typeof traffic.analyticsProductMetricIndex, "function");
  assert.equal(typeof traffic.analyticsIndexedProductMetricCount, "function");
  const unavailable = traffic.analyticsProductMetricIndex({ views: null }, "views");
  const empty = traffic.analyticsProductMetricIndex({ adds: { items: [] } }, "adds");
  assert.equal(unavailable, null);
  assert.equal(traffic.analyticsIndexedProductMetricCount(unavailable, "missing"), null);
  assert.equal(traffic.analyticsIndexedProductMetricCount(empty, "missing"), 0);
  assert.equal(traffic.analyticsProductMetricIndex(null, "views"), null);
});

test("product indexes retain the first valid count and exclude malformed rows", () => {
  assert.equal(typeof traffic.analyticsProductMetricIndex, "function");
  const payload = { views: { items: [
    { label: "product-a", value: -1 },
    { label: "product-a", value: 7 },
    { label: "product-a", value: 19 },
    { label: "product-b", value: 0 },
    { label: "__proto__", value: 3 },
    { label: "product-c", value: "5" },
    { label: "product-d", value: Number.MAX_SAFE_INTEGER + 1 },
    { label: "", value: 2 },
    null,
  ] } };
  const index = traffic.analyticsProductMetricIndex(payload, "views");
  assert.deepEqual([...index!], [["product-a", 7], ["product-b", 0], ["__proto__", 3]]);
  assert.equal(traffic.analyticsIndexedProductMetricCount(index, "product-a"), 7);
  assert.equal(traffic.analyticsIndexedProductMetricCount(index, "product-c"), 0);
  assert.equal(payload.views.items.length, 9);
});

test("repeated indexed lookups do not read the provider rows again", () => {
  assert.equal(typeof traffic.analyticsProductMetricIndex, "function");
  let reads = 0;
  const index = traffic.analyticsProductMetricIndex({ views: {
    get items() { reads += 1; return [{ label: "product-a", value: 12 }]; },
  } }, "views");
  for (let count = 0; count < 100; count += 1) {
    assert.equal(traffic.analyticsIndexedProductMetricCount(index, "product-a"), 12);
  }
  assert.equal(reads, 1);
});
