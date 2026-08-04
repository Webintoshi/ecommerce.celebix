import assert from "node:assert/strict";
import test from "node:test";

import type { PublicCart, PublicCartLine } from "@celebix/saas-contracts";
import { mutateSideCartLine } from "./side-cart-mutation.ts";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const line = Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "ornek-urun", title: "Örnek ürün", variantTitle: "Standart", quantity: 2, unitPriceCents: 100, lineTotalCents: 200, available: true }) satisfies PublicCartLine;
const nextCart = Object.freeze({ version: 5, currency: "TRY", itemCount: 3, subtotalCents: 300, shippingCents: 0, totalCents: 300, checkoutReady: true, checkoutBlocker: null, items: Object.freeze([Object.freeze({ ...line, quantity: 3, lineTotalCents: 300 })]) }) satisfies PublicCart;

test("side-cart increment sends one quantity mutation and installs the canonical cart", async () => {
  const calls: unknown[] = [];
  const status = await mutateSideCartLine({
    line,
    cartVersion: 4,
    quantity: 3,
    client: {
      async setQuantity(input) { calls.push(input); return nextCart; },
      async remove() { throw new Error("unexpected"); },
    },
    replaceCart(value) { calls.push(value); },
    async refresh() { throw new Error("unexpected"); },
  });
  assert.deepEqual(calls, [{ variantId: VARIANT, quantity: 3, expectedVersion: 4 }, nextCart]);
  assert.equal(status, "Örnek ürün adedi güncellendi.");
});

test("side-cart removal sends one remove mutation and installs the canonical cart", async () => {
  const calls: unknown[] = [];
  const emptyCart = Object.freeze({ ...nextCart, version: 6, itemCount: 0, subtotalCents: 0, totalCents: 0, checkoutReady: false, checkoutBlocker: "empty_cart" as const, items: Object.freeze([]) }) satisfies PublicCart;
  const status = await mutateSideCartLine({
    line,
    cartVersion: 5,
    quantity: null,
    client: {
      async setQuantity() { throw new Error("unexpected"); },
      async remove(input) { calls.push(input); return emptyCart; },
    },
    replaceCart(value) { calls.push(value); },
    async refresh() { throw new Error("unexpected"); },
  });
  assert.deepEqual(calls, [{ variantId: VARIANT, expectedVersion: 5 }, emptyCart]);
  assert.equal(status, "Örnek ürün sepetten çıkarıldı.");
});

test("side-cart mutation failure performs one read-only recovery and never retries the write", async () => {
  let writes = 0;
  let refreshes = 0;
  const recovered = await mutateSideCartLine({
    line,
    cartVersion: 4,
    quantity: 3,
    client: {
      async setQuantity() { writes += 1; throw new Error("write failed"); },
      async remove() { throw new Error("unexpected"); },
    },
    replaceCart() { throw new Error("unexpected"); },
    async refresh() { refreshes += 1; return true; },
  });
  assert.equal(recovered, "Sepet güncellenemedi. Güncel sepet yeniden yüklendi.");
  assert.deepEqual({ writes, refreshes }, { writes: 1, refreshes: 1 });

  const unknown = await mutateSideCartLine({
    line,
    cartVersion: 4,
    quantity: null,
    client: {
      async setQuantity() { throw new Error("unexpected"); },
      async remove() { throw new Error("write failed"); },
    },
    replaceCart() { throw new Error("unexpected"); },
    async refresh() { return false; },
  });
  assert.equal(unknown, "Sepet güncellenemedi. Güncel durum doğrulanamadı.");
});
