import assert from "node:assert/strict";
import test from "node:test";

import type { Product, ProductVariant } from "@celebix/saas-contracts";

import { loadCatalogVariantChoices } from "./variant-choices.ts";

const NOW = "2026-07-23T10:00:00.000Z";
const id = (value: number) => `${String(value).padStart(8, "0")}-1111-4111-8111-${String(value).padStart(12, "0")}`;
const product = (value: number): Product => Object.freeze({
  id: id(value), storeId: id(999), slug: `urun-${value}`, title: `Ürün ${value}`,
  status: "active", currency: "TRY", version: 1, createdAt: NOW, updatedAt: NOW,
});
const variant = (value: number, status: ProductVariant["status"] = "active"): ProductVariant => Object.freeze({
  id: id(value + 100), productId: id(value), storeId: id(999), title: `Varyant ${value}`,
  priceCents: 1000 + value, stockTracking: true, stockQuantity: 2, status, attributes: Object.freeze({}),
  version: 1, createdAt: NOW, updatedAt: NOW,
});

test("catalog variant choices follow every cursor and include active variants beyond product 20", async () => {
  const products = Array.from({ length: 21 }, (_, index) => product(index + 1));
  const cursors: Array<string | undefined> = [];
  let activeDetails = 0;
  let maximumDetails = 0;
  const choices = await loadCatalogVariantChoices({
    async listProducts(input) {
      cursors.push(input.cursor);
      return input.cursor === undefined
        ? { items: products.slice(0, 20), catalogTotal: 21, nextCursor: "page_two" }
        : { items: products.slice(20), catalogTotal: 21 };
    },
    async getProduct(productId) {
      activeDetails += 1;
      maximumDetails = Math.max(maximumDetails, activeDetails);
      await new Promise((resolve) => setImmediate(resolve));
      activeDetails -= 1;
      const number = Number(productId.slice(0, 8));
      return {
        product: product(number),
        variants: [variant(number), Object.freeze({ ...variant(number + 500, "archived"), productId: id(number) })],
      };
    },
  }, new AbortController().signal, { maximumDetailConcurrency: 4 });
  assert.deepEqual(cursors, [undefined, "page_two"]);
  assert.equal(choices.products.length, 21);
  assert.equal(choices.variants.length, 21);
  assert.equal(choices.variants.at(-1)?.productTitle, "Ürün 21");
  assert.equal(choices.variants.at(-1)?.variantId, id(121));
  assert.ok(maximumDetails > 1 && maximumDetails <= 4);
});

test("catalog variant choices use the bounded server projection for stores larger than 500 products", async () => {
  const items = Array.from({ length: 1_600 }, (_, index) => Object.freeze({
    productId: id(index + 1),
    productTitle: `Ürün ${index + 1}`,
    variantId: id(index + 2_000),
    variantTitle: "Varsayılan",
    sku: `SKU-${index + 1}`,
  }));
  let directCalls = 0;
  const choices = await loadCatalogVariantChoices({
    async listVariantChoices() {
      directCalls += 1;
      return items;
    },
    async listProducts() { throw new Error("product crawl must not run"); },
    async getProduct() { throw new Error("detail crawl must not run"); },
  }, new AbortController().signal);
  assert.equal(directCalls, 1);
  assert.equal(choices.products.length, 1_600);
  assert.equal(choices.variants.length, 1_600);
  assert.equal(choices.variants.at(-1)?.sku, "SKU-1600");
});

test("catalog variant choices reject cursor loops bounds duplicates and hostile partial projections", async () => {
  const signal = new AbortController().signal;
  const valid = {
    async listProducts() { return { items: [product(1)], catalogTotal: 1 }; },
    async getProduct() { return { product: product(1), variants: [variant(1)] }; },
  };
  let loopCalls = 0;
  const cases: Array<readonly [unknown, unknown?]> = [
    [{
      ...valid,
      async listProducts() {
        loopCalls += 1;
        return { items: [product(loopCalls)], catalogTotal: 2, nextCursor: "same" };
      },
    }],
    [{ ...valid, async listProducts() { return { items: [product(1), product(2)], catalogTotal: 2 }; } }, { maximumProducts: 1 }],
    [{ ...valid, async listProducts() { return { items: [product(1), product(1)], catalogTotal: 2 }; } }],
    [{ ...valid, async getProduct() { return { product: product(2), variants: [variant(2)] }; } }],
    [{ ...valid, async getProduct() { return { product: product(1), variants: [variant(1), variant(1)] }; } }],
    [{ ...valid, async getProduct() { return new Proxy({}, { get() { throw new Error("hostile"); } }); } }],
  ];
  for (const [api, limits] of cases) {
    await assert.rejects(
      () => loadCatalogVariantChoices(api as never, signal, limits as never),
      /catalog_variant_choices_unavailable/,
    );
  }
});

test("catalog variant choices bound every returned detail variant before active filtering", async () => {
  await assert.rejects(
    () => loadCatalogVariantChoices({
      async listProducts() { return { items: [product(1), product(2)], catalogTotal: 2 }; },
      async getProduct(productId) {
        const number = Number(productId.slice(0, 8));
        return {
          product: product(number),
          variants: [
            Object.freeze({ ...variant(number, "archived"), productId: id(number) }),
            Object.freeze({ ...variant(number + 500, "archived"), productId: id(number) }),
          ],
        };
      },
    }, new AbortController().signal, { maximumVariants: 3 }),
    /catalog_variant_choices_unavailable/,
  );
});

test("catalog variant choices propagate owned abort to the underlying request and publish nothing", async () => {
  const controller = new AbortController();
  let observed: AbortSignal | undefined;
  const pending = loadCatalogVariantChoices({
    listProducts(_input, signal) {
      observed = signal;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => {
        reject(new DOMException("owned", "AbortError"));
      }, { once: true }));
    },
    async getProduct() { throw new Error("unexpected"); },
  }, controller.signal);
  controller.abort();
  await assert.rejects(
    () => pending,
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  assert.equal(observed, controller.signal);
});
