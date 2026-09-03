import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type {
  AnalyticsConnectionView,
  AnalyticsMetricResult,
  AnalyticsMetricType,
  AnalyticsRange,
  AnalyticsSummary,
} from "@celebix/saas-contracts";
import {
  disabledAnalyticsPresentation,
  errorAnalyticsPresentation,
  loadAnalyticsPresentation,
  loadingAnalyticsPresentation,
  type AnalyticsBrowserApi,
} from "./presentation.ts";

const SUMMARY: AnalyticsSummary = Object.freeze({
  schemaVersion: 1,
  range: "30d",
  asOf: "2026-07-26T12:00:00.000Z",
  pageviews: 42,
  visitors: 17,
  visits: 20,
  bounces: 5,
  totalTimeSeconds: 600,
  activeVisitors: 3,
  bounceRateBasisPoints: 2500,
  averageVisitSeconds: 30,
  comparison: null,
  pageviewsSeries: Object.freeze([
    Object.freeze({ at: "2026-07-26T00:00:00.000Z", value: 42 }),
  ]),
  visitsSeries: Object.freeze([
    Object.freeze({ at: "2026-07-26T00:00:00.000Z", value: 20 }),
  ]),
});
const CONNECTION: AnalyticsConnectionView = Object.freeze({
  schemaVersion: 1,
  provider: "umami",
  status: "active",
  configured: true,
  hostname: "shop.example.test",
  version: 2,
  lastVerifiedAt: SUMMARY.asOf,
});

function metric(
  type: AnalyticsMetricType,
  range: AnalyticsRange = "30d",
): AnalyticsMetricResult {
  const labels = {
    path: "/products",
    referrer: "https://search.example",
    device: "desktop",
    country: "TR",
    event: "product_view",
  } as const;
  return Object.freeze({
    schemaVersion: 1,
    range,
    type,
    asOf: SUMMARY.asOf,
    items: Object.freeze([Object.freeze({ label: labels[type], value: 4 })]),
  });
}

function api(
  overrides: Partial<AnalyticsBrowserApi> = {},
): AnalyticsBrowserApi {
  return {
    async connection() {
      return CONNECTION;
    },
    async summary() {
      return SUMMARY;
    },
    async metrics(range, type) {
      return metric(type, range);
    },
    ...overrides,
  } as AnalyticsBrowserApi;
}

test("loading disabled and error presentation states are immutable", () => {
  const states = [
    loadingAnalyticsPresentation(),
    disabledAnalyticsPresentation(),
    errorAnalyticsPresentation(),
  ];
  assert.deepEqual(
    states.map((value) => value.state),
    ["loading", "disabled", "error"],
  );
  assert.equal(states.every(Object.isFrozen), true);
  assert.equal(
    states.every((value) => Object.isFrozen(value.metrics)),
    true,
  );
});

test("loaded presentation preserves exact summary and all metric tabs", async () => {
  const model = await loadAnalyticsPresentation(
    api(),
    "30d",
    new AbortController().signal,
  );
  assert.equal(model.state, "loaded");
  assert.equal(model.summary?.pageviews, 42);
  assert.deepEqual(Object.keys(model.metrics), [
    "path",
    "referrer",
    "device",
    "country",
    "event",
  ]);
  assert.equal(
    Object.values(model.metrics).every((value) => value?.items[0]?.value === 4),
    true,
  );
});

test("zero provider authority becomes an honest empty state", async () => {
  const empty = {
    ...SUMMARY,
    pageviews: 0,
    visitors: 0,
    visits: 0,
    bounces: 0,
    totalTimeSeconds: 0,
    activeVisitors: 0,
    bounceRateBasisPoints: 0,
    averageVisitSeconds: 0,
    pageviewsSeries: [],
    visitsSeries: [],
  };
  const model = await loadAnalyticsPresentation(
    api({
      summary: async () => empty,
      metrics: async (_range, type) => ({ ...metric(type), items: [] }),
    }),
    "30d",
    new AbortController().signal,
  );
  assert.equal(model.state, "empty");
  assert.equal(model.summary?.pageviews, 0);
});

test("each selectable range is forwarded exactly to summary and metrics", async () => {
  const seen: string[] = [];
  for (const range of ["7d", "30d", "90d"] as const) {
    await loadAnalyticsPresentation(
      api({
        summary: async (selected) => {
          seen.push(`summary:${selected}`);
          return { ...SUMMARY, range: selected };
        },
        metrics: async (selected, type) => {
          seen.push(`${type}:${selected}`);
          return metric(type, selected);
        },
      }),
      range,
      new AbortController().signal,
    );
  }
  assert.equal(seen.length, 18);
  for (const range of ["7d", "30d", "90d"])
    assert.equal(seen.filter((value) => value.endsWith(`:${range}`)).length, 6);
});

test("one AbortSignal reaches connection summary and every metric request", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  await loadAnalyticsPresentation(
    api({
      connection: async (signal) => {
        signals.push(signal!);
        return CONNECTION;
      },
      summary: async (_range, signal) => {
        signals.push(signal!);
        return SUMMARY;
      },
      metrics: async (range, type, signal) => {
        signals.push(signal!);
        return metric(type, range);
      },
    }),
    "30d",
    controller.signal,
  );
  assert.equal(signals.length, 7);
  assert.equal(
    signals.every((signal) => signal === controller.signal),
    true,
  );
});

test("one metric failure remains local and preserves every other result", async () => {
  const model = await loadAnalyticsPresentation(
    api({
      metrics: async (range, type) => {
        if (type === "country") throw new Error("provider private body");
        return metric(type, range);
      },
    }),
    "30d",
    new AbortController().signal,
  );
  assert.equal(model.state, "loaded");
  assert.equal(model.metrics.country, null);
  assert.equal(model.metrics.path?.items[0]?.label, "/products");
});

test("disabled connection short-circuits all analytics reads", async () => {
  let reads = 0;
  const model = await loadAnalyticsPresentation(
    api({
      connection: async () => ({ ...CONNECTION, status: "disabled" }),
      summary: async () => {
        reads += 1;
        return SUMMARY;
      },
      metrics: async (range, type) => {
        reads += 1;
        return metric(type, range);
      },
    }),
    "30d",
    new AbortController().signal,
  );
  assert.equal(model.state, "disabled");
  assert.equal(reads, 0);
});

test("private or mismatched provider projections are rejected", async () => {
  await assert.rejects(
    () =>
      loadAnalyticsPresentation(
        api({
          summary: async () => ({ ...SUMMARY, websiteId: "private" }) as never,
        }),
        "30d",
        new AbortController().signal,
      ),
    /analytics_presentation_invalid/,
  );
  const source = JSON.stringify(
    await loadAnalyticsPresentation(api(), "30d", new AbortController().signal),
  );
  assert.doesNotMatch(
    source,
    /websiteId|storeId|TenantContext|providerBody|sessionId|distinctId/,
  );
});

test("mobile metric tabs stay readable inside the horizontal viewport", async () => {
  const styles = await readFile(
    new URL("../../components/analytics/panel-analytics.module.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /[.]metricTabs\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(
    styles,
    /[.]metricTabs button\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s,
  );
});
