import assert from "node:assert/strict";
import test from "node:test";

import type { InventoryLocation, Product, ProductVariant } from "@celebix/saas-contracts";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-07-23T10:00:00.000Z";
const id = (value: number) => `${String(value).padStart(8, "0")}-1111-4111-8111-${String(value).padStart(12, "0")}`;
const product = (value: number): Product => Object.freeze({
  id: id(value), storeId: id(999), slug: `urun-${value}`, title: `Ürün ${value}`,
  status: "active", currency: "TRY", version: 1, createdAt: NOW, updatedAt: NOW,
});
const variant = (value: number, status: ProductVariant["status"] = "active"): ProductVariant => Object.freeze({
  id: id(value + 100), productId: id(value), storeId: id(999), title: `Varyant ${value}`,
  priceCents: 1000, stockTracking: true, stockQuantity: 2, status, attributes: Object.freeze({}),
  version: 1, createdAt: NOW, updatedAt: NOW,
});
const location = (overrides: Partial<InventoryLocation> = {}): InventoryLocation => Object.freeze({
  id: LOCATION, name: "Ana depo", isDefault: true, status: "active", version: 1,
  archiveEligibility: Object.freeze({ canArchive: false, reason: "default" }),
  createdAt: NOW, updatedAt: NOW, ...overrides,
});

async function choicesModule() {
  return import("./inventory-ui/form-choices.ts").catch(() => ({} as Record<string, unknown>));
}

test("choice loader follows catalog cursors and includes active variants from product 21", async () => {
  const module = await choicesModule();
  assert.equal(typeof module.loadInventoryFormChoices, "function");
  const cursors: Array<string | undefined> = [];
  const products = Array.from({ length: 21 }, (_, index) => product(index + 1));
  const choices = await (module.loadInventoryFormChoices as Function)({
    catalog: {
      async listProducts(input: { cursor?: string }) {
        cursors.push(input.cursor);
        return input.cursor === undefined
          ? { items: products.slice(0, 20), nextCursor: "page_two" }
          : { items: products.slice(20) };
      },
      async getProduct(productId: string) {
        const number = Number(productId.slice(0, 8));
        return {
          product: product(number),
          variants: [variant(number), Object.freeze({ ...variant(number + 500, "archived"), productId: id(number) })],
        };
      },
    },
    inventory: { async listLocations() { return [location()]; } },
  }, new AbortController().signal);
  assert.deepEqual(cursors, [undefined, "page_two"]);
  assert.equal(choices.products.length, 21);
  assert.equal(choices.variants.length, 21);
  assert.equal(choices.variants.at(-1)?.productTitle, "Ürün 21");
  assert.equal(choices.variants.at(-1)?.variantId, id(121));
  assert.deepEqual(choices.locations.map((item: { locationId: string }) => item.locationId), [LOCATION]);
});

test("choice loader rejects duplicate/non-progressing cursors and partial over-bound results", async () => {
  const module = await choicesModule();
  assert.equal(typeof module.loadInventoryFormChoices, "function");
  await assert.rejects(() => (module.loadInventoryFormChoices as Function)({
    catalog: {
      async listProducts() { return { items: [product(1)], nextCursor: "same" }; },
      async getProduct() { return { product: product(1), variants: [variant(1)] }; },
    },
    inventory: { async listLocations() { return [location()]; } },
  }, new AbortController().signal, { maximumPages: 1 }), /inventory_choices_unavailable/);

  let calls = 0;
  await assert.rejects(() => (module.loadInventoryFormChoices as Function)({
    catalog: {
      async listProducts() { calls += 1; return { items: [product(calls)], nextCursor: "same" }; },
      async getProduct() { return { product: product(1), variants: [variant(1)] }; },
    },
    inventory: { async listLocations() { return [location()]; } },
  }, new AbortController().signal), /inventory_choices_unavailable/);
});

test("choice lifecycle aborts old generations and suppresses stale results", async () => {
  const module = await choicesModule();
  assert.equal(typeof module.createInventoryFormChoiceLifecycle, "function");
  const pending: Array<{ signal: AbortSignal; resolve(value: unknown): void }> = [];
  const states: unknown[] = [];
  const lifecycle = (module.createInventoryFormChoiceLifecycle as Function)(
    (signal: AbortSignal) => new Promise((resolve) => pending.push({ signal, resolve })),
    (snapshot: unknown) => states.push(snapshot),
  );
  const firstCleanup = lifecycle.setup();
  const secondCleanup = lifecycle.setup();
  assert.equal(pending[0]?.signal.aborted, true);
  pending[0]?.resolve({ products: [], variants: [], locations: [] });
  pending[1]?.resolve({ products: [product(21)], variants: [], locations: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((states.at(-1) as { phase: string }).phase, "loaded");
  assert.equal((states.at(-1) as { choices: { products: unknown[] } }).choices.products.length, 1);
  firstCleanup();
  secondCleanup();
  assert.equal(pending[1]?.signal.aborted, true);
});

test("choice loader exposes only server-returned active locations", async () => {
  const module = await choicesModule();
  assert.equal(typeof module.loadInventoryFormChoices, "function");
  const choices = await (module.loadInventoryFormChoices as Function)({
    catalog: {
      async listProducts() { return { items: [] }; },
      async getProduct() { throw new Error("unexpected"); },
    },
    inventory: {
      async listLocations() {
        return [
          location(),
          location({ id: id(55), name: "Arşiv", isDefault: false, status: "archived", archiveEligibility: { canArchive: false, reason: "archived" } }),
        ];
      },
    },
  }, new AbortController().signal);
  assert.deepEqual(choices.locations.map((item: { locationId: string }) => item.locationId), [LOCATION]);
});

test("choice loader propagates one lifecycle signal through catalog pages details and inventory locations", async () => {
  const module = await choicesModule();
  const controller = new AbortController();
  const observed: AbortSignal[] = [];
  await (module.loadInventoryFormChoices as Function)({
    catalog: {
      async listProducts(_input: unknown, signal: AbortSignal) { observed.push(signal); return { items: [product(1)] }; },
      async getProduct(_id: string, signal: AbortSignal) { observed.push(signal); return { product: product(1), variants: [variant(1)] }; },
    },
    inventory: { async listLocations(signal: AbortSignal) { observed.push(signal); return [location()]; } },
  }, controller.signal);
  assert.deepEqual(observed, [controller.signal, controller.signal, controller.signal]);
});

test("choice lifecycle abort reaches an underlying catalog request and remains a silent stale generation", async () => {
  const module = await choicesModule();
  let underlyingSignal: AbortSignal | undefined;
  let aborted = false;
  const states: Array<{ phase: string }> = [];
  const lifecycle = (module.createInventoryFormChoiceLifecycle as Function)(
    (signal: AbortSignal) => (module.loadInventoryFormChoices as Function)({
      catalog: {
        listProducts(_input: unknown, requestSignal: AbortSignal) {
          underlyingSignal = requestSignal;
          return new Promise((_resolve, reject) => requestSignal.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("catalog aborted", "AbortError"));
          }, { once: true }));
        },
        async getProduct() { throw new Error("unexpected"); },
      },
      inventory: { async listLocations() { throw new Error("unexpected"); } },
    }, signal),
    (snapshot: { phase: string }) => states.push(snapshot),
  );
  const cleanup = lifecycle.setup();
  cleanup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(underlyingSignal?.aborted, true);
  assert.equal(aborted, true);
  assert.deepEqual(states.map((state) => state.phase), ["loading"]);
});

test("only an owned lifecycle abort is silent; an unexpected current-generation AbortError is unavailable", async () => {
  const module = await choicesModule();
  const states: Array<{ phase: string }> = [];
  const lifecycle = (module.createInventoryFormChoiceLifecycle as Function)(
    async (signal: AbortSignal) => {
      assert.equal(signal.aborted, false);
      throw new DOMException("unexpected upstream abort", "AbortError");
    },
    (snapshot: { phase: string }) => states.push(snapshot),
  );
  const cleanup = lifecycle.setup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states.map((state) => state.phase), ["loading", "unavailable"]);
  cleanup();
});

test("loader converts an unexpected AbortError to controlled unavailable but preserves its own signal abort", async () => {
  const module = await choicesModule();
  const unexpected = new DOMException("unexpected upstream abort", "AbortError");
  await assert.rejects(() => (module.loadInventoryFormChoices as Function)({
    catalog: { async listProducts() { throw unexpected; }, async getProduct() { throw new Error("unexpected"); } },
    inventory: { async listLocations() { throw new Error("unexpected"); } },
  }, new AbortController().signal), /inventory_choices_unavailable/);

  const owned = new AbortController();
  const pending = (module.loadInventoryFormChoices as Function)({
    catalog: {
      listProducts(_input: unknown, signal: AbortSignal) {
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("owned", "AbortError")), { once: true }));
      },
      async getProduct() { throw new Error("unexpected"); },
    },
    inventory: { async listLocations() { throw new Error("unexpected"); } },
  }, owned.signal);
  owned.abort();
  await assert.rejects(() => pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("choice boundary fails closed on hostile proxies, bounds, duplicates and inconsistent detail authority", async () => {
  const module = await choicesModule();
  const signal = new AbortController().signal;
  const base = () => ({
    catalog: {
      async listProducts() { return { items: [product(1)] }; },
      async getProduct() { return { product: product(1), variants: [variant(1)] }; },
    },
    inventory: { async listLocations() { return [location()]; } },
  });
  const cases: Array<{ dependencies: unknown; limits?: unknown }> = [
    { dependencies: { ...base(), catalog: { ...base().catalog, async listProducts() { return new Proxy({}, { get() { throw new Error("hostile list projection"); } }); } } } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async listProducts() { return { items: [product(1), product(2)] }; } } }, limits: { maximumProducts: 1 } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async listProducts() { return { items: [product(1), product(1)] }; } } } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async getProduct() { return { product: product(2), variants: [variant(2)] }; } } } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async getProduct() { throw new Error("detail unavailable"); } } } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async getProduct() { return { product: product(1), variants: [variant(1), Object.freeze({ ...variant(1), id: id(202) })] }; } } }, limits: { maximumVariants: 1 } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async getProduct() { return { product: product(1), variants: [variant(1), variant(1)] }; } } } },
    { dependencies: { ...base(), catalog: { ...base().catalog, async getProduct() { return { product: product(1), variants: [Object.freeze({ ...variant(2), productId: id(2) })] }; } } } },
    { dependencies: { ...base(), inventory: { async listLocations() { return [location(), location({ id: id(55), isDefault: false })]; } } }, limits: { maximumLocations: 1 } },
    { dependencies: { ...base(), inventory: { async listLocations() { return [location(), location()]; } } } },
  ];
  for (const candidate of cases) {
    await assert.rejects(
      () => (module.loadInventoryFormChoices as Function)(candidate.dependencies, signal, candidate.limits),
      /inventory_choices_unavailable/,
    );
  }
});
