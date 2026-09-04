import assert from "node:assert/strict";
import test from "node:test";
import {
  createAnalyticsReadCache,
  registerServerAnalyticsRepository,
  resolveServerAnalyticsRuntime,
} from "./runtime.ts";
const KEY = {
    connectionId: "40000000-0000-4000-8000-000000000001",
    websiteId: "50000000-0000-4000-8000-000000000001",
    range: "7d" as const,
    timezone: "Europe/Istanbul",
    metric: "summary" as const,
  },
  SUMMARY = {
    schemaVersion: 1 as const,
    range: "7d" as const,
    asOf: "2026-07-26T12:00:00.000Z",
    pageviews: 1,
    visitors: 1,
    visits: 1,
    bounces: 0,
    totalTimeSeconds: 1,
    activeVisitors: 0,
    bounceRateBasisPoints: 0,
    averageVisitSeconds: 1,
    comparison: null,
    pageviewsSeries: [],
    visitsSeries: [],
  };
function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return {
    readiness: { mode },
    panelOrigin:
      mode === "approved_staging" ? "https://panel.example.test" : null,
    async resolveCredential() {
      return { kind: "unauthenticated" as const };
    },
    async rotateCredential() {
      return { kind: "unavailable" as const };
    },
    async revokeCredential() {
      return { kind: "unavailable" as const };
    },
  };
}
const repository = {
    dashboard() {
      throw 0;
    },
    commerceTimezone() {
      throw 0;
    },
    commerceSnapshot() {
      throw 0;
    },
    commerceSettings() {
      throw 0;
    },
    paidFunnelSessions() {
      throw 0;
    },
    updateCommerceSettings() {
      throw 0;
    },
    getConnection() {
      throw 0;
    },
    getConnectionAuthority() {
      throw 0;
    },
    beginConnection() {
      throw 0;
    },
    activateConnection() {
      throw 0;
    },
    disableConnection() {
      throw 0;
    },
  } as never,
  umami = {} as never;
test("disabled access never resolves analytics runtime", () =>
  assert.equal(
    resolveServerAnalyticsRuntime(access("disabled") as never, umami),
    null,
  ));
test("approved access composes a frozen registered runtime", () => {
  const a = access();
  registerServerAnalyticsRepository(a as never, repository);
  const value = resolveServerAnalyticsRuntime(a as never, umami);
  assert.equal(value?.mode, "approved_staging");
  assert.equal(Object.isFrozen(value), true);
});
test("approved PostgreSQL runtime remains available without Umami configuration", () => {
  const a = access();
  registerServerAnalyticsRepository(a as never, repository);
  const value = resolveServerAnalyticsRuntime(a as never, null);
  assert.equal(value?.mode, "approved_staging");
  assert.ok(value?.umami);
});
test("approved runtime carries the shared Redis cache without making it required", () => {
  const a = access();
  const sharedCache = { readThrough() {}, rotateNamespace() {}, ping() {}, close() {}, metrics() {} };
  registerServerAnalyticsRepository(a as never, repository);
  const value = resolveServerAnalyticsRuntime(a as never, umami, sharedCache as never);
  assert.equal(value?.sharedCache, sharedCache);
});
test("cache isolates connection and Website ID", () => {
  const cache = createAnalyticsReadCache({
    ttlMs: 30000,
    maximumEntries: 128,
    now: () => 0,
  });
  cache.set(KEY, SUMMARY);
  assert.equal(
    cache.get({ ...KEY, connectionId: "40000000-0000-4000-8000-000000000002" }),
    null,
  );
  assert.equal(
    cache.get({ ...KEY, websiteId: "50000000-0000-4000-8000-000000000002" }),
    null,
  );
});
test("cache expires at thirty seconds", () => {
  let now = 0;
  const cache = createAnalyticsReadCache({
    ttlMs: 30000,
    maximumEntries: 128,
    now: () => now,
  });
  cache.set(KEY, SUMMARY);
  now = 30001;
  assert.equal(cache.get(KEY), null);
});
test("cache capacity is bounded and DTOs stay immutable", () => {
  const cache = createAnalyticsReadCache({
    ttlMs: 30000,
    maximumEntries: 2,
    now: () => 0,
  });
  for (let i = 0; i < 3; i++)
    cache.set(
      { ...KEY, connectionId: `40000000-0000-4000-8000-00000000000${i + 1}` },
      SUMMARY,
    );
  assert.equal(
    cache.get({ ...KEY, connectionId: "40000000-0000-4000-8000-000000000001" }),
    null,
  );
  assert.equal(
    Object.isFrozen(
      cache.get({
        ...KEY,
        connectionId: "40000000-0000-4000-8000-000000000003",
      }),
    ),
    true,
  );
});
test("invalidation removes only one connection", () => {
  const cache = createAnalyticsReadCache({
      ttlMs: 30000,
      maximumEntries: 128,
      now: () => 0,
    }),
    other = { ...KEY, connectionId: "40000000-0000-4000-8000-000000000002" };
  cache.set(KEY, SUMMARY);
  cache.set(other, SUMMARY);
  cache.invalidateConnection(KEY.connectionId);
  assert.equal(cache.get(KEY), null);
  assert.notEqual(cache.get(other), null);
});
