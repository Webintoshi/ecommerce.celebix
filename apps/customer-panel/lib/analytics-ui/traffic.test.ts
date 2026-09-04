import assert from "node:assert/strict";
import test from "node:test";

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
