import assert from "node:assert/strict";
import test from "node:test";

import { parseCacheConfig } from "./config.ts";

const complete = Object.freeze({
  REDIS_CACHE_ENABLED: "true",
  REDIS_CACHE_REQUIRED: "false",
  REDIS_CACHE_URL: "redis://default:secret@redis.internal:6379",
  REDIS_CACHE_NAMESPACE: "celebix:staging",
  REDIS_CACHE_CONNECT_TIMEOUT_MS: "250",
  REDIS_CACHE_COMMAND_TIMEOUT_MS: "150",
  REDIS_CACHE_DEFAULT_TTL_SECONDS: "60",
  REDIS_CACHE_CATALOG_TTL_SECONDS: "45",
  REDIS_CACHE_SETTINGS_TTL_SECONDS: "120",
  REDIS_CACHE_NEGATIVE_TTL_SECONDS: "5",
  REDIS_CACHE_MAX_PAYLOAD_BYTES: "262144",
});

test("disabled cache does not require a URL", () => {
  assert.deepEqual(parseCacheConfig({ REDIS_CACHE_ENABLED: "false" }), { enabled: false });
});

test("approved staging cache configuration parses exact bounded values", () => {
  const parsed = parseCacheConfig(complete);
  assert.equal(parsed.enabled, true);
  if (!parsed.enabled) return;
  assert.equal(parsed.required, false);
  assert.equal(parsed.url, complete.REDIS_CACHE_URL);
  assert.equal(parsed.namespace, "celebix:staging");
  assert.equal(parsed.connectTimeoutMs, 250);
  assert.equal(parsed.commandTimeoutMs, 150);
  assert.equal(parsed.ttl.catalogSeconds, 45);
  assert.equal(parsed.ttl.settingsSeconds, 120);
  assert.equal(parsed.ttl.negativeSeconds, 5);
  assert.equal(parsed.maxPayloadBytes, 262_144);
});

test("configuration rejects floating booleans, unsafe namespaces, URLs without auth, and unbounded numbers", () => {
  for (const source of [
    { ...complete, REDIS_CACHE_ENABLED: "yes" },
    { ...complete, REDIS_CACHE_NAMESPACE: "bad namespace" },
    { ...complete, REDIS_CACHE_URL: "redis://redis.internal:6379" },
    { ...complete, REDIS_CACHE_COMMAND_TIMEOUT_MS: "5001" },
    { ...complete, REDIS_CACHE_MAX_PAYLOAD_BYTES: "0" },
  ]) assert.throws(() => parseCacheConfig(source), /redis_cache_configuration_invalid/);
});

test("errors never contain Redis credentials", () => {
  const secret = "do-not-leak";
  assert.throws(
    () => parseCacheConfig({ ...complete, REDIS_CACHE_URL: `redis://default:${secret}@` }),
    (error) => error instanceof Error && error.message === "redis_cache_configuration_invalid" && !error.stack?.includes(secret),
  );
});
