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
