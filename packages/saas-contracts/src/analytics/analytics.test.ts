import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAnalyticsConnectionMutationResult,
  parseAnalyticsConnectionView,
  parseAnalyticsMetricResult,
  parseAnalyticsSummary,
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
    ...connectionFixture(), status: "disabled", configured: false,
    hostname: null, version: null, lastVerifiedAt: null,
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
    items: [{ label: "TR", value: 9 }, { label: "DE", value: 2 }],
  });
  const mutation = parseAnalyticsConnectionMutationResult({
    status: "active", version: 3, updatedAt: LATER, replayed: true,
  });
  assert.deepEqual(metric.items.map((item) => item.label), ["TR", "DE"]);
  assert.equal(Object.isFrozen(metric.items), true);
  assert.equal(metric.items.every(Object.isFrozen), true);
  assert.equal(mutation.replayed, true);
  assert.equal(Object.isFrozen(mutation), true);
});

test("rejects unknown keys and private analytics authority material", () => {
  for (const key of ["websiteId", "storeId", "sessionId", "token", "providerBody"]) {
    assert.throws(() => parseAnalyticsSummary({ ...summaryFixture(), [key]: "private" }), /analytics_contract_invalid/);
  }
  assert.throws(() => parseAnalyticsConnectionView({ ...connectionFixture(), websiteId: "10000000-0000-4000-8000-000000000001" }), /analytics_contract_invalid/);
  assert.throws(() => parseAnalyticsMetricResult({ schemaVersion: 1, range: "7d", type: "country", asOf: NOW, items: [], tenantContext: {} }), /analytics_contract_invalid/);
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
  ]) assert.throws(() => parseAnalyticsSummary(invalid), /analytics_contract_invalid/);
});

test("accepts only safe path and referrer metric labels", () => {
  const base = { schemaVersion: 1, range: "30d", asOf: NOW };
  assert.deepEqual(parseAnalyticsMetricResult({ ...base, type: "path", items: [{ label: "/products/sku", value: 1 }] }).items[0], { label: "/products/sku", value: 1 });
  for (const label of ["products/sku", "/products/sku?coupon=secret", "/products/sku#reviews", "//evil.example/path", "/bad\u0000path"]) {
    assert.throws(() => parseAnalyticsMetricResult({ ...base, type: "path", items: [{ label, value: 1 }] }), /analytics_contract_invalid/);
  }
  for (const label of ["direct", "unknown", "https://search.example"]) {
    assert.equal(parseAnalyticsMetricResult({ ...base, type: "referrer", items: [{ label, value: 1 }] }).items[0]?.label, label);
  }
  for (const label of ["http://search.example", "https://search.example/path", "https://search.example/?q=private", "https://user@search.example"]) {
    assert.throws(() => parseAnalyticsMetricResult({ ...base, type: "referrer", items: [{ label, value: 1 }] }), /analytics_contract_invalid/);
  }
});

test("enforces dense series and metric cardinality bounds", () => {
  const tooManyPoints = Array.from({ length: 367 }, (_, index) => ({ at: NOW, value: index }));
  assert.throws(() => parseAnalyticsSummary({ ...summaryFixture(), pageviewsSeries: tooManyPoints }), /analytics_contract_invalid/);
  const sparse = new Array(2);
  sparse[0] = { at: NOW, value: 1 };
  assert.throws(() => parseAnalyticsSummary({ ...summaryFixture(), pageviewsSeries: sparse }), /analytics_contract_invalid/);
  const items = Array.from({ length: 101 }, (_, index) => ({ label: `country-${index}`, value: index }));
  assert.throws(() => parseAnalyticsMetricResult({ schemaVersion: 1, range: "90d", type: "country", asOf: NOW, items }), /analytics_contract_invalid/);
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
