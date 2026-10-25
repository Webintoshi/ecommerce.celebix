import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
const selection = { query: "", order: "featured", filter: "all", offset: 24 };
const product = { id: "ezmeo-product", slug: "eriste", title: "Karakılçık Kesme Erişte", priceCents: 10900, currency: "TRY", available: true, media: [], variants: [
  { id: "250", title: "250g", priceCents: 10900, available: true, stockTracking: true, stockQuantity: 211, attributes: {} },
  { id: "500", title: "500g", priceCents: 19900, available: true, stockTracking: true, stockQuantity: 142, attributes: {} },
  { id: "1000", title: "1000g", priceCents: 38900, available: false, stockTracking: true, stockQuantity: 0, attributes: {} },
] };

test("Ezmeo sorting/filtering applies immediately and search submits on the same catalog without an Apply button", async () => {
  const pushes: unknown[] = [];
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push: (...args: unknown[]) => pushes.push(args) }) },
    "../../components/CatalogProductList": { CatalogProductList: () => React.createElement("div", { "data-test-catalog": true }) },
    "../../components/CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
  });
  const { EzmeoProductExplorer: Explorer } = load<{ EzmeoProductExplorer: Component }>(new URL("../themes/ezmeo/EzmeoProductExplorer.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, change, click }) => {
    const previousFormData = globalThis.FormData;
    Object.assign(globalThis, { FormData: window.FormData });
    try {
    await render(React.createElement(Explorer, { selection, products: [], locale: "tr", total: 0, nextOffset: null, path: "/kategori/eriste", cardStyle: "editorial", imageRatio: "square" }));
    assert.ok(![...container.querySelectorAll("button")].some(b => b.textContent === "Uygula"));
    await change('select', 'price-asc');
    assert.deepEqual(pushes.at(-1), ["/kategori/eriste?sort=price-asc", { scroll: false }]);
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = "  fındık & kakao  ";
    await React.act(async () => input.form!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(pushes.at(-1), ["/kategori/eriste?q=f%C4%B1nd%C4%B1k+%26+kakao&sort=price-asc", { scroll: false }]);
    await click('button[data-filter="available"]');
    assert.ok(String(pushes.at(-1)).includes('filter=available'));
    } finally { Object.assign(globalThis, { FormData: previousFormData }); }
  });
});

test("Ezmeo compact choices hide stock counts and duplicate prices while keeping price, availability and cart selection authoritative", async () => {
  const calls: unknown[] = [];
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/cart/client.ts": { storefrontCartClient: {}, addCartLineAndOpenDrawer: async (input: unknown) => calls.push(input) },
    "@/lib/format.ts": { formatTry: (n: number) => String(n) },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "./CartStatusProvider": { useCartStatus: () => ({ visualTheme: "ezmeo-deniz", openDrawer() {}, replaceCart() {} }) },
    "./CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
    "@celebix/storefront-design-ui": { ProductDetailSummary: ({ product }: { product: { priceCents: number } }) => React.createElement("strong", { "data-main-price": true }, String(product.priceCents)) },
    "next/link": { __esModule: true, default: "a" },
  });
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { ProductPurchasePanel: Purchase } = load<{ ProductPurchasePanel: Component }>(new URL("./ProductPurchasePanel.tsx", import.meta.url));
  const { SelectedProductDetailSummary: Summary } = load<{ SelectedProductDetailSummary: Component }>(new URL("./SelectedProductDetailSummary.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Summary, { product, options: {}, classes: {} }), React.createElement(Purchase, { product, available: true })));
    assert.equal(container.querySelector("legend")?.textContent, "Gramaj");
    assert.deepEqual([...container.querySelectorAll('.purchase-variants b')].map(e => e.textContent), ["250 g", "500 g", "1 kg"]);
    assert.equal(container.querySelector('.purchase-variants strong'), null);
    assert.ok(!container.querySelector('.purchase-variants')?.textContent?.includes('211'));
    assert.equal(container.querySelector<HTMLInputElement>('input[value="1000"]')?.disabled, true);
    await click('input[value="500"]');
    assert.equal(container.querySelector('[data-main-price]')?.textContent, "19900");
    await click('.purchase-actions button');
    assert.deepEqual(calls, [{ productId: "ezmeo-product", variantId: "500", quantity: 1 }]);
  });
});

test("Ezmeo empty search shows a truthful empty state and returns to the locale's full catalog", async () => {
  const pushes: unknown[] = [];
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push: (...args: unknown[]) => pushes.push(args) }) },
    "../../components/CatalogProductList": { CatalogProductList: () => React.createElement("div", { "data-test-catalog": true }) },
    "../../components/CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
  });
  const { EzmeoProductExplorer: Explorer } = load<{ EzmeoProductExplorer: Component }>(new URL("../themes/ezmeo/EzmeoProductExplorer.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Explorer, { selection: { ...selection, query: "yok", filter: "available" }, products: [], locale: "en", total: 0, nextOffset: null, path: "/search", cardStyle: "editorial", imageRatio: "square" }));
    assert.equal(container.querySelector('.store-empty h2')?.textContent, "Ürün bulunamadı");
    assert.equal(container.querySelector('[data-test-catalog]'), null);
    assert.ok(!container.textContent?.includes("hazırlanıyor"));
    await click('.ez-catalog-empty button');
    assert.deepEqual(pushes.at(-1), ["/products"]);
  });
});

test("Ezmeo quick view honors quantity settings and hands the selected variant to the cart after closing", async () => {
  const order: string[] = [], calls: unknown[] = [];
  let container: HTMLElement;
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/cart/client.ts": { storefrontCartClient: { async add(input: unknown) { calls.push(input); order.push("add"); return { itemCount: 1 }; } } },
    "@/lib/format.ts": { formatTry: (n: number) => String(n) },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "./CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
    "./CartStatusProvider": { useCartStatus: () => ({ visualTheme: "ezmeo-deniz", drawerOpen: false, showQuantitySelector: false,
      async closeDrawerAndWait() { return true; }, replaceCart() { order.push("replace"); },
      openDrawer(trigger: HTMLElement) { assert.equal(container.querySelector('[data-ezmeo-quick-view]'), null); assert.equal(trigger, container.querySelector('.product-card-cart')); order.push("cart"); },
    }) },
    "../themes/siora/useSioraPanelHistory": { useSioraPanelHistory: ({ storefrontId }: { storefrontId: string }) => {
      assert.equal(storefrontId, "7892a771-67a9-42d7-9b36-f4c3e8562e95");
      return { open: () => true, async close() { order.push("history-close"); return true; } };
    } },
  });
  const { ProductQuickView: QuickView } = load<{ ProductQuickView: Component }>(new URL('./ProductQuickView.tsx', import.meta.url));
  await withProductBrowser(async browser => {
    container = browser.container;
    await browser.render(React.createElement(QuickView, { product }));
    await browser.click('.product-card-cart');
    assert.ok(container.querySelector('[data-ezmeo-quick-view]'));
    assert.equal(container.querySelector('.purchase-quantity'), null);
    assert.equal(container.querySelector('legend')?.textContent, "Gramaj");
    await browser.click('input[value="500"]');
    assert.equal(container.querySelector('.price strong')?.textContent, "19900");
    await browser.click('.purchase-actions button');
    await React.act(async () => { await new Promise(resolve => window.setTimeout(resolve, 10)); });
    assert.deepEqual(calls, [{ productId: "ezmeo-product", variantId: "500", quantity: 1 }]);
    assert.deepEqual(order, ["add", "replace", "history-close", "cart"]);
  });
});
