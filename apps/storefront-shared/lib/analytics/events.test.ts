import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createSafeUmamiTracker } from "./tracker-client.ts";
import {
  CHECKOUT_EVENTS,
  CHECKOUT_STARTED_EVENT,
  PRODUCT_VIEW_EVENT,
  createCheckoutCommerceEvent,
  trackCommerceEvent,
} from "./events.ts";

const WEBSITE = "50000000-0000-4000-8000-000000000001";

function fixture(pathname = "/products/sku") {
  const sent: unknown[] = [];
  const browser = { location: { protocol: "https:", hostname: "shop.example.test", pathname }, document: { title: "Product", referrer: "" }, umami: { track(value: unknown) { sent.push(value); } } };
  const tracker = createSafeUmamiTracker({ websiteId: WEBSITE, hostname: "shop.example.test", browser });
  return { sent, browser, tracker };
}

test("product view emits only the truthful catalog aggregate", () => {
  const value = fixture("/products/sku?never-visible");
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser);
  assert.deepEqual(value.sent, [{ website: WEBSITE, hostname: "shop.example.test", url: "/products/sku", name: "product_view", data: { product: "catalog_item" } }]);
});

test("checkout started emits only the quick-order source", () => {
  const value = fixture("/odeme/hizli");
  trackCommerceEvent(value.tracker, CHECKOUT_STARTED_EVENT, value.browser);
  assert.deepEqual(value.sent, [{ website: WEBSITE, hostname: "shop.example.test", url: "/odeme/hizli", name: "checkout_started", data: { source: "quick_order" } }]);
});

test("checkout analytics accepts only finite non-PII facts", () => {
  const value = fixture("/odeme");
  const event = createCheckoutCommerceEvent({
    name: "checkout_submitted",
    data: {
      methodKind: "provider",
      providerCode: "iyzico_iframe",
      currency: "TRY",
      itemCount: 1,
    },
  });
  trackCommerceEvent(value.tracker, event, value.browser);
  assert.equal((value.sent[0] as { name?: unknown } | undefined)?.name, "checkout_submitted");
  assert.deepEqual(
    (value.sent[0] as { data?: unknown } | undefined)?.data,
    {
      methodKind: "provider",
      providerCode: "iyzico_iframe",
      currency: "TRY",
      itemCount: 1,
    },
  );
  assert.throws(() => createCheckoutCommerceEvent({
    name: "checkout_submitted",
    data: { email: "buyer@example.com" },
  } as never), /storefront_analytics_event_invalid/);
});

test("checkout analytics event names and result codes are finite and deeply frozen", () => {
  assert.deepEqual(CHECKOUT_EVENTS, [
    "checkout_started",
    "checkout_delivery_saved",
    "checkout_submitted",
    "checkout_completed",
    "checkout_failed",
  ]);
  assert.equal(Object.isFrozen(CHECKOUT_EVENTS), true);

  const started = createCheckoutCommerceEvent({
    name: "checkout_started",
    data: { currency: "TRY", itemCount: 2 },
  });
  const completed = createCheckoutCommerceEvent({
    name: "checkout_completed",
    data: { methodKind: "bank_transfer", resultCode: "placed" },
  });
  const failed = createCheckoutCommerceEvent({
    name: "checkout_failed",
    data: { resultCode: "payment_unavailable" },
  });
  for (const event of [started, completed, failed]) {
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.data), true);
  }
  assert.deepEqual(completed, {
    name: "checkout_completed",
    data: { methodKind: "bank_transfer", resultCode: "placed" },
  });
});

test("checkout analytics rejects unknown, mismatched, unbounded, and accessor data", () => {
  const invalid: unknown[] = [
    { name: "checkout_started", data: { currency: "TRY", itemCount: 0 } },
    { name: "checkout_started", data: { currency: "TRY", itemCount: 101 } },
    { name: "checkout_started", data: { currency: "USD", itemCount: 1 } },
    { name: "checkout_submitted", data: { methodKind: "provider", currency: "TRY", itemCount: 1 } },
    { name: "checkout_submitted", data: { methodKind: "cash_on_delivery", providerCode: "paytr_iframe", currency: "TRY", itemCount: 1 } },
    { name: "checkout_completed", data: { resultCode: "success" } },
    { name: "checkout_failed", data: { resultCode: "private provider body" } },
    { name: "checkout_failed", data: { resultCode: "failed", phone: "+905551112233" } },
    { name: "checkout_submitted", data: { methodKind: "provider", providerCode: `${"x".repeat(65)}`, currency: "TRY", itemCount: 1 } },
  ];
  for (const event of invalid) {
    assert.throws(
      () => createCheckoutCommerceEvent(event as never),
      /storefront_analytics_event_invalid/,
      JSON.stringify(event),
    );
  }

  let reads = 0;
  const data = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(data, "currency", { enumerable: true, get() { reads += 1; return "TRY"; } });
  Object.defineProperty(data, "itemCount", { enumerable: true, value: 1 });
  assert.throws(() => createCheckoutCommerceEvent({
    name: "checkout_started",
    data,
  } as never), /storefront_analytics_event_invalid/);
  assert.equal(reads, 0);
});

test("commerce event constants are deeply frozen and reject invented payloads", () => {
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT), true);
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT.data), true);
  const value = fixture();
  assert.throws(() => trackCommerceEvent(value.tracker, { name: "add_to_cart", data: { productId: "private" } } as never, value.browser), /storefront_analytics_event_invalid/);
  assert.equal(value.sent.length, 0);
});

test("wrong host and absent provider remain no-ops", () => {
  const value = fixture();
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, { ...value.browser, location: { ...value.browser.location, hostname: "alias.example.test" } });
  delete (value.browser as { umami?: unknown }).umami;
  assert.doesNotThrow(() => trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser));
  assert.equal(value.sent.length, 0);
});

test("real product and native checkout boundaries contain no invented cart event", async () => {
  const [product, checkout, component] = await Promise.all([
    readFile(new URL("../../app/products/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/odeme/hizli/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/StorefrontAnalyticsEvent.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(product, /StorefrontAnalyticsEvent[\s\S]*PRODUCT_VIEW_EVENT/);
  assert.match(checkout, /<form[^>]+id=\{analyticsFormId\}[^>]+method="post"[^>]+action="\/api\/quick-order\/checkout"/);
  assert.match(checkout, /StorefrontAnalyticsEvent[\s\S]*CHECKOUT_STARTED_EVENT/);
  assert.match(component, /addEventListener\("submit"/);
  assert.doesNotMatch(`${product}\n${checkout}\n${component}`, /add_to_cart|customerId|orderId|valueCents/);
});
