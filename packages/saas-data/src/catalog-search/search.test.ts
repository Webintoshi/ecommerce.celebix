import assert from "node:assert/strict";
import test from "node:test";
import type { PublicStorefrontContentRepository } from "../storefront-content/types.ts";
import { StorefrontContentRepositoryError } from "../storefront-content/errors.ts";
import { storefrontContentCursor } from "../storefront-content/validation.ts";
import { createCatalogSearchContentRepository, createMeilisearchCatalogSearchProvider, isCatalogSearchCursor, normalizeCatalogSearchQuery } from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const P1 = "71000000-0000-4000-8000-000000000001";
const P2 = "71000000-0000-4000-8000-000000000002";
const P3 = "71000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-10-02T12:00:00.000Z");
const INPUT = { hostname: "shop.example.test", now: NOW, query: "AKÜ-1", limit: 2 };
const product = (id: string, available = true) => ({ id, title: "Current title", priceCents: 999, available, status: "active" });
const unavailable = (error: unknown) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable";
const invalid = (error: unknown) => error instanceof StorefrontContentRepositoryError && error.code === "invalid_input";
const json = (value: unknown, status = 200) => Response.json(value, { status });
type FetchCall = { url: string; body: Record<string, unknown>; init: RequestInit };
function http(handler: (call: FetchCall) => Response | Promise<Response>) {
  return (async (url: string | URL | Request, init?: RequestInit) => handler({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), init: init ?? {} })) as typeof fetch;
}
function base() {
  const searches: unknown[] = [];
  const hydrations: unknown[] = [];
  class Content {
    readonly marker = "bound";
    async getLocales() { return { defaultLocale: this.marker, enabledLocales: ["tr"] }; }
    async listPolicies() { return []; }
    async getPolicy() { throw new Error("unused"); }
    async search(input: unknown) { searches.push(input); return { items: [product(P3)] }; }
    async resolveProductIds(input: { productIds: readonly string[] }) {
      hydrations.push(input);
      // The authoritative read removes archived products and changes price/title.
      return input.productIds.filter((id) => id !== P2).map((id) => product(id));
    }
  }
  return { repository: new Content() as unknown as PublicStorefrontContentRepository, searches, hydrations };
}
const scope = { resolve: async () => ({ storeId: STORE, pending: false }) };

test("Turkish uppercase, diacritics and whitespace normalize consistently with catalog documents", () => {
  assert.equal(normalizeCatalogSearchQuery("  İSTANBUL IĞDIR  Şarjlı   AKÜ ÇÖZÜM  "), "istanbul igdir sarjli aku cozum");
});

test("every search request enforces the authoritative store filter and exact SKU/barcode results precede text matches", async () => {
  const calls: FetchCall[] = [];
  const provider = createMeilisearchCatalogSearchProvider({ url: "http://search.internal:7700", apiKey: "read-key", fetch: http((call) => {
    calls.push(call);
    if (call.body.hitsPerPage === 0) return json({ hits: [], totalHits: 1 });
    if (call.body.q === "") return json({ hits: [{ storeId: STORE, productId: P1 }] });
    return json({ hits: [{ storeId: STORE, productId: P2 }, { storeId: STORE, productId: P3 }] });
  }) });
  const result = await provider.search({ storeId: STORE, query: "AKÜ-1", limit: 2, offset: 0 });
  assert.deepEqual(result, { productIds: [P1, P2], nextOffset: 2 });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url, "http://search.internal:7700/indexes/celebix_products_v1/search");
    assert.match(String(call.body.filter), new RegExp(`storeId = "${STORE}"`));
    assert.deepEqual(call.body.attributesToRetrieve, ["storeId", "productId"]);
    assert.equal(new Headers(call.init.headers).get("authorization"), "Bearer read-key");
  }
  assert.match(String(calls[0]!.body.filter), /skus = "aku-1" OR barcodes = "aku-1"/);
  assert.match(String(calls[2]!.body.filter), /skus != "aku-1" AND barcodes != "aku-1"/);
  assert.equal(calls[2]!.body.q, "aku-1");
});

test("injected foreign tenant hits and malformed UUIDs fail closed", async () => {
  for (const hit of [{ storeId: OTHER, productId: P1 }, { storeId: STORE, productId: "not-a-uuid" }]) {
    const provider = createMeilisearchCatalogSearchProvider({ url: "http://search:7700", apiKey: "read-key", fetch: http(({ body }) => body.hitsPerPage === 0 ? json({ hits: [], totalHits: 0 }) : json({ hits: [hit] })) });
    await assert.rejects(provider.search({ storeId: STORE, query: "aku", limit: 2, offset: 0 }), unavailable);
  }
});

test("unresponsive providers have a bounded timeout even when fetch ignores abort", async () => {
  const provider = createMeilisearchCatalogSearchProvider({ url: "http://search:7700", apiKey: "read-key", queryTimeoutMs: 15, fetch: (() => new Promise(() => {})) as typeof fetch });
  const started = Date.now();
  await assert.rejects(provider.search({ storeId: STORE, query: "aku", limit: 2, offset: 0 }), unavailable);
  assert.ok(Date.now() - started < 500);
});

test("HTTP errors, pending scope, bootstrap scope errors and timeouts fall back on the first page", async () => {
  for (const mode of ["http", "pending", "scope", "timeout"]) {
    const fixture = base();
    let providerCalls = 0;
    const repository = createCatalogSearchContentRepository({ base: fixture.repository,
      scope: { resolve: async () => { if (mode === "scope") throw new Error("migration unavailable"); return { storeId: STORE, pending: mode === "pending" }; } },
      provider: { search: async () => { providerCalls++; throw new StorefrontContentRepositoryError("unavailable"); } },
    });
    const result = await repository.search(INPUT);
    assert.equal(result.items[0]?.id, P3);
    assert.deepEqual(fixture.searches, [INPUT]);
    assert.equal(providerCalls, mode === "scope" || mode === "pending" ? 0 : 1);
  }
});

test("a compatible reader recovers when the scope migration arrives without restarting", async () => {
  const fixture = base();
  let migrated = false, providerCalls = 0;
  const repository = createCatalogSearchContentRepository({ base: fixture.repository,
    scope: { resolve: async () => { if (!migrated) throw new Error("migration unavailable"); return { storeId: STORE, pending: false }; } },
    provider: { search: async () => { providerCalls++; return { productIds: [P1], nextOffset: null }; } },
  });
  assert.equal((await repository.search(INPUT)).items[0]?.id, P3);
  migrated = true;
  assert.equal((await repository.search(INPUT)).items[0]?.id, P1);
  assert.equal(providerCalls, 1);
  assert.equal(fixture.searches.length, 1);
});

test("real HTTP failure and provider timeout recover through database search", async () => {
  for (const transport of [http(() => json({ code: "index_not_found" }, 404)), (() => new Promise(() => {})) as typeof fetch]) {
    const fixture = base();
    const provider = createMeilisearchCatalogSearchProvider({ url: "http://search:7700", apiKey: "read-key", queryTimeoutMs: 10, fetch: transport });
    const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope, provider });
    assert.equal((await repository.search(INPUT)).items[0]?.id, P3);
    assert.deepEqual(fixture.searches, [INPUT]);
  }
});

test("invalid scope and hydration read errors fall back safely on the first page", async () => {
  for (const stage of ["scope", "hydrate"]) {
    const fixture = base();
    if (stage === "hydrate") fixture.repository.resolveProductIds = async () => { throw new Error("database interruption"); };
    const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope: { resolve: async () => ({ storeId: stage === "scope" ? "invalid" : STORE, pending: false }) }, provider: { search: async () => ({ productIds: [P1], nextOffset: null }) } });
    assert.equal((await repository.search(INPUT)).items[0]?.id, P3);
    assert.deepEqual(fixture.searches, [INPUT]);
  }
});

test("an empty first index page verifies PostgreSQL results including legitimate zero matches", async () => {
  for (const hasMatch of [true, false]) {
    const fixture = base();
    if (!hasMatch) fixture.repository.search = async (input) => { fixture.searches.push(input); return { items: [] }; };
    const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope, provider: { search: async () => ({ productIds: [], nextOffset: null }) } });
    const result = await repository.search(INPUT);
    assert.deepEqual(result.items.map(({ id }) => id), hasMatch ? [P3] : []);
    assert.deepEqual(fixture.searches, [INPUT]);
  }
});

test("an empty Meili continuation retains its own result and avoids restarting database pagination", async () => {
  const fixture = base();
  const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope, provider: { search: async ({ offset }) => offset === 0 ? ({ productIds: [P1], nextOffset: 2 }) : ({ productIds: [], nextOffset: null }) } });
  const first = await repository.search(INPUT);
  assert.deepEqual(await repository.search({ ...INPUT, cursor: first.nextCursor }), { items: [] });
  assert.equal(fixture.searches.length, 0);
});

test("successful ranked IDs hydrate current catalog state using the same hostname and timestamp and retain all content methods", async () => {
  const fixture = base();
  const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope, provider: { search: async () => ({ productIds: [P2, P1], nextOffset: 2 }) } });
  const result = await repository.search(INPUT);
  assert.deepEqual(result.items, [product(P1)]);
  assert.deepEqual(fixture.hydrations, [{ hostname: INPUT.hostname, now: NOW, productIds: [P2, P1] }]);
  assert.match(result.nextCursor!, /^m1\.[a-f0-9]{64}\.2$/);
  assert.equal((await repository.getLocales!(INPUT)).defaultLocale, "bound");
  assert.equal(fixture.searches.length, 0);
});

test("Meili cursors bind query and tenant, continue offsets and never restart silently during downtime", async () => {
  const fixture = base();
  const offsets: number[] = [];
  let fail = false;
  let storeId = STORE;
  const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope: { resolve: async () => ({ storeId, pending: false }) }, provider: { search: async ({ offset }) => {
    if (fail) throw new Error("down"); offsets.push(offset); return { productIds: [P1], nextOffset: offset + 2 };
  } } });
  const first = await repository.search(INPUT);
  await repository.search({ ...INPUT, cursor: first.nextCursor });
  assert.deepEqual(offsets, [0, 2]);
  await assert.rejects(repository.search({ ...INPUT, query: "different", cursor: first.nextCursor }), invalid);
  storeId = OTHER;
  await assert.rejects(repository.search({ ...INPUT, cursor: first.nextCursor }), invalid);
  storeId = STORE; fail = true;
  await assert.rejects(repository.search({ ...INPUT, cursor: first.nextCursor }), unavailable);
  assert.equal(fixture.searches.length, 0);
});

test("legacy and ranked PostgreSQL cursors continue through the database repository", async () => {
  const fixture = base();
  const repository = createCatalogSearchContentRepository({ base: fixture.repository, scope: { resolve: async () => { throw new Error("must not resolve"); } }, provider: { search: async () => { throw new Error("must not search"); } } });
  for (const cursor of [`${NOW.toISOString()}|${P1}`, `true|${NOW.toISOString()}|${P1}`, `s2|3|false|${NOW.toISOString()}|${P1}`]) {
    assert.equal(storefrontContentCursor(cursor), cursor);
    assert.equal(isCatalogSearchCursor(cursor), true);
    assert.equal((await repository.search({ ...INPUT, cursor })).items[0]?.id, P3);
  }
  assert.equal(isCatalogSearchCursor("s2|3|false|2026-02-30T12:00:00.000Z|" + P1), false);
  assert.equal(isCatalogSearchCursor("m1." + "a".repeat(64) + ".10001"), false);
});
