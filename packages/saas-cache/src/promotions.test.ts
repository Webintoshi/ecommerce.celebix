import assert from "node:assert/strict";
import test from "node:test";

import { createCache, type CacheBackend } from "./cache.ts";
import { parseCompiledPromotionReadModel, readCompiledPromotionModel } from "./promotions.ts";

const STORE = "11111111-1111-4111-8111-111111111111";
const PROMOTION = "22222222-2222-4222-8222-222222222222";
const ruleDocument = Object.freeze({ schemaVersion: 1, benefit: { kind: "free_shipping" }, targets: { mode: "all", include: [], exclude: [] }, audience: { mode: "everyone" }, trigger: { kind: "automatic" }, schedule: { timezone: "Europe/Istanbul" }, limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: null }, conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 }, combinationPolicy: { kind: "none" }, priority: 0, marginPolicy: { kind: "warn" }, progressMessagePolicy: { enabled: false } });
const model = () => ({ schemaVersion: 1 as const, storeId: STORE, currency: "TRY", salesChannel: "storefront" as const, definitions: [{ id: PROMOTION, version: 3, ruleDocument }] });

class Backend implements CacheBackend {
  readonly values = new Map<string, string>();
  down = false;
  async get(key: string) { if (this.down) throw new Error("down"); return this.values.get(key) ?? null; }
  async set(key: string, value: string) { if (this.down) throw new Error("down"); this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
  async ping() { if (this.down) throw new Error("down"); }
}

function selected(backend: Backend) { return createCache({ backend, namespace: "celebix:staging", defaultTtlSeconds: 30, negativeTtlSeconds: 5, maxPayloadBytes: 262_144, random: () => 0.5, randomToken: () => "promotion-namespace" }); }

test("compiled promotion keys bind environment tenant namespace currency channel and evaluator schema", async () => {
  const backend = new Backend(), cache = selected(backend); let loads = 0;
  const read = () => readCompiledPromotionModel({ cache, storeId: STORE, currency: "TRY", salesChannel: "storefront", ttlSeconds: 30, load: async () => { loads += 1; return parseCompiledPromotionReadModel(model()); } });
  assert.deepEqual(await read(), await read());
  assert.equal(loads, 1);
  const keys = [...backend.values.keys()];
  assert.equal(keys.some((key) => /^celebix:staging:store:11111111-1111-4111-8111-111111111111:promotions:evaluator-v1:promotion-namespace:compiled-active:[a-f0-9]{64}$/.test(key)), true);
  assert.equal(keys.some((key) => key.includes("TRY") || key.includes("storefront")), false);
});

test("a Redis outage falls through to the PostgreSQL loader and namespace rotation is best effort", async () => {
  const backend = new Backend(), cache = selected(backend); backend.down = true; let loads = 0;
  const result = await readCompiledPromotionModel({ cache, storeId: STORE, currency: "TRY", salesChannel: "storefront", ttlSeconds: 30, load: async () => { loads += 1; return parseCompiledPromotionReadModel(model()); } });
  assert.equal(result.definitions.length, 1);
  assert.equal(loads, 1);
  await assert.doesNotReject(cache.rotateNamespace(STORE, "promotions"));
});

test("cached compiled models reject wrong bindings duplicate order and unvalidated rules", async () => {
  const backend = new Backend(), cache = selected(backend);
  await assert.rejects(readCompiledPromotionModel({ cache, storeId: STORE, currency: "TRY", salesChannel: "storefront", ttlSeconds: 30, load: async () => parseCompiledPromotionReadModel({ ...model(), storeId: "33333333-3333-4333-8333-333333333333" }) }));
  assert.throws(() => parseCompiledPromotionReadModel({ ...model(), definitions: [{ ...model().definitions[0], ruleDocument: { ...ruleDocument, schemaVersion: 2 } }] }));
  assert.throws(() => parseCompiledPromotionReadModel({ ...model(), definitions: [{ ...model().definitions[0], id: PROMOTION }, { ...model().definitions[0], id: PROMOTION }] }));
});
