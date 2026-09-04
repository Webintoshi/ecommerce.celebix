import assert from "node:assert/strict";
import test from "node:test";
import { createCache } from "@celebix/saas-cache";

import { readAnalyticsProviderCache } from "./provider-cache.ts";

function cache() {
  const values = new Map<string, string>();
  return createCache({
    namespace: "celebix:test",
    defaultTtlSeconds: 30,
    negativeTtlSeconds: 5,
    maxPayloadBytes: 64_000,
    random: () => 0.5,
    randomToken: () => "namespace-token",
    backend: {
      async get(key) {
        return values.get(key) ?? null;
      },
      async set(key, value) {
        values.set(key, value);
      },
      async setIfAbsent(key, value) {
        if (values.has(key)) return false;
        values.set(key, value);
        return true;
      },
      async delete(key) {
        values.delete(key);
      },
      async ping() {},
    },
  });
}

const BASE = {
  storeId: "10000000-0000-4000-8000-000000000001",
  websiteId: "50000000-0000-4000-8000-000000000001",
  scope: "overview-summary",
  ttlSeconds: 30 as const,
  start: new Date("2026-08-01T00:00:00.000Z"),
  end: new Date("2026-09-01T00:00:00.000Z"),
  timezone: "Europe/Istanbul",
  currency: "TRY",
  filters: Object.freeze({ source: "atlas" }),
  parser(value: unknown) {
    if (!value || typeof value !== "object") throw Error("invalid");
    return value as Readonly<{ value: number }>;
  },
};

test("analytics provider cache coalesces one tenant/date/currency-safe key", async () => {
  const shared = cache();
  let calls = 0;
  const load = async () => {
    calls += 1;
    await new Promise((resolve) => setImmediate(resolve));
    return Object.freeze({ value: 7 });
  };
  const [left, right] = await Promise.all([
    readAnalyticsProviderCache({ ...BASE, cache: shared, load }),
    readAnalyticsProviderCache({ ...BASE, cache: shared, load }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(left, { value: 7 });
  assert.deepEqual(right, { value: 7 });
});

test("provider failure is not cached as an analytics zero", async () => {
  const shared = cache();
  let calls = 0;
  const input = {
    ...BASE,
    cache: shared,
    async load() {
      calls += 1;
      if (calls < 3) throw Error("provider_unavailable");
      return Object.freeze({ value: 9 });
    },
  };
  await assert.rejects(() => readAnalyticsProviderCache(input));
  await assert.rejects(() => readAnalyticsProviderCache(input));
  assert.deepEqual(await readAnalyticsProviderCache(input), { value: 9 });
  assert.equal(calls, 3);
});
