import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicCheckoutQuoteV2 } from "@celebix/saas-contracts";
import { StorefrontCommerceRepositoryError } from "@celebix/saas-data";

const HOST = "shop.example.test";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";

function quote(applied: boolean) {
  return parsePublicCheckoutQuoteV2({
    cart: {
      version: 2,
      currency: "TRY",
      itemCount: 1,
      subtotalCents: 1_000,
      shippingCents: 0,
      lineDiscountCents: applied ? 100 : 0,
      shippingDiscountCents: 0,
      discountCents: applied ? 100 : 0,
      totalCents: applied ? 900 : 1_000,
      checkoutReady: true,
      checkoutBlocker: null,
      items: [{
        productId: PRODUCT,
        variantId: VARIANT,
        slug: "urun",
        title: "Ürün",
        variantTitle: "Standart",
        quantity: 1,
        unitPriceCents: 1_000,
        lineTotalCents: 1_000,
        discountCents: applied ? 100 : 0,
        payableCents: applied ? 900 : 1_000,
        available: true,
      }],
    },
    paymentMethods: [],
    promotionStatus: { kind: "evaluated" },
    appliedPromotions: applied ? [{
      name: "Paylaşım indirimi",
      benefitKind: "percentage",
      normalizedCode: "INDIRIM",
      lineDiscountCents: 100,
      shippingDiscountCents: 0,
      discountCents: 100,
    }] : [],
    rejectedPromotions: applied ? [] : [{ normalizedCode: "INDIRIM", reason: "invalid_code" }],
    gifts: [],
    progressMessages: [],
  });
}

const modulePromise = import("./share-route.ts").catch(() => null);

test("share route binds hostname authority, normalizes through V2 and strips the query", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  let observed: readonly unknown[] | undefined;
  const handler = module.createCouponShareRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveRuntime: async () => ({
      quote: async (...input: readonly unknown[]) => {
        observed = input;
        return quote(true);
      },
    }),
  });
  const response = await handler(new Request("http://internal:3450/cart/coupon?coupon=indirim"));

  assert.deepEqual(observed, [HOST, null, "cart", undefined, ["INDIRIM"]]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/cart");
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_coupon=INDIRIM;/u);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.doesNotMatch(await response.text(), /Paylaşım indirimi|INDIRIM|campaign|promotion/iu);
});

test("invalid archived and cross-tenant share candidates converge on one query-free generic redirect", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  const outcomes = [
    async () => quote(false),
    async () => { throw new Error("archived promotion 60000000-0000-4000-8000-000000000001"); },
    async () => { throw new Error("cross tenant store 70000000-0000-4000-8000-000000000001"); },
  ];
  const fingerprints: unknown[] = [];
  for (const resolveQuote of outcomes) {
    const handler = module.createCouponShareRoute({
      selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
      resolveRuntime: async () => ({ quote: resolveQuote }),
    });
    const response = await handler(new Request("http://internal:3450/cart/coupon?coupon=indirim"));
    fingerprints.push({
      status: response.status,
      location: response.headers.get("location"),
      cookie: response.headers.get("set-cookie"),
      body: await response.text(),
    });
  }
  assert.equal(new Set(fingerprints.map((value) => JSON.stringify(value))).size, 1);
  assert.deepEqual(fingerprints[0], {
    status: 303,
    location: "/cart",
    cookie: "__Host-celebix_coupon=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    body: "",
  });
});

test("a rejected malformed or unavailable share candidate cannot erase existing valid candidates", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  const requests: ReadonlyArray<Readonly<{
    url: string;
    resolveQuote: () => Promise<ReturnType<typeof quote>>;
  }>> = [
    { url: "http://internal:3450/cart/coupon?coupon=indirim", resolveQuote: async () => quote(false) },
    { url: "http://internal:3450/cart/coupon?coupon=bad%20code", resolveQuote: async () => quote(true) },
    { url: "http://internal:3450/cart/coupon?coupon=indirim", resolveQuote: async () => { throw new Error("unavailable"); } },
  ];
  for (const selected of requests) {
    const handler = module.createCouponShareRoute({
      selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
      resolveRuntime: async () => ({ quote: selected.resolveQuote }),
    });
    const response = await handler(new Request(selected.url, {
      headers: { cookie: "__Host-celebix_coupon=VIP" },
    }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/cart");
    assert.equal(response.headers.get("set-cookie"), "__Host-celebix_coupon=VIP; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
    assert.equal(await response.text(), "");
  }
});

test("only typed no-cart outcomes retain a normalized share candidate for later V2 validation", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  const deferred = [
    { error: new StorefrontCommerceRepositoryError("not_found"), cookie: undefined, expected: "INDIRIM" },
    { error: new StorefrontCommerceRepositoryError("cart_empty"), cookie: "__Host-celebix_coupon=VIP", expected: "VIP.INDIRIM" },
  ];
  for (const selected of deferred) {
    const handler = module.createCouponShareRoute({
      selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
      resolveRuntime: async () => ({ quote: async () => { throw selected.error; } }),
    });
    const response = await handler(new Request("http://internal:3450/cart/coupon?coupon=indirim", {
      ...(selected.cookie ? { headers: { cookie: selected.cookie } } : {}),
    }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/cart");
    assert.equal(response.headers.get("set-cookie"), `__Host-celebix_coupon=${selected.expected}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`);
    assert.equal(await response.text(), "");
  }

  for (const error of [
    new Error("cart_empty"),
    new StorefrontCommerceRepositoryError("unavailable"),
  ]) {
    const handler = module.createCouponShareRoute({
      selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
      resolveRuntime: async () => ({ quote: async () => { throw error; } }),
    });
    const response = await handler(new Request("http://internal:3450/cart/coupon?coupon=indirim", {
      headers: { cookie: "__Host-celebix_coupon=VIP" },
    }));
    assert.equal(response.headers.get("set-cookie"), "__Host-celebix_coupon=VIP; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
    assert.equal(await response.text(), "");
  }
});

test("share route rejects ambiguous query and untrusted host without runtime or redirect authority", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  let resolutions = 0;
  const handler = module.createCouponShareRoute({
    selectAuthority: () => ({ kind: "invalid_forwarded_host" }),
    resolveRuntime: async () => {
      resolutions += 1;
      return { quote: async () => quote(true) };
    },
  });
  for (const url of [
    "http://internal:3450/cart/coupon?coupon=INDIRIM&coupon=OTHER",
    "http://internal:3450/cart/coupon?coupon=INDIRIM&storeId=private",
  ]) {
    const response = await handler(new Request(url));
    assert.equal(response.status, 404);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(await response.text(), "");
  }
  assert.equal(resolutions, 0);
});

test("share route rejects body and private authority envelopes plus oversized raw queries before runtime", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  let resolutions = 0;
  const handler = module.createCouponShareRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveRuntime: async () => {
      resolutions += 1;
      return { quote: async () => quote(true) };
    },
  });
  const denied = [
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { authorization: "Bearer private" } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "content-length": "1" } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "content-type": "application/json" } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "transfer-encoding": "chunked" } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "x-store-id": PRODUCT } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "x-tenant-id": PRODUCT } }),
    new Request("http://internal:3450/cart/coupon?coupon=INDIRIM", { headers: { "x-celebix-store-id": PRODUCT } }),
    new Request(`http://internal:3450/cart/coupon?coupon=${"A".repeat(513)}`),
  ];
  for (const request of denied) {
    const response = await handler(request);
    assert.equal(response.status, 404);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(await response.text(), "");
  }
  assert.equal(resolutions, 0);
});

test("share route preserves a server-unrejected payment-deferred candidate without claiming a discount", async () => {
  const module = await modulePromise;
  assert.ok(module, "share route must exist");
  const deferred = parsePublicCheckoutQuoteV2({
    ...quote(false),
    rejectedPromotions: [],
    progressMessages: ["Ödeme yöntemi seçildiğinde tekrar değerlendirilecek."],
  });
  const handler = module.createCouponShareRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveRuntime: async () => ({ quote: async () => deferred }),
  });
  const response = await handler(new Request("http://internal:3450/cart/coupon?coupon=indirim"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/cart");
  assert.equal(response.headers.get("set-cookie"), "__Host-celebix_coupon=INDIRIM; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax");
  assert.equal(await response.text(), "");
});
