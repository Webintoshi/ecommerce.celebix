import assert from "node:assert/strict";
import test from "node:test";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { createCartActionRoute, createCartGetRoute, createCheckoutCompleteRoute } from "./route.ts";

const HOST = "shop.example.test";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const CART = Object.freeze({ version: 1, currency: "TRY" as const, itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "urun-bir", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true })]) });
const RECEIPT = Object.freeze({ orderReference: "SF-40000000000040008000000000000001", currency: "TRY" as const, subtotalCents: 100, shippingCents: 0, totalCents: 100, paymentStatus: "pending" as const, paymentMethod: Object.freeze({ kind: "cash_on_delivery" as const, label: "Kapıda ödeme", instructions: "Teslimatta ödeyin." }), delivery: Object.freeze({ recipientName: "Güzide Elif", addressLine1: "Cadde 1", city: "İstanbul", country: "TR" as const }), items: CART.items, createdAt: "2026-07-31T12:00:00.000Z" });
const trusted = (): TrustedStorefrontHostAuthority => ({ kind: "trusted", hostname: HOST });
const baseRuntime = {
  resolveCart: async () => ({ cart: CART }),
  mutateCart: async () => ({ cart: CART }),
  quote: async () => ({ cart: CART, paymentMethods: [] }),
  complete: async () => { throw new Error("unused"); },
};

test("cart GET returns only canonical cart under trusted proxy authority", async () => {
  const response = await createCartGetRoute({ selectAuthority: trusted, resolveRuntime: async () => baseRuntime })(new Request("http://internal:3400/api/cart"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cart: CART });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cart GET forwards only the exact local credential deletion cookie", async () => {
  const response = await createCartGetRoute({ selectAuthority: trusted, resolveRuntime: async () => ({ ...baseRuntime, resolveCart: async () => ({ cart: CART, setCookie: "__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" }) }) })(new Request("http://internal:3400/api/cart"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), "__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
});

test("cart mutation requires exact same-origin authority and sets credential only after success", async () => {
  const handler = createCartActionRoute({ selectAuthority: trusted, resolveRuntime: async () => ({ ...baseRuntime, mutateCart: async () => ({ cart: CART, setCookie: "__Host-celebix_cart=safe; Path=/; Secure; HttpOnly; SameSite=Lax" }) }) });
  const request = new Request("http://internal:3400/api/cart/add", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify({ operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }) });
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cart: CART });
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_cart=/u);
  const denied = await handler(new Request("http://internal:3400/api/cart/add", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }) }));
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.has("set-cookie"), false);
});

test("checkout failure has neither Location nor Set-Cookie and success redirects only to fixed route", async () => {
  const body = { operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "guzide@example.test", phone: "+905551112233" }, shippingAddress: { addressLine1: "Cadde 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }, shippingMethod: "standard", paymentKind: "bank_transfer" };
  const failed = createCheckoutCompleteRoute({ selectAuthority: trusted, resolveRuntime: async () => ({ ...baseRuntime, complete: async () => { throw new Error("database"); } }) });
  const failure = await failed(new Request("http://internal:3400/api/checkout/complete", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.has("location"), false);
  assert.equal(failure.headers.has("set-cookie"), false);
  const success = createCheckoutCompleteRoute({ selectAuthority: trusted, resolveRuntime: async () => ({ ...baseRuntime, complete: async () => ({ receipt: RECEIPT, setCookies: ["__Host-celebix_customer=safe; Path=/; Secure; HttpOnly; SameSite=Lax", "__Host-celebix_receipt=safe; Path=/; Secure; HttpOnly; SameSite=Lax"] }) }) });
  const completed = await success(new Request("http://internal:3400/api/checkout/complete", { method: "POST", headers: { origin: `https://${HOST}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal(completed.status, 303);
  assert.equal(completed.headers.get("location"), "/checkout/success");
  assert.match(completed.headers.get("set-cookie") ?? "", /__Host-celebix_receipt/u);
});
