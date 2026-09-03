import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { createSafeUmamiTracker } from "./tracker-client.ts";
import { CHECKOUT_STARTED_EVENT, PRODUCT_VIEW_EVENT, emitStorefrontCommerceEvent, trackCommerceEvent } from "./events.ts";

const WEBSITE = "50000000-0000-4000-8000-000000000001";

function fixture(pathname = "/products/sku") {
  const sent: unknown[] = [];
  const browser = { location: { protocol: "https:", hostname: "shop.example.test", pathname }, document: { title: "Product", referrer: "" }, now:()=>new Date("2026-07-26T12:00:00.000Z"), umami: { track(value: unknown) { sent.push(value); } } };
  const tracker = createSafeUmamiTracker({ websiteId: WEBSITE, hostname: "shop.example.test", browser });
  return { sent, browser, tracker };
}

test("product view emits only the truthful catalog aggregate", () => {
  const value = fixture("/products/sku?never-visible");
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser);
  assert.deepEqual(value.sent, [{ website: WEBSITE, hostname: "shop.example.test", url: "/products/sku", name: "product_view", data: { schema_version: 1, occurred_at: "2026-07-26T12:00:00.000Z" } }]);
});

test("checkout started emits only the quick-order source", () => {
  const value = fixture("/odeme/hizli");
  trackCommerceEvent(value.tracker, CHECKOUT_STARTED_EVENT, value.browser);
  assert.deepEqual(value.sent, [{ website: WEBSITE, hostname: "shop.example.test", url: "/odeme/hizli", name: "begin_checkout", data: { schema_version: 1, occurred_at: "2026-07-26T12:00:00.000Z", source: "quick_order" } }]);
});

test("commerce event constants are deeply frozen and reject invented payloads", () => {
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT), true);
  assert.equal(Object.isFrozen(PRODUCT_VIEW_EVENT.data), true);
  const value = fixture();
  assert.throws(() => trackCommerceEvent(value.tracker, { name: "add_to_cart", data: { productId: "private" } } as never, value.browser), /storefront_analytics_event_invalid/);
  assert.equal(value.sent.length, 0);
});

test("all browser commerce names are accepted while purchase and PII are rejected", () => {
  const names=["storefront_view","product_view","category_view","search","add_to_cart","remove_from_cart","view_cart","begin_checkout","checkout_address_completed","shipping_method_selected","payment_method_selected","checkout_validation_error","coupon_applied","whatsapp_click","phone_click"] as const;
  for(const name of names){const value=fixture();trackCommerceEvent(value.tracker,{name,data:{}} as never,value.browser);assert.equal((value.sent[0] as{name:string}).name,name)}
  const value=fixture();
  for(const event of [{name:"purchase",data:{}},{name:"add_to_cart",data:{email:"x@example.test"}},{name:"add_to_cart",data:{cartId:"10000000-0000-4000-8000-000000000001"}}])assert.throws(()=>trackCommerceEvent(value.tracker,event as never,value.browser),/storefront_analytics_event_invalid/);
});

test("client signal dispatch is fail-open and carries no cart authority",()=>{const dispatched:unknown[]=[];const browser={dispatchEvent(event:Event){dispatched.push((event as CustomEvent).detail);return true}};assert.doesNotThrow(()=>emitStorefrontCommerceEvent({name:"add_to_cart",data:{productId:"10000000-0000-4000-8000-000000000001",variantId:"20000000-0000-4000-8000-000000000001",quantity:1}},browser as never));assert.deepEqual(dispatched,[{name:"add_to_cart",data:{productId:"10000000-0000-4000-8000-000000000001",variantId:"20000000-0000-4000-8000-000000000001",quantity:1}}]);assert.doesNotThrow(()=>emitStorefrontCommerceEvent({name:"purchase",data:{}} as never,browser as never));assert.equal(dispatched.length,1)});

test("wrong host and absent provider remain no-ops", () => {
  const value = fixture();
  trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, { ...value.browser, location: { ...value.browser.location, hostname: "alias.example.test" } });
  delete (value.browser as { umami?: unknown }).umami;
  assert.doesNotThrow(() => trackCommerceEvent(value.tracker, PRODUCT_VIEW_EVENT, value.browser));
  assert.equal(value.sent.length, 0);
});

test("real product cart and native checkout boundaries emit fail-open canonical browser events", async () => {
  const [product, checkout, component,bridge,card,purchase,cartPage,checkoutForm] = await Promise.all([
    readFile(new URL("../../app/products/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/odeme/hizli/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/StorefrontAnalyticsEvent.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/StorefrontAnalyticsBridge.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../components/ProductCardCartButton.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../components/ProductPurchasePanel.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../components/CartPageClient.tsx",import.meta.url),"utf8"),
    readFile(new URL("../../components/CheckoutForm.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(product, /StorefrontAnalyticsEvent[\s\S]*productViewEvent/);
  assert.match(checkout, /<form[^>]+id=\{analyticsFormId\}[^>]+method="post"[^>]+action="\/api\/quick-order\/checkout"/);
  assert.match(checkout, /StorefrontAnalyticsEvent[\s\S]*CHECKOUT_STARTED_EVENT/);
  assert.match(component, /addEventListener\("submit"/);
  assert.match(bridge,/STOREFRONT_COMMERCE_EVENT/);
  assert.match(card,/name:\s*"add_to_cart"/);
  assert.match(purchase,/name:\s*"add_to_cart"/);
  assert.match(cartPage,/name:\s*"view_cart"/);
  for(const name of ["begin_checkout","checkout_address_completed","shipping_method_selected","payment_method_selected","checkout_validation_error"])assert.match(checkoutForm,new RegExp(`name:\\s*\\"${name}\\"`));
  assert.doesNotMatch(`${product}\n${checkout}\n${component}\n${bridge}\n${card}\n${purchase}\n${cartPage}\n${checkoutForm}`,/customerId|orderId|valueCents|email:\s*draft|phone:\s*draft/);
});
