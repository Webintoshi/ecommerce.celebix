import assert from "node:assert/strict";
import test from "node:test";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import { StandardHostedCheckoutRuntimeError } from "../checkout/standard-hosted-payment.ts";
import {
  createCartActionRoute,
  createCartGetRoute,
  createCartRecoveryRoute,
  createCheckoutCompleteRoute,
  createHostedCheckoutStartRoute,
} from "./route.ts";

const HOST = "shop.example.test";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const CART = Object.freeze({
  version: 1,
  currency: "TRY" as const,
  itemCount: 1,
  subtotalCents: 100,
  shippingCents: 0,
  totalCents: 100,
  checkoutReady: true,
  checkoutBlocker: null,
  items: Object.freeze([
    Object.freeze({
      productId: PRODUCT,
      variantId: VARIANT,
      slug: "urun-bir",
      title: "Ürün",
      variantTitle: "Standart",
      quantity: 1,
      unitPriceCents: 100,
      lineTotalCents: 100,
      available: true,
    }),
  ]),
});
const RECEIPT = Object.freeze({
  orderReference: "SF-40000000000040008000000000000001",
  currency: "TRY" as const,
  subtotalCents: 100,
  shippingCents: 0,
  totalCents: 100,
  paymentStatus: "pending" as const,
  paymentMethod: Object.freeze({
    kind: "cash_on_delivery" as const,
    label: "Kapıda ödeme",
    instructions: "Teslimatta ödeyin.",
  }),
  delivery: Object.freeze({
    recipientName: "Güzide Elif",
    addressLine1: "Cadde 1",
    city: "İstanbul",
    country: "TR" as const,
  }),
  items: CART.items,
  createdAt: "2026-07-31T12:00:00.000Z",
});
const trusted = (): TrustedStorefrontHostAuthority => ({
  kind: "trusted",
  hostname: HOST,
});
const baseRuntime = {
  resolveCart: async () => ({ cart: CART }),
  mutateCart: async () => ({ cart: CART }),
  quote: async () => ({ cart: CART, paymentMethods: [] }),
  complete: async () => {
    throw new Error("unused");
  },
};

test("cart GET returns only canonical cart under trusted proxy authority", async () => {
  const response = await createCartGetRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => baseRuntime,
  })(new Request("http://internal:3400/api/cart"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cart: CART });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cart GET forwards only the exact local credential deletion cookie", async () => {
  const response = await createCartGetRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      ...baseRuntime,
      resolveCart: async () => ({
        cart: CART,
        setCookie:
          "__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      }),
    }),
  })(new Request("http://internal:3400/api/cart"));
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("set-cookie"),
    "__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  );
});

test("recovery POST keeps the opaque token out of the URL and returns a fresh cart cookie", async () => {
  const token = Buffer.alloc(32, 0x42).toString("base64url");
  const handler = createCartRecoveryRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      restoreCart: async (_hostname, raw) => {
        assert.equal(raw, token);
        return {
          cart: CART,
          restoredItems: 1,
          omittedItems: 2,
          adjustedItems: 1,
          setCookie:
            "__Host-celebix_cart=safe; Path=/; Secure; HttpOnly; SameSite=Lax",
        };
      },
    }),
  });
  const response = await handler(
    new Request("http://internal:3400/api/cart/recover", {
      method: "POST",
      headers: {
        origin: `https://${HOST}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    location: "/cart?recovered=1&omitted=2&adjusted=1",
  });
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^__Host-celebix_cart=/u,
  );
  assert.equal(
    (
      await handler(
        new Request("http://internal:3400/api/cart/recover", {
          method: "POST",
          headers: {
            origin: `https://${HOST}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ token: "bad" }),
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        new Request(`http://internal:3400/api/cart/recover?token=${token}`),
      )
    ).status,
    400,
  );
});

test("cart mutation requires exact same-origin authority and sets credential only after success", async () => {
  const handler = createCartActionRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      ...baseRuntime,
      mutateCart: async () => ({
        cart: CART,
        setCookie:
          "__Host-celebix_cart=safe; Path=/; Secure; HttpOnly; SameSite=Lax",
      }),
    }),
  });
  const request = new Request("http://internal:3400/api/cart/add", {
    method: "POST",
    headers: { origin: `https://${HOST}`, "content-type": "application/json" },
    body: JSON.stringify({
      operationId: OPERATION,
      productId: PRODUCT,
      variantId: VARIANT,
      quantity: 1,
    }),
  });
  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cart: CART });
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /^__Host-celebix_cart=/u,
  );
  const denied = await handler(
    new Request("http://internal:3400/api/cart/add", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operationId: OPERATION,
        productId: PRODUCT,
        variantId: VARIANT,
        quantity: 1,
      }),
    }),
  );
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.has("set-cookie"), false);
});

test("checkout failure has neither Location nor Set-Cookie and success redirects only to fixed route", async () => {
  const body = {
    operationId: OPERATION,
    cartVersion: 1,
    intentKind: "cart",
    contact: {
      name: "Güzide Elif",
      email: "guzide@example.test",
      phone: "+905551112233",
    },
    shippingAddress: {
      addressLine1: "Cadde 1",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
    },
    shippingMethod: "standard",
    paymentKind: "bank_transfer",
  };
  const failed = createCheckoutCompleteRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      ...baseRuntime,
      complete: async () => {
        throw new Error("database");
      },
    }),
  });
  const failure = await failed(
    new Request("http://internal:3400/api/checkout/complete", {
      method: "POST",
      headers: {
        origin: `https://${HOST}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.has("location"), false);
  assert.equal(failure.headers.has("set-cookie"), false);
  const success = createCheckoutCompleteRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      ...baseRuntime,
      complete: async () => ({
        receipt: RECEIPT,
        setCookies: [
          "__Host-celebix_customer=safe; Path=/; Secure; HttpOnly; SameSite=Lax",
          "__Host-celebix_receipt=safe; Path=/; Secure; HttpOnly; SameSite=Lax",
        ],
      }),
    }),
  });
  const completed = await success(
    new Request("http://internal:3400/api/checkout/complete", {
      method: "POST",
      headers: {
        origin: `https://${HOST}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(completed.status, 303);
  assert.equal(completed.headers.get("location"), "/checkout/success");
  assert.match(
    completed.headers.get("set-cookie") ?? "",
    /__Host-celebix_receipt/u,
  );
});

test("hosted checkout start returns only the fixed same-origin destination and browser cookies", async () => {
  const body = {
    operationId: OPERATION,
    cartVersion: 1,
    intentKind: "cart",
    contact: {
      name: "Güzide Elif",
      email: "guzide@example.test",
      phone: "+905551112233",
    },
    shippingAddress: {
      addressLine1: "Cadde 1",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
    },
    shippingMethod: "standard",
    paymentMethodId: "40000000-0000-4000-8000-000000000001",
    identityNumber: "10000000146",
  };
  const handler = createHostedCheckoutStartRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      start: async () => ({
        destination: "/checkout/payment" as const,
        state: "ready" as const,
        setCookies: [
          "__Host-celebix_hosted_checkout=safe; Path=/checkout/payment; Secure; HttpOnly; SameSite=Lax",
          "__Host-celebix_receipt=safe; Path=/; Secure; HttpOnly; SameSite=Lax",
        ],
      }),
    }),
  });
  const response = await handler(
    new Request("http://internal:3400/api/checkout/payment/start", {
      method: "POST",
      headers: {
        origin: `https://${HOST}`,
        "content-type": "application/json",
        "x-forwarded-for": "8.8.8.8",
      },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(response.status, 200);
  const raw = await response.clone().text();
  assert.deepEqual(await response.json(), { destination: "/checkout/payment" });
  assert.equal(response.headers.has("location"), false);
  assert.doesNotMatch(raw, /iyzipay|paytr|token/iu);
  assert.match(
    response.headers.get("set-cookie") ?? "",
    /__Host-celebix_hosted_checkout/u,
  );
});

test("hosted checkout start fails closed without leaking cookies or redirect authority", async () => {
  const handler = createHostedCheckoutStartRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      start: async () => {
        throw new Error("provider token https://evil.example");
      },
    }),
  });
  const response = await handler(
    new Request("http://internal:3400/api/checkout/payment/start", {
      method: "GET",
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "invalid_input" });
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("hosted checkout start maps standard runtime input failures and emits only a safe diagnostic", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const handler = createHostedCheckoutStartRoute({
    selectAuthority: trusted,
    resolveRuntime: async () => ({
      start: async () => {
        throw new StandardHostedCheckoutRuntimeError("invalid_input");
      },
    }),
    audit: (event) => events.push(event),
  });
  const body = {
    operationId: OPERATION,
    cartVersion: 1,
    intentKind: "cart",
    contact: {
      name: "Güzide Elif",
      email: "guzide@example.test",
      phone: "+905551112233",
    },
    shippingAddress: {
      addressLine1: "Cadde 1",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
    },
    shippingMethod: "standard",
    paymentMethodId: "40000000-0000-4000-8000-000000000001",
    identityNumber: "10000000146",
  };
  const response = await handler(
    new Request("http://internal:3400/api/checkout/payment/start", {
      method: "POST",
      headers: {
        origin: `https://${HOST}`,
        "content-type": "application/json",
        "x-forwarded-for": "8.8.8.8",
      },
      body: JSON.stringify(body),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "invalid_input" });
  assert.deepEqual(events, [
    { stage: "runtime_failure", code: "invalid_input" },
  ]);
});
