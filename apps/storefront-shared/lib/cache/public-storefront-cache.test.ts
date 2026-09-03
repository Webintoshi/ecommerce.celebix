import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultStarterPresentation } from "@celebix/saas-contracts";
import { createCache, type CacheBackend } from "@celebix/saas-cache";
import { PublicStorefrontRepositoryError, type PublicStorefrontRepository } from "@celebix/saas-data";

import { createCachedPublicStorefrontRepository } from "./public-storefront-cache.ts";

class MemoryBackend implements CacheBackend {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  async ping() {}
}

const STOREFRONT = Object.freeze({ schemaVersion: 2 as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Pilot", slug: "pilot", hostname: "pilot.example.test", primaryHostname: "pilot.example.test", canonicalUrl: "https://pilot.example.test/", currency: "TRY" as const, locale: "tr" as const, themeKey: "hemenaku", presentation: buildDefaultStarterPresentation({ name: "Pilot" }) });
const NOW = new Date("2026-09-03T10:00:00.000Z");

function fixture(overrides: Partial<PublicStorefrontRepository> = {}) {
  const calls = { host: 0, products: 0, category: 0 };
  const repository: PublicStorefrontRepository = {
    async getPublicStorefront() { calls.host += 1; return STOREFRONT; },
    async listPublicProducts() { calls.products += 1; return Object.freeze({ items: Object.freeze([]) }); },
    async listPublicProductsByCategory() { calls.category += 1; return Object.freeze({ category: Object.freeze({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Rings", slug: "rings" }), items: Object.freeze([]) }); },
    async getPublicProductBySlug() { throw new PublicStorefrontRepositoryError("not_found"); },
    async listPublicProductMedia() { return Object.freeze([]); },
    async getPublicStorefrontDesign() { throw new PublicStorefrontRepositoryError("not_found"); },
    ...overrides,
  };
  const cache = createCache({ backend: new MemoryBackend(), namespace: "celebix:staging", defaultTtlSeconds: 60, negativeTtlSeconds: 5, maxPayloadBytes: 262_144, randomToken: () => "token", random: () => 0.5 });
  return { calls, repository: createCachedPublicStorefrontRepository(repository, cache, { catalogSeconds: 45, settingsSeconds: 120 }) };
}

test("hostname authority always bypasses Redis while trusted public product projections are cached", async () => {
  const selected = fixture();
  await selected.repository.getPublicStorefront({ hostname: STOREFRONT.hostname, now: NOW });
  await selected.repository.getPublicStorefront({ hostname: STOREFRONT.hostname, now: NOW });
  await selected.repository.listPublicProducts({ storefront: STOREFRONT, now: NOW, limit: 12 });
  await selected.repository.listPublicProducts({ storefront: STOREFRONT, now: new Date(NOW.getTime() + 1_000), limit: 12 });
  assert.equal(selected.calls.host, 2);
  assert.equal(selected.calls.products, 1);
});

test("query inputs alter cache identity but request time does not", async () => {
  const selected = fixture();
  await selected.repository.listPublicProductsByCategory({ storefront: STOREFRONT, now: NOW, slug: "rings", limit: 12 });
  await selected.repository.listPublicProductsByCategory({ storefront: STOREFRONT, now: new Date(), slug: "rings", limit: 12 });
  await selected.repository.listPublicProductsByCategory({ storefront: STOREFRONT, now: NOW, slug: "necklaces", limit: 12 });
  assert.equal(selected.calls.category, 2);
});

test("not-found projections use negative caching and preserve repository error semantics", async () => {
  let calls = 0;
  const selected = fixture({ async getPublicProductBySlug() { calls += 1; throw new PublicStorefrontRepositoryError("not_found"); } });
  for (let index = 0; index < 2; index += 1) await assert.rejects(
    () => selected.repository.getPublicProductBySlug({ storefront: STOREFRONT, now: NOW, slug: "missing" }),
    (error) => error instanceof PublicStorefrontRepositoryError && error.code === "not_found",
  );
  assert.equal(calls, 1);
});

test("cache outage fails open to PostgreSQL", async () => {
  const cache = createCache({ backend: { async get() { throw new Error("down"); }, async set() { throw new Error("down"); }, async delete() {}, async ping() { throw new Error("down"); } }, namespace: "celebix:staging", defaultTtlSeconds: 60, negativeTtlSeconds: 5, maxPayloadBytes: 262_144 });
  let calls = 0;
  const source = fixture({ async listPublicProducts() { calls += 1; return { items: [] }; } }).repository;
  const wrapped = createCachedPublicStorefrontRepository(source, cache, { catalogSeconds: 45, settingsSeconds: 120 });
  assert.deepEqual(await wrapped.listPublicProducts({ storefront: STOREFRONT, now: NOW, limit: 12 }), { items: [] });
  assert.equal(calls, 1);
});
