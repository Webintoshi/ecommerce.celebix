import assert from "node:assert/strict";
import test from "node:test";

import { cacheDependencySnapshot, createCacheRuntime } from "./runtime.ts";
import type { CacheBackend } from "./cache.ts";

class HealthBackend implements CacheBackend {
  down = false;
  async get() { if (this.down) throw new Error("down"); return null; }
  async set() { if (this.down) throw new Error("down"); }
  async delete() {}
  async ping() { if (this.down) throw new Error("down"); }
}

const source = Object.freeze({
  REDIS_CACHE_ENABLED: "true",
  REDIS_CACHE_REQUIRED: "false",
  REDIS_CACHE_URL: "redis://default:secret@redis.internal:6379",
  REDIS_CACHE_NAMESPACE: "celebix:staging",
});

test("disabled runtime is explicit and never creates a backend", () => {
  let called = false;
  const runtime = createCacheRuntime({ source: { REDIS_CACHE_ENABLED: "false" }, createBackend: () => { called = true; throw new Error("unexpected"); } });
  assert.equal(runtime.enabled, false);
  assert.equal(called, false);
});

test("optional cache health degrades and recovers while remaining enabled", async () => {
  const backend = new HealthBackend();
  const runtime = createCacheRuntime({ source, createBackend: () => backend });
  assert.equal(runtime.enabled, true);
  assert.equal(await runtime.health(), "healthy");
  backend.down = true;
  assert.equal(await runtime.health(), "degraded");
  backend.down = false;
  assert.equal(await runtime.health(), "healthy");
});

test("malformed optional configuration becomes a degraded disabled runtime without leaking secrets", () => {
  const runtime = createCacheRuntime({ source: { ...source, REDIS_CACHE_URL: "redis://default:do-not-leak@" }, createBackend: () => new HealthBackend() });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.configurationError, true);
});

test("dependency snapshot exposes only bounded counters and health", async () => {
  const backend = new HealthBackend();
  const runtime = createCacheRuntime({ source, createBackend: () => backend });
  const snapshot = await cacheDependencySnapshot(runtime);
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.required, false);
  assert.deepEqual(snapshot.metrics, { redis_cache_hit_total: 0, redis_cache_miss_total: 0, redis_cache_set_total: 0, redis_cache_error_total: 0, redis_cache_timeout_total: 0, redis_cache_invalidations_total: 0, redis_cache_bypass_total: 0, redis_cache_payload_rejected_total: 0, redis_cache_negative_hit_total: 0, redis_cache_singleflight_join_total: 0, scopes: {} });
  assert.equal(JSON.stringify(snapshot).includes("redis://"), false);
});
