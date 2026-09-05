import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createSafeUmamiTracker } from "./tracker-client.ts";
import {
  CHECKOUT_STARTED_EVENT,
  PRODUCT_VIEW_EVENT,
  emitStorefrontCommerceEvent,
  productViewEvent,
  trackCommerceEvent,
} from "./events.ts";
import * as commerceEvents from "./events.ts";

const WEBSITE = "50000000-0000-4000-8000-000000000001";

function fixture(pathname = "/products/sku") {
  const sent: unknown[] = [];
  const browser = {
    location: { protocol: "https:", hostname: "shop.example.test", pathname },
    document: { title: "Product", referrer: "" },
    now: () => new Date("2026-07-26T12:00:00.000Z"),
    umami: {
      track(value: unknown) {
        sent.push(value);
      },
    },
  };
  const tracker = createSafeUmamiTracker({
    websiteId: WEBSITE,
    hostname: "shop.example.test",
    browser,
  });
  return { sent, browser, tracker };
}

test("product view emits only the truthful catalog aggregate", () => {
  const value = fixture("/products/sku?never-visible");
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser);
  assert.deepEqual(value.sent, [
    {
      website: WEBSITE,
      hostname: "shop.example.test",
      url: "/products/sku",
      name: "product_view",
      data: { schema_version: 1, occurred_at: "2026-07-26T12:00:00.000Z" },
    },
  ]);
});

test("product view carries one catalog category cohort without cart authority", () => {
  const value = fixture();
  const product = "10000000-0000-4000-8000-000000000001";
  const variant = "20000000-0000-4000-8000-000000000001";
  const category = "30000000-0000-4000-8000-000000000001";
  trackCommerceEvent(
    value.tracker,
    productViewEvent(product, variant, category, "TRY", 12500),
    value.browser,
  );
  assert.deepEqual(value.sent, [
    {
      website: WEBSITE,
      hostname: "shop.example.test",
      url: "/products/sku",
      name: "product_view",
      data: {
        schema_version: 1,
        occurred_at: "2026-07-26T12:00:00.000Z",
        product_id: product,
        variant_id: variant,
        category_id: category,
        currency: "TRY",
        value_minor: 12500,
      },
    },
  ]);
});

test("commerce events carry safe acquisition dimensions without leaking URL PII", () => {
  const value = fixture();
  const browser = {
    ...value.browser,
    location: {
      ...value.browser.location,
      href: "https://shop.example.test/products/sku?utm_source=google&utm_medium=cpc&utm_campaign=summer&email=private%40example.test",
    },
    document: { ...value.browser.document, referrer: "" },
  };
  trackCommerceEvent(
    value.tracker,
    productViewEvent("10000000-0000-4000-8000-000000000001"),
    browser,
  );
  assert.deepEqual(value.sent, [
    {
      website: WEBSITE,
      hostname: "shop.example.test",
      url: "/products/sku?utm_source=google&utm_medium=cpc&utm_campaign=summer",
      name: "product_view",
      data: {
        schema_version: 1,
        occurred_at: "2026-07-26T12:00:00.000Z",
        product_id: "10000000-0000-4000-8000-000000000001",
        source: "google",
        medium: "cpc",
        campaign: "summer",
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(value.sent), /private/);
});

test("checkout started emits only the quick-order source", () => {
  const value = fixture("/odeme/hizli");
  trackCommerceEvent(value.tracker, CHECKOUT_STARTED_EVENT, value.browser);
  assert.deepEqual(value.sent, [
    {
      website: WEBSITE,
      hostname: "shop.example.test",
      url: "/odeme/hizli",
      name: "begin_checkout",
      data: {
        schema_version: 1,
        occurred_at: "2026-07-26T12:00:00.000Z",
        source: "quick_order",
      },
    },
  ]);
});

test("commerce event constants are deeply frozen and reject invented payloads", () => {
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT), true);
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT.data), true);
  const value = fixture();
  assert.throws(
    () =>
      trackCommerceEvent(
        value.tracker,
        { name: "add_to_cart", data: { productId: "private" } } as never,
        value.browser,
      ),
    /storefront_analytics_event_invalid/,
  );
  assert.equal(value.sent.length, 0);
});

test("all browser commerce names are accepted while purchase and PII are rejected", () => {
  const names = [
    "storefront_view",
    "product_view",
    "category_view",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "begin_checkout",
    "checkout_address_completed",
    "shipping_method_selected",
    "payment_method_selected",
    "checkout_validation_error",
    "coupon_applied",
    "whatsapp_click",
    "phone_click",
  ] as const;
  for (const name of names) {
    const value = fixture();
    trackCommerceEvent(
      value.tracker,
      { name, data: {} } as never,
      value.browser,
    );
    assert.equal((value.sent[0] as { name: string }).name, name);
  }
  const value = fixture();
  for (const event of [
    { name: "purchase", data: {} },
    { name: "add_to_cart", data: { email: "x@example.test" } },
    {
      name: "add_to_cart",
      data: { cartId: "10000000-0000-4000-8000-000000000001" },
    },
  ])
    assert.throws(
      () => trackCommerceEvent(value.tracker, event as never, value.browser),
      /storefront_analytics_event_invalid/,
    );
});

test("client signal dispatch is fail-open and carries no cart authority", () => {
  const dispatched: unknown[] = [];
  const browser = {
    dispatchEvent(event: Event) {
      dispatched.push((event as CustomEvent).detail);
      return true;
    },
  };
  assert.doesNotThrow(() =>
    emitStorefrontCommerceEvent(
      {
        name: "add_to_cart",
        data: {
          productId: "10000000-0000-4000-8000-000000000001",
          variantId: "20000000-0000-4000-8000-000000000001",
          quantity: 1,
        },
      },
      browser as never,
    ),
  );
  assert.deepEqual(dispatched, [
    {
      name: "add_to_cart",
      data: {
        productId: "10000000-0000-4000-8000-000000000001",
        variantId: "20000000-0000-4000-8000-000000000001",
        quantity: 1,
      },
    },
  ]);
  assert.doesNotThrow(() =>
    emitStorefrontCommerceEvent(
      { name: "purchase", data: {} } as never,
      browser as never,
    ),
  );
  assert.equal(dispatched.length, 1);
});

test("wrong host and absent provider remain no-ops", () => {
  const value = fixture();
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, {
    ...value.browser,
    location: { ...value.browser.location, hostname: "alias.example.test" },
  });
  delete (value.browser as { umami?: unknown }).umami;
  assert.doesNotThrow(() =>
    trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser),
  );
  assert.equal(value.sent.length, 0);
});

test("real product cart and native checkout boundaries emit fail-open canonical browser events", async () => {
  const [
    product,
    checkout,
    component,
    bridge,
    card,
    purchase,
    cartPage,
    checkoutForm,
  ] = await Promise.all([
    readFile(
      new URL("../../app/products/[slug]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../app/odeme/hizli/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../components/StorefrontAnalyticsEvent.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/StorefrontAnalyticsBridge.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../components/ProductCardCartButton.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../components/ProductPurchasePanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../components/CartPageClient.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../components/CheckoutForm.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(product, /StorefrontAnalyticsEvent[\s\S]*productViewEvent/);
  assert.match(
    checkout,
    /<form[^>]+id=\{analyticsFormId\}[^>]+method="post"[^>]+action="\/api\/quick-order\/checkout"/,
  );
  assert.match(
    checkout,
    /StorefrontAnalyticsEvent[\s\S]*CHECKOUT_STARTED_EVENT/,
  );
  assert.match(component, /addEventListener\("submit"/);
  assert.match(bridge, /STOREFRONT_COMMERCE_EVENT/);
  assert.match(card, /name:\s*"add_to_cart"/);
  assert.match(purchase, /name:\s*"add_to_cart"/);
  assert.match(cartPage, /name:\s*"view_cart"/);
  for (const name of [
    "begin_checkout",
    "checkout_address_completed",
    "shipping_method_selected",
    "payment_method_selected",
    "checkout_validation_error",
  ])
    assert.match(checkoutForm, new RegExp(`name:\\s*\\"${name}\\"`));
  assert.doesNotMatch(
    `${product}\n${checkout}\n${component}\n${bridge}\n${card}\n${purchase}\n${cartPage}\n${checkoutForm}`,
    /customerId|orderId|valueCents|email:\s*draft|phone:\s*draft/,
  );
  assert.doesNotMatch(
    `${purchase}\n${cartPage}\n${checkoutForm}`,
    /currency:\s*"TRY"/,
  );
});

test("coupon behavior analytics emits only after a validated applied quote and carries no PII or financial authority", () => {
  const candidate = (commerceEvents as unknown as Record<string, unknown>).couponAppliedEvent;
  assert.equal(typeof candidate, "function");
  const couponAppliedEvent = candidate as (quote: unknown, normalizedCode: string) => unknown;
  const applied = {
    cart: {
      version: 1, currency: "TRY", itemCount: 1, subtotalCents: 1_000, shippingCents: 0,
      lineDiscountCents: 100, shippingDiscountCents: 0, discountCents: 100, totalCents: 900,
      checkoutReady: true, checkoutBlocker: null,
      items: [{ productId: "10000000-0000-4000-8000-000000000001", variantId: "20000000-0000-4000-8000-000000000001", slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 1_000, lineTotalCents: 1_000, discountCents: 100, payableCents: 900, available: true }],
    },
    paymentMethods: [], promotionStatus: { kind: "evaluated" },
    appliedPromotions: [{ name: "Özel müşteri kampanyası", benefitKind: "percentage", normalizedCode: "KISIYE_OZEL", lineDiscountCents: 100, shippingDiscountCents: 0, discountCents: 100 }],
    rejectedPromotions: [], gifts: [], progressMessages: [],
  };
  assert.deepEqual(couponAppliedEvent(applied, "KISIYE_OZEL"), { name: "coupon_applied", data: {} });
  assert.equal(couponAppliedEvent({ ...applied, appliedPromotions: [], rejectedPromotions: [{ normalizedCode: "KISIYE_OZEL", reason: "not_eligible" }] }, "KISIYE_OZEL"), null);
  assert.doesNotMatch(JSON.stringify(couponAppliedEvent(applied, "KISIYE_OZEL")), /KISIYE|Özel|100|discount|value|customer/iu);
});
