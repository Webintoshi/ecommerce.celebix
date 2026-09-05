import assert from "node:assert/strict";
import test from "node:test";

import { readCartMutationRequest, readCheckoutRequest } from "./request.ts";

const ORIGIN = "https://shop.example.test";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const PAYMENT_METHOD = "40000000-0000-4000-8000-000000000001";

function request(path: string, body: unknown, headers: HeadersInit = {}, method = "POST") {
  return new Request(`http://storefront.internal:3450${path}`, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
}

test("cart mutation parser accepts only the exact action-owned command", async () => {
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 2 }), ORIGIN), { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 2 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/quantity", { operationId: OPERATION, variantId: VARIANT, quantity: 3, expectedVersion: 7 }), ORIGIN), { kind: "set_quantity", operationId: OPERATION, variantId: VARIANT, quantity: 3, expectedVersion: 7 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/remove", { operationId: OPERATION, variantId: VARIANT, expectedVersion: 8 }), ORIGIN), { kind: "remove", operationId: OPERATION, variantId: VARIANT, expectedVersion: 8 });
  assert.deepEqual(await readCartMutationRequest(request("/api/cart/buy-now", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }), ORIGIN), { kind: "buy_now", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
});

test("commerce requests preserve only the edge-verified storefront proxy authority header", async () => {
  const proxy = { "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x41).toString("base64url")}` };
  assert.deepEqual(
    await readCartMutationRequest(request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }, proxy), ORIGIN),
    { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 },
  );
  assert.deepEqual(
    await readCheckoutRequest(request("/api/checkout/quote", { intentKind: "cart" }, proxy), ORIGIN),
    { kind: "quote", intentKind: "cart" },
  );
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

test("checkout parser preserves an explicitly present canonical promotion code set", async () => {
  const quote = await readCheckoutRequest(request("/api/checkout/quote", {
    intentKind: "cart",
    normalizedCodes: ["VIP", "YUZDE10"],
  }), ORIGIN);
  const complete = await readCheckoutRequest(request("/api/checkout/complete", {
    ...COMPLETE,
    normalizedCodes: [],
  }), ORIGIN);

  assert.deepEqual(quote, {
    kind: "quote",
    intentKind: "cart",
    normalizedCodes: ["VIP", "YUZDE10"],
  });
  assert.deepEqual(complete, {
    kind: "complete",
    ...COMPLETE,
    normalizedCodes: [],
  });
  assert.equal(Object.isFrozen(quote.normalizedCodes), true);
  assert.equal(Object.isFrozen(complete.normalizedCodes), true);
});

test("checkout parser rejects malformed duplicate and non-canonical promotion codes", async () => {
  for (const normalizedCodes of [
    ["VIP", "VIP"],
    ["vip"],
    ["ŞİFRE"],
    ["BAD CODE"],
    ["BIR", "IKI", "UC", "DORT", "BES", "ALTI"],
    null,
    "VIP",
  ]) {
    await assert.rejects(
      readCheckoutRequest(request("/api/checkout/quote", {
        intentKind: "cart",
        normalizedCodes,
      }), ORIGIN),
      /storefront_checkout_request_invalid/u,
    );
    await assert.rejects(
      readCheckoutRequest(request("/api/checkout/complete", {
        ...COMPLETE,
        normalizedCodes,
      }), ORIGIN),
      /storefront_checkout_request_invalid/u,
    );
  }
});

test("checkout quote rejects browser totals store and evaluator authority", async () => {
  for (const injected of [
    { intentKind: "cart", totalCents: 1 },
    { intentKind: "cart", storeId: PRODUCT },
    { intentKind: "cart", authorityDigest: "a".repeat(64) },
  ]) await assert.rejects(
    readCheckoutRequest(request("/api/checkout/quote", injected), ORIGIN),
    /storefront_checkout_request_invalid/u,
  );
  await assert.rejects(
    readCheckoutRequest(request("/api/checkout/complete", {
      ...COMPLETE,
      authorityDigest: "a".repeat(64),
    }), ORIGIN),
    /storefront_checkout_request_invalid/u,
  );
});

const HOSTED_START = Object.freeze({
  operationId: OPERATION,
  cartVersion: 4,
  intentKind: "cart",
  contact: COMPLETE.contact,
  shippingAddress: COMPLETE.shippingAddress,
  shippingMethod: "standard",
  paymentMethodId: PAYMENT_METHOD,
  identityNumber: "10000000146",
  note: "Kapıya bırakmayın",
});

test("hosted start accepts only the exact server-priced checkout command", async () => {
  assert.deepEqual(
    await readCheckoutRequest(request("/api/checkout/payment/start", HOSTED_START), ORIGIN),
    { kind: "hosted_start", ...HOSTED_START },
  );
  assert.deepEqual(
    await readCheckoutRequest(request("/api/checkout/payment/start", { ...HOSTED_START, identityNumber: undefined, note: undefined }), ORIGIN),
    { kind: "hosted_start", ...Object.fromEntries(Object.entries(HOSTED_START).filter(([key]) => key !== "identityNumber" && key !== "note")) },
  );
  for (const injected of [
    { ...HOSTED_START, amountMinor: 1 },
    { ...HOSTED_START, providerCode: "paytr_iframe" },
    { ...HOSTED_START, storeId: PRODUCT },
    { ...HOSTED_START, paymentMethodId: "not-a-uuid" },
    { ...HOSTED_START, shippingMethod: "express" },
  ]) await assert.rejects(readCheckoutRequest(request("/api/checkout/payment/start", injected), ORIGIN), /storefront_checkout_request_invalid/u);
});

test("hosted start preserves only an explicitly present canonical promotion code set", async () => {
  const absent = await readCheckoutRequest(
    request("/api/checkout/payment/start", HOSTED_START),
    ORIGIN,
  );
  const empty = await readCheckoutRequest(
    request("/api/checkout/payment/start", { ...HOSTED_START, normalizedCodes: [] }),
    ORIGIN,
  );
  const selected = await readCheckoutRequest(
    request("/api/checkout/payment/start", {
      ...HOSTED_START,
      normalizedCodes: ["VIP", "YUZDE10"],
    }),
    ORIGIN,
  );

  assert.equal(Object.hasOwn(absent, "normalizedCodes"), false);
  assert.deepEqual(empty, { kind: "hosted_start", ...HOSTED_START, normalizedCodes: [] });
  assert.deepEqual(selected, {
    kind: "hosted_start",
    ...HOSTED_START,
    normalizedCodes: ["VIP", "YUZDE10"],
  });
  assert.equal(Object.isFrozen(empty.normalizedCodes), true);
  assert.equal(Object.isFrozen(selected.normalizedCodes), true);

  for (const normalizedCodes of [
    ["VIP", "VIP"],
    ["vip"],
    ["BAD CODE"],
    ["BIR", "IKI", "UC", "DORT", "BES", "ALTI"],
    null,
    "VIP",
  ]) {
    await assert.rejects(
      readCheckoutRequest(
        request("/api/checkout/payment/start", { ...HOSTED_START, normalizedCodes }),
        ORIGIN,
      ),
      /storefront_checkout_request_invalid/u,
    );
  }
});

test("hosted identity authority rejects fake repeated controlled and non-eleven-digit values", async () => {
  for (const identityNumber of [
    "12345678901", "11111111111", "00000000000", "1000000014", "100000001460", "1000000014\n",
  ]) await assert.rejects(
    readCheckoutRequest(request("/api/checkout/payment/start", { ...HOSTED_START, identityNumber }), ORIGIN),
    /storefront_checkout_request_invalid/u,
  );
});

test("hosted start retains exact origin content-type and body limits", async () => {
  for (const candidate of [
    request("/api/checkout/payment/start?tenant=evil", HOSTED_START),
    request("/api/checkout/payment/start", HOSTED_START, { origin: "https://evil.example" }),
    request("/api/checkout/payment/start", HOSTED_START, { "content-type": "application/json; charset=utf-8" }),
    request("/api/checkout/payment/start", HOSTED_START, { "content-length": "32769" }),
  ]) await assert.rejects(readCheckoutRequest(candidate, ORIGIN), /storefront_checkout_request_invalid/u);
});
