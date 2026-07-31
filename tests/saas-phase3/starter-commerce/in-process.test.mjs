import assert from "node:assert/strict";
import test from "node:test";

import { createCartActionRoute, createCartGetRoute, createCheckoutCompleteRoute, createCheckoutQuoteRoute } from "../../../apps/storefront-shared/lib/cart/route.ts";

const HOST = "guzide-cart.example.test";
const ORIGIN = `https://${HOST}`;
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const CART = Object.freeze({ version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "altin-yuzuk", title: "Altın Yüzük", variantTitle: "14 Ayar", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true })]) });
const QUOTE = Object.freeze({ cart: CART, paymentMethods: Object.freeze([Object.freeze({ kind: "bank_transfer", label: "Banka havalesi", instructions: "Sipariş numaranızı yazın.", bankName: "Celebix Bank", accountHolder: "Güzide", iban: "TR330006100519786457841326" })]) });
const RECEIPT = Object.freeze({ orderReference: "CBX-2026-000001", currency: "TRY", subtotalCents: 100, shippingCents: 0, totalCents: 100, paymentStatus: "pending", paymentMethod: QUOTE.paymentMethods[0], items: CART.items, createdAt: "2026-07-31T12:00:00.000Z" });

const selectAuthority = () => Object.freeze({ kind: "trusted", hostname: HOST });
function request(path, body, cookie) {
  return new Request(`http://storefront.internal:3450${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(body === undefined ? {} : { origin: ORIGIN, "content-type": "application/json" }), ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function dependencies(overrides = {}) {
  const calls = [];
  const runtime = Object.freeze({
    async resolveCart(hostname, cookieHeader) { calls.push(["resolve", hostname, cookieHeader]); return CART; },
    async mutateCart(hostname, cookieHeader, command) { calls.push(["mutate", hostname, cookieHeader, command]); return Object.freeze({ cart: CART, setCookie: "__Host-celebix_cart=safe; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax" }); },
    async quote(hostname, cookieHeader, intentKind) { calls.push(["quote", hostname, cookieHeader, intentKind]); return QUOTE; },
    async complete(hostname, cookieHeader, input) { calls.push(["complete", hostname, cookieHeader, input]); return Object.freeze({ receipt: RECEIPT, setCookies: Object.freeze(["__Host-celebix_customer=safe; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax", "__Host-celebix_receipt=safe; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax"]) }); },
    ...overrides,
  });
  return Object.freeze({ calls, route: Object.freeze({ selectAuthority, resolveRuntime: async () => runtime }) });
}

test("real cart route composition preserves trusted host and opaque HttpOnly cart authority", async () => {
  const fixture = dependencies();
  const get = await createCartGetRoute(fixture.route)(request("/api/cart", undefined, "__Host-celebix_cart=opaque"));
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { cart: CART });
  const add = await createCartActionRoute(fixture.route)(request("/api/cart/add", { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }));
  assert.equal(add.status, 200);
  assert.match(add.headers.get("set-cookie") ?? "", /^__Host-celebix_cart=[^;]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/u);
  assert.equal(fixture.calls.at(-1)?.[1], HOST);
  assert.doesNotMatch(JSON.stringify(await add.json()), /storeId|tenantId|credential|operationId/u);
});

test("checkout quote and completion use only fixed same-origin routes and safe 303", async () => {
  const fixture = dependencies();
  const quoted = await createCheckoutQuoteRoute(fixture.route)(request("/api/checkout/quote", { intentKind: "cart" }, "__Host-celebix_cart=opaque"));
  assert.equal(quoted.status, 200);
  assert.deepEqual(await quoted.json(), { quote: QUOTE });
  const completed = await createCheckoutCompleteRoute(fixture.route)(request("/api/checkout/complete", { operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }, shippingMethod: "standard", paymentKind: "bank_transfer" }, "__Host-celebix_cart=opaque"));
  assert.equal(completed.status, 303);
  assert.equal(completed.headers.get("location"), "/checkout/success");
  const cookies = completed.headers.get("set-cookie") ?? "";
  assert.match(cookies, /__Host-celebix_customer=/u);
  assert.match(cookies, /__Host-celebix_receipt=/u);
  assert.doesNotMatch(cookies, /SameSite=None|Domain=/u);
});

test("invalid browser commerce authority fails before runtime and emits neither cookie nor redirect", async () => {
  let calls = 0;
  const route = createCheckoutCompleteRoute({ selectAuthority, resolveRuntime: async () => { calls += 1; return null; } });
  const response = await route(request("/api/checkout/complete", { operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Adres 10", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }, shippingMethod: "standard", paymentKind: "bank_transfer", priceCents: 1 }));
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("near-match cart and checkout paths remain denied without repository access", async () => {
  const fixture = dependencies();
  for (const candidate of ["/api/cart/add/", "/api/cart/add?x=1", "/api/checkout/quote/", "/api/checkout/complete?x=1"]) {
    const handler = candidate.startsWith("/api/cart") ? createCartActionRoute(fixture.route) : candidate.includes("quote") ? createCheckoutQuoteRoute(fixture.route) : createCheckoutCompleteRoute(fixture.route);
    const response = await handler(request(candidate, candidate.includes("quote") ? { intentKind: "cart" } : candidate.includes("complete") ? { operationId: OPERATION } : { operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }));
    assert.equal(response.status, 400, candidate);
  }
  assert.equal(fixture.calls.length, 0);
});
