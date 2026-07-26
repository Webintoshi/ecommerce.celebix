import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createSafeUmamiTracker } from "./tracker-client.ts";
import { CHECKOUT_STARTED_EVENT, PRODUCT_VIEW_EVENT, trackCommerceEvent } from "./events.ts";

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
