import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type PublicProduct, type StorefrontCommercePolicy } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
const PRODUCT = "20000000-0000-4000-8000-000000000001";
const SMALL = "30000000-0000-4000-8000-000000000001";
const LARGE = "30000000-0000-4000-8000-000000000002";
const product: PublicProduct = {
  id: PRODUCT, slug: "controlled-price", title: "Controlled product", currency: "TRY", status: "active",
  priceCents: 20000, compareAtCents: 30000, available: true, media: [], brand: { name: "Controlled Brand", slug: "controlled-brand" },
  variants: [
    { id: SMALL, title: "500 g", sku: "SKU-500", priceCents: 39000, available: true, stockTracking: true, stockQuantity: 10, attributes: {} },
    { id: LARGE, title: "1000 g", sku: "SKU-1000", priceCents: 74000, compareAtCents: 99000, available: true, stockTracking: true, stockQuantity: 10, attributes: {} },
  ],
};
const money = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
const options = { ...createDefaultStarterThemeComposition().productDetail, showSku: true, showBrand: true };

function fixture(visualTheme?: string) {
  const calls: unknown[] = [];
  const empty = () => null;
  const summary = componentLoader()<{ ProductDetailSummary: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductDetailSummary.tsx", import.meta.url));
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "next/link": { __esModule: true, default: ({ children, ...props }: Record<string, unknown>) => React.createElement("a", props, children as React.ReactNode) },
    "@/lib/cart/client.ts": { storefrontCartClient: { async add(input: unknown) { calls.push(input); return { itemCount: 1 }; } }, addCartLineAndOpenDrawer: async (input: unknown) => { calls.push(input); } },
    "@/lib/format.ts": { formatTry: money },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "@/lib/public-product-ordering.ts": { availableProductsFirst: (items: unknown[]) => items },
    "@/lib/storefront-routes.ts": { categoryPath: (_locale: string, slug: string) => `/kategori/${slug}` },
    "@celebix/storefront-design-ui": summary,
    "./CartStatusProvider": { useCartStatus: () => ({ visualTheme, drawerOpen: false, async closeDrawerAndWait() { return true; }, openDrawer() {}, replaceCart() {} }) },
    "../themes/siora/useSioraPanelHistory": { useSioraPanelHistory: () => ({ open: () => true, async close() { return true; } }) },
    "./ProductGallery": { ProductGallery: empty },
    "./ProductInformationDisclosures": { ProductInformationDisclosures: empty, ProductSizeGuide: empty },
    "./ProductCard": { ProductCard: empty },
    "./ProductApprovedReviews": { ProductApprovedReviews: empty },
    "./RestockAlerts": { useRestockAlertsConfig: () => null, RestockSubscriptionForm: empty },
    "./WhatsAppOrderButton": { WhatsAppOrderButton: empty },
  });
  const { ProductDetailExperience: Detail } = load<{ ProductDetailExperience: Component }>(new URL("./ProductDetailExperience.tsx", import.meta.url));
  const { CommercePolicySnapshotProvider: Policy } = load<{ CommercePolicySnapshotProvider: Component }>(new URL("./CommercePolicyProvider.tsx", import.meta.url));
  const element = (value: PublicProduct = product, initialVariantId?: string) => React.createElement(Detail, {
    product: value, initialVariantId, locale: "tr", relatedProducts: [], publishedPolicies: [], options,
    cardStyle: "editorial", imageRatio: "portrait", showQuantitySelector: true,
  });
  return { calls, element, Policy, load };
}

test("real shared detail headline, discount and SKU follow the selected variant and its cart command", async () => {
  const { element, calls } = fixture();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(element());
    assert.equal(container.querySelector(".price strong")?.textContent, money(39000));
    assert.ok(!container.querySelector(".price del"), "the product minimum's discount must not leak into another variant");
    assert.match(container.querySelector(".sku")?.textContent ?? "", /SKU-500/);
    assert.equal(container.querySelector(".brand")?.getAttribute("href"), "/search?q=Controlled%20Brand");
    await click(`input[value="${LARGE}"]`);
    assert.equal(container.querySelector(".price strong")?.textContent, money(74000));
    assert.equal(container.querySelector(".price del")?.textContent, money(99000));
    assert.match(container.querySelector(".sku")?.textContent ?? "", /SKU-1000/);
    await click(".purchase-actions button");
    assert.deepEqual(calls, [{ productId: PRODUCT, variantId: LARGE, quantity: 1 }]);
    await click(`input[value="${SMALL}"]`);
    assert.equal(container.querySelector(".price strong")?.textContent, money(39000));
    assert.ok(!container.querySelector(".price del"));
  });
});

test("an explicit initial variant renders its own summary before any interaction", async () => {
  const { element } = fixture();
  await withProductBrowser(async ({ container, render }) => {
    await render(element(product, LARGE));
    assert.equal(container.querySelector(".price strong")?.textContent, money(74000));
    assert.equal(container.querySelector(".price del")?.textContent, money(99000));
    assert.match(container.querySelector(".sku")?.textContent ?? "", /SKU-1000/);
  });
});

test("a selected unknown or zero price never falls back to the product minimum or another discount", async () => {
  const { element } = fixture();
  await withProductBrowser(async ({ container, render, click }) => {
    const value = { ...product, variants: product.variants.map((variant, index) => ({ ...variant, priceCents: index ? 0 : null, compareAtCents: undefined })) };
    await render(element(value));
    assert.ok(!container.querySelector(".price"));
    await click(`input[value="${LARGE}"]`);
    assert.equal(container.querySelector(".price strong")?.textContent, money(0));
    assert.ok(!container.querySelector(".price del"));
  });
});

test("both live commerce policy and the public product privacy flag keep all selected prices hidden", async () => {
  const { element, Policy } = fixture();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(element({ ...product, pricesHidden: true }));
    await click(`input[value="${LARGE}"]`);
    assert.ok(!container.querySelector(".price"));
    assert.ok(!container.querySelector(".purchase-variants strong"));
    const policy: StorefrontCommercePolicy = { schemaVersion: 1, enabled: true, phone: "+905000000000", hidePrices: true, hideAddToCart: false, messageIntro: "Fixture", checkoutAllowed: false, version: 1 };
    await render(React.createElement(Policy, { policy }, element()));
    await click(`input[value="${LARGE}"]`);
    assert.ok(!container.querySelector(".price"));
    assert.ok(!container.querySelector(".purchase-variants strong"));
    assert.ok(!container.querySelector(".purchase-actions button.store-button-secondary"));
  });
});

test("standard and Alpler quick views display the selected price and only that variant's discount", async () => {
  for (const theme of [undefined, "alpler-deniz"]) {
    const { load, calls } = fixture(theme);
    const { ProductQuickView: QuickView } = load<{ ProductQuickView: Component }>(new URL("./ProductQuickView.tsx", import.meta.url));
    await withProductBrowser(async ({ container, render, click }) => {
      await render(React.createElement(QuickView, { product }));
      await click(".product-card-cart");
      assert.equal(container.querySelector(".price strong")?.textContent, money(39000), theme);
      assert.ok(!container.querySelector(".price del"));
      await click(`input[value="${LARGE}"]`);
      assert.equal(container.querySelector(".price strong")?.textContent, money(74000), theme);
      assert.equal(container.querySelector(".price del")?.textContent, money(99000), theme);
      await click(`input[value="${SMALL}"]`);
      assert.ok(!container.querySelector(".price del"));
      await click(`input[value="${LARGE}"]`);
      await click(".purchase-actions button");
      await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      assert.deepEqual(calls, [{ productId: PRODUCT, variantId: LARGE, quantity: 1 }]);
    });
  }
});

test("standard and Alpler quick views keep selected prices hidden by either privacy source", async () => {
  for (const theme of [undefined, "alpler-deniz"]) {
    const { load, Policy } = fixture(theme);
    const { ProductQuickView: QuickView } = load<{ ProductQuickView: Component }>(new URL("./ProductQuickView.tsx", import.meta.url));
    await withProductBrowser(async ({ container, render, click }) => {
      await render(React.createElement(QuickView, { product: { ...product, pricesHidden: true } }));
      await click(".product-card-cart");
      await click(`input[value="${LARGE}"]`);
      assert.ok(!container.querySelector(".price"));
      assert.ok(!container.querySelector(".purchase-variants strong"));
      const policy: StorefrontCommercePolicy = { schemaVersion: 1, enabled: true, phone: "+905000000000", hidePrices: true, hideAddToCart: false, messageIntro: "Fixture", checkoutAllowed: false, version: 1 };
      await render(React.createElement(Policy, { policy }, React.createElement(QuickView, { product })));
      await click(".product-card-cart");
      await click(`input[value="${LARGE}"]`);
      assert.ok(!container.querySelector(".price"));
      assert.ok(!container.querySelector(".purchase-variants strong"));
    });
  }
});
