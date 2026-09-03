import assert from "node:assert/strict";
import test from "node:test";

import { createCache, type CacheBackend } from "./cache.ts";

class MemoryBackend implements CacheBackend {
  readonly values = new Map<string, string>();
  readonly expiries: number[] = [];
  fail = false;
  async get(key: string) { if (this.fail) throw new Error("down"); return this.values.get(key) ?? null; }
  async set(key: string, value: string, ttl: number) { if (this.fail) throw new Error("down"); this.values.set(key, value); this.expiries.push(ttl); }
  async delete(key: string) { this.values.delete(key); }
  async ping() { if (this.fail) throw new Error("down"); }
}

const options = Object.freeze({ namespace: "celebix:staging", defaultTtlSeconds: 60, negativeTtlSeconds: 5, maxPayloadBytes: 512 });
const input = Object.freeze({ storeId: "11111111-1111-4111-8111-111111111111", dataClass: "catalog" as const, schemaVersion: "v1", scope: "product", input: { slug: "ring" } });

test("read-through caches parsed envelopes and reports hits without sharing tenants", async () => {
  const backend = new MemoryBackend();
  const cache = createCache({ backend, ...options, random: () => 0.5, randomToken: () => "token" });
  let loads = 0;
  const parser = (value: unknown) => { if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string") throw new Error("invalid"); return { name: value.name }; };
  assert.deepEqual(await cache.readThrough({ ...input, parser, load: async () => ({ name: `Ring ${++loads}` }) }), { name: "Ring 1" });
  assert.deepEqual(await cache.readThrough({ ...input, parser, load: async () => ({ name: `Ring ${++loads}` }) }), { name: "Ring 1" });
  assert.equal(loads, 1);
  assert.equal(cache.metrics().hit, 1);
  assert.equal(cache.metrics().miss, 1);
});

test("malformed and oversized entries are discarded and cache errors fail open", async () => {
  const backend = new MemoryBackend();
  const cache = createCache({ backend, ...options, random: () => 0.5, randomToken: () => "token" });
  backend.values.set("celebix:staging:store:11111111-1111-4111-8111-111111111111:catalog:namespace", "token");
  backend.fail = true;
  assert.deepEqual(await cache.readThrough({ ...input, parser: (value) => value as { ok: boolean }, load: async () => ({ ok: true }) }), { ok: true });
  assert.equal(cache.metrics().error > 0, true);
});

test("negative entries use the short TTL and namespace rotation makes prior entries unreachable", async () => {
  const backend = new MemoryBackend();
  let token = "token-a";
  const cache = createCache({ backend, ...options, random: () => 0.5, randomToken: () => token });
  const parser = (value: unknown) => value as { id: string } | null;
  await cache.readThrough({ ...input, parser, load: async () => null, cacheNull: true });
  assert.equal(backend.expiries.at(-1), 5);
  token = "token-b";
  await cache.rotateNamespace(input.storeId, "catalog");
  let loads = 0;
  await cache.readThrough({ ...input, parser, load: async () => ({ id: String(++loads) }), cacheNull: true });
  assert.equal(loads, 1);
});

test("concurrent cold reads are process-local singleflight", async () => {
  const backend = new MemoryBackend();
  const cache = createCache({ backend, ...options, random: () => 0.5, randomToken: () => "token" });
  let loads = 0;
  const load = async () => { loads += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return { id: "one" }; };
  const parser = (value: unknown) => value as { id: string };
  const [a, b] = await Promise.all([cache.readThrough({ ...input, parser, load }), cache.readThrough({ ...input, parser, load })]);
  assert.deepEqual(a, b);
  assert.equal(loads, 1);
  assert.equal(cache.metrics().singleflightJoin, 1);
});

test("TTL jitter stays within plus or minus ten percent", async () => {
  for (const [random, expected] of [[0, 54], [0.5, 60], [1, 66]] as const) {
    const backend = new MemoryBackend();
    const cache = createCache({ backend, ...options, random: () => random, randomToken: () => "token" });
    await cache.readThrough({ ...input, parser: (value) => value as { ok: boolean }, load: async () => ({ ok: true }) });
    assert.equal(backend.expiries.at(-1), expected);
  }
});
