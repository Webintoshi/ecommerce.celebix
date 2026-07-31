import assert from "node:assert/strict";
import test from "node:test";

import { readCartMutationRequest, readCheckoutRequest } from "./request.ts";

const ORIGIN = "https://shop.example.test";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown, headers: HeadersInit = {}, method = "POST") {
  return new Request(`http://storefront.internal:3450${path}`, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
}

test("cart mutation parser accepts only the exact action-owned command", async () => {
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 2 }), ORIGIN), { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 2 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/quantity", { operationId: OPERATION, variantId: VARIANT, quantity: 3, expectedVersion: 7 }), ORIGIN), { kind: "set_quantity", operationId: OPERATION, variantId: VARIANT, quantity: 3, expectedVersion: 7 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/remove", { operationId: OPERATION, variantId: VARIANT, expectedVersion: 8 }), ORIGIN), { kind: "remove", operationId: OPERATION, variantId: VARIANT, expectedVersion: 8 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/buy-now", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }), ORIGIN), { kind: "buy_now", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
});

test("cart authority rejects wrong paths origins private headers and browser totals", async () => {
  for (const candidate of [
    request("/api/cart/add?store=evil", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }),
    request("/api/cart/add/child", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }),
    request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1, priceCents: 1 }),
    request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }, { origin: "https://evil.example", "x-forwarded-host": "shop.example.test" }),
    request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }, { authorization: "Bearer browser" }),
    request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }, { "x-celebix-store-id": PRODUCT }),
  ]) await assert.rejects(readCartMutationRequest(candidate, ORIGIN), /storefront_cart_request_invalid/u);
});

const COMPLETE = Object.freeze({
  operationId: OPERATION,
  cartVersion: 4,
  intentKind: "cart",
  contact: { name: "Güzide Elif", email: "guzide@example.test", phone: "+905551112233" },
  shippingAddress: { addressLine1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710" },
  shippingMethod: "standard",
  paymentKind: "bank_transfer",
  note: "Kapıya bırakmayın",
});

test("checkout parser accepts quote and bounded complete payload without browser commerce authority", async () => {
  assert.deepEqual(await readCheckoutRequest(request("/api/checkout/quote", { intentKind: "cart" }), ORIGIN), { kind: "quote", intentKind: "cart" });
  assert.deepEqual(await readCheckoutRequest(request("/api/checkout/complete", COMPLETE), ORIGIN), { kind: "complete", ...COMPLETE });
  for (const injected of [
    { ...COMPLETE, totalCents: 1 },
    { ...COMPLETE, storeId: PRODUCT },
    { ...COMPLETE, paymentId: VARIANT },
    { ...COMPLETE, shippingMethod: "express" },
    { ...COMPLETE, paymentKind: "credit_card" },
  ]) await assert.rejects(readCheckoutRequest(request("/api/checkout/complete", injected), ORIGIN), /storefront_checkout_request_invalid/u);
});
