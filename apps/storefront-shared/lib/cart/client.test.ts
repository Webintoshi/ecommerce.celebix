import assert from "node:assert/strict";
import test from "node:test";

import { createStorefrontCartClient, StorefrontCartClientError } from "./client.ts";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";

test("cart client sends exact same-origin commands and never serializes price or credential", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const cart = { version: 1, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: false, checkoutBlocker: "empty_cart", items: [] };
  const client = createStorefrontCartClient(async (input, init) => { calls.push({ input: String(input), init }); return new Response(JSON.stringify({ cart }), { status: 200, headers: { "content-type": "application/json" } }); }, () => OPERATION);
  await client.add({ productId: PRODUCT, variantId: VARIANT, quantity: 2 });
  assert.equal(calls[0]?.input, "/api/cart/add");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 2 });
  assert.doesNotMatch(String(calls[0]?.init?.body), /price|credential|storeId|tenantId/u);
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(calls[0]?.init?.cache, "no-store");
});

test("buy now uses a distinct endpoint and accepts only a fixed checkout destination", async () => {
  const calls: string[] = [];
  const client = createStorefrontCartClient(async (input) => { calls.push(String(input)); return new Response(JSON.stringify({ destination: "/checkout?intent=buy-now" }), { status: 200, headers: { "content-type": "application/json" } }); }, () => OPERATION);
  assert.deepEqual(await client.buyNow({ productId: PRODUCT, variantId: VARIANT, quantity: 1 }), { destination: "/checkout?intent=buy-now" });
  assert.deepEqual(calls, ["/api/cart/buy-now"]);
});

test("public cart errors preserve only finite checkout blocker codes", async () => {
  const payment = createStorefrontCartClient(async () => new Response(JSON.stringify({ code: "payment_unavailable" }), { status: 409, headers: { "content-type": "application/json" } }), () => OPERATION);
  await assert.rejects(payment.quote("cart"), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "payment_unavailable");

  for (const body of [
    { code: "database_socket_failed" },
    { code: "payment_unavailable", detail: "private" },
    { message: "payment_unavailable" },
  ]) {
    const client = createStorefrontCartClient(async () => new Response(JSON.stringify(body), { status: 409, headers: { "content-type": "application/json" } }), () => OPERATION);
    await assert.rejects(client.quote("cart"), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "request_failed");
  }
});

test("cart client validates checkout blocker consistency", async () => {
  const inconsistent = { version: 1, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: true, checkoutBlocker: "empty_cart", items: [] };
  const client = createStorefrontCartClient(async () => new Response(JSON.stringify({ cart: inconsistent }), { status: 200, headers: { "content-type": "application/json" } }), () => OPERATION);
  await assert.rejects(client.resolve(), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "invalid_response");
  const unavailable = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: [{ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: false }] };
  const second = createStorefrontCartClient(async () => new Response(JSON.stringify({ cart: unavailable }), { status: 200, headers: { "content-type": "application/json" } }), () => OPERATION);
  await assert.rejects(second.resolve(), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "invalid_response");
});
