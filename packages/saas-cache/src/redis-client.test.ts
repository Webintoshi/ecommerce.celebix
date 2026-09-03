import assert from "node:assert/strict";
import test from "node:test";

import { createRedisCacheBackend, type RedisClientLike } from "./redis-client.ts";

class FakeRedisClient implements RedisClientLike {
  isOpen = false;
  connectCalls = 0;
  quitCalls = 0;
  fail = false;
  readonly values = new Map<string, string>();
  on() { return this; }
  async connect() { this.connectCalls += 1; if (this.fail) throw new Error("secret must not leak"); this.isOpen = true; }
  async get(key: string) { if (this.fail) throw new Error("down"); return this.values.get(key) ?? null; }
  async set(key: string, value: string, options?: { EX?: number; NX?: boolean }) { if (this.fail) throw new Error("down"); if (options?.NX && this.values.has(key)) return null; this.values.set(key, value); return "OK"; }
  async del(key: string) { this.values.delete(key); return 1; }
  async ping() { if (this.fail) throw new Error("down"); return "PONG"; }
  async quit() { this.quitCalls += 1; this.isOpen = false; return "OK"; }
}

test("backend connects lazily once, supports NX, and closes gracefully", async () => {
  const client = new FakeRedisClient();
  const backend = createRedisCacheBackend({ client, commandTimeoutMs: 100 });
  await backend.set("key", "one", 5);
  await backend.get("key");
  assert.equal(client.connectCalls, 1);
  assert.equal(await backend.setIfAbsent!("key", "two", 5), false);
  assert.equal(await backend.setIfAbsent!("other", "two", 5), true);
  await backend.close!();
  assert.equal(client.quitCalls, 1);
});

test("bounded commands reject without logging or returning secret-bearing errors", async () => {
  const client = new FakeRedisClient();
  client.get = async () => new Promise(() => undefined);
  const backend = createRedisCacheBackend({ client, commandTimeoutMs: 10 });
  await assert.rejects(() => backend.get("key"), (error) => error instanceof Error && error.message === "redis_cache_command_failed");
});

test("a failed initial connection can be retried without recreating the backend", async () => {
  const client = new FakeRedisClient();
  client.fail = true;
  const backend = createRedisCacheBackend({ client, commandTimeoutMs: 20 });
  await assert.rejects(() => backend.ping(), /redis_cache_command_failed/);
  client.fail = false;
  await backend.ping();
  assert.equal(client.connectCalls, 2);
});
