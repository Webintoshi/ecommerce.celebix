import assert from "node:assert/strict";
import test from "node:test";

import type { PublicCart } from "@celebix/saas-contracts";
import { createStorefrontCartClient, StorefrontCartClientError } from "./client.ts";
import * as cartClientModule from "./client.ts";

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const PAYMENT_METHOD = "40000000-0000-4000-8000-000000000001";

test("add-to-cart opens the drawer before the network result and then installs the canonical cart", async () => {
  const candidate = (cartClientModule as unknown as Record<string, unknown>).addCartLineAndOpenDrawer;
  assert.equal(typeof candidate, "function");
  const addCartLineAndOpenDrawer = candidate as <TTrigger>(input: Readonly<{ productId: string; variantId: string; quantity: number }>, trigger: TTrigger, dependencies: Readonly<{ add(value: Readonly<{ productId: string; variantId: string; quantity: number }>): Promise<PublicCart>; openDrawer(value: TTrigger): void; replaceCart(value: PublicCart): void }>) => Promise<PublicCart>;
  const canonicalCart = Object.freeze({ version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true })]) }) satisfies PublicCart;
  const events: string[] = [];
  let resolveAdd: ((cart: PublicCart) => void) | undefined;
  const response = new Promise<PublicCart>((resolve) => { resolveAdd = resolve; });
  const trigger = Object.freeze({ id: "product-card" });

  const pending = addCartLineAndOpenDrawer(
    { productId: PRODUCT, variantId: VARIANT, quantity: 1 },
    trigger,
    {
      add() { events.push("add"); return response; },
      openDrawer(value) { events.push(`open:${value.id}`); },
      replaceCart(value) { events.push(`replace:${value.version}`); },
    },
  );

  assert.deepEqual(events, ["open:product-card", "add"]);
  resolveAdd?.(canonicalCart);
  assert.equal(await pending, canonicalCart);
  assert.deepEqual(events, ["open:product-card", "add", "replace:1"]);
});

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

test("hosted checkout start sends the exact same-origin command and accepts only its fixed handoff", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createStorefrontCartClient(async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ destination: "/checkout/payment" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => OPERATION);
  const result = await client.startHosted({
    cartVersion: 3,
    intentKind: "cart",
    contact: { name: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233" },
    shippingAddress: { addressLine1: "Örnek Sokak 1", city: "İstanbul", district: "Kadıköy" },
    shippingMethod: "standard",
    paymentMethodId: PAYMENT_METHOD,
  });

  assert.deepEqual(result, { destination: "/checkout/payment" });
  assert.equal(calls[0]?.input, "/api/checkout/payment/start");
  assert.equal(calls[0]?.init?.credentials, "same-origin");
  assert.equal(calls[0]?.init?.cache, "no-store");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    operationId: OPERATION,
    cartVersion: 3,
    intentKind: "cart",
    contact: { name: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233" },
    shippingAddress: { addressLine1: "Örnek Sokak 1", city: "İstanbul", district: "Kadıköy" },
    shippingMethod: "standard",
    paymentMethodId: PAYMENT_METHOD,
  });
});

test("hosted checkout start rejects external destinations and non-exact responses", async () => {
  for (const response of [
    new Response(JSON.stringify({ destination: "https://provider.example/pay" }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({ destination: "/checkout/payment", token: "private" }), { status: 200, headers: { "content-type": "application/json" } }),
    new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("/checkout/payment", { status: 200, headers: { "content-type": "text/plain" } }),
  ]) {
    const client = createStorefrontCartClient(async () => response.clone(), () => OPERATION);
    await assert.rejects(client.startHosted({
      cartVersion: 3,
      intentKind: "cart",
      contact: { name: "Ada Lovelace", email: "ada@example.com", phone: "+905551112233" },
      shippingAddress: { addressLine1: "Örnek Sokak 1", city: "İstanbul", district: "Kadıköy" },
      shippingMethod: "standard",
      paymentMethodId: PAYMENT_METHOD,
    }), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "invalid_response");
  }
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

test("cart client deeply validates cart lines and checkout quote payment methods", async () => {
  const unsafeLine = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: [{ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true, tenantId: PRODUCT }] };
  const cartClient = createStorefrontCartClient(async () => new Response(JSON.stringify({ cart: unsafeLine }), { status: 200, headers: { "content-type": "application/json" } }), () => OPERATION);
  await assert.rejects(cartClient.resolve(), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "invalid_response");

  const safeCart = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: [{ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true }] };
  const quoteClient = createStorefrontCartClient(async () => new Response(JSON.stringify({ quote: { cart: safeCart, estimatedDays: 3, paymentMethods: [{ kind: "card", label: "Kart", instructions: "Private" }] } }), { status: 200, headers: { "content-type": "application/json" } }), () => OPERATION);
  await assert.rejects(quoteClient.quote("cart"), (error: unknown) => error instanceof StorefrontCartClientError && error.code === "invalid_response");
});
