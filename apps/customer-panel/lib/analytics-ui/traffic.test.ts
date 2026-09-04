import assert from "node:assert/strict";
import test from "node:test";

import {
  analyticsTrafficMetric,
  analyticsTrafficSources,
} from "./traffic.ts";

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
