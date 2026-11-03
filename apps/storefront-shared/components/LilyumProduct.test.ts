import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { buildDefaultStarterPresentation, createDefaultStarterThemeComposition, resolveStorefrontCommercePolicy, type PublicProduct, type StorefrontCommercePolicy } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { formatTry } from "../lib/format.ts";
import { isStorefrontPromotionActive } from "../../../packages/storefront-design-ui/src/model.ts";

type Component = React.ComponentType<Record<string, unknown>>;
const options = createDefaultStarterThemeComposition().productDetail;
const product: PublicProduct = {
  id: "20000000-0000-4000-8000-000000000001", slug: "pembe-lilyum", title: "Pembe Lilyum", currency: "TRY", status: "active", available: true, priceCents: 90000,
  brand: { name: "Lilyum Flora", slug: "lilyum-flora" }, description: "Admin ürün açıklaması",
  variants: [
    { id: "30000000-0000-4000-8000-000000000001", title: "Küçük buket", sku: "LIL-1", priceCents: 90000, compareAtCents: 110000, available: true, stockTracking: true, stockQuantity: 2, attributes: {}, mediaIds: ["40000000-0000-4000-8000-000000000001"] },
    { id: "30000000-0000-4000-8000-000000000002", title: "Büyük buket", sku: "LIL-2", priceCents: 150000, available: true, stockTracking: true, stockQuantity: 3, attributes: {}, mediaIds: ["40000000-0000-4000-8000-000000000002"] },
    { id: "30000000-0000-4000-8000-000000000003", title: "Özel buket", priceCents: 200000, available: false, stockTracking: true, stockQuantity: 0, attributes: {} },
  ],
  media: [1, 2].map((value, sortOrder) => ({ id: `40000000-0000-4000-8000-00000000000${value}`, productId: "20000000-0000-4000-8000-000000000001", url: `https://media.example/flower-${value}.webp`, sortOrder, width: 600, height: 600, mediaType: "image/webp", altText: "Çiçek" })),
};

function setup(add?: (input: unknown) => Promise<unknown>, policy?: StorefrontCommercePolicy) {
  const calls: unknown[] = [], routes: string[] = [];
  const load = componentLoader({
    ...(policy ? { "../../components/CommercePolicyProvider": { useCommercePolicy: () => policy }, "./CommercePolicyProvider": { useCommercePolicy: () => policy } } : {}),
    "next/link": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push: (route: string) => routes.push(route) }) },
    "@/lib/format.ts": { formatTry },
    "@/lib/cart/client.ts": { storefrontCartClient: { async add(input: unknown) { calls.push(input); return add ? add(input) : { itemCount: 1 }; } }, addCartLineAndOpenDrawer: async (input: unknown, trigger: HTMLElement, dependencies: { add(input: unknown): Promise<unknown>; replaceCart(cart: unknown): void; openDrawer(trigger: HTMLElement): void }) => { dependencies.replaceCart(await dependencies.add(input)); dependencies.openDrawer(trigger); } },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ drawerOpen: false, openDrawer() {}, replaceCart() {} }) },
    "../../components/FavoriteButton": { FavoriteButton: () => null },
  });
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { ProductGallery: Gallery } = load<{ ProductGallery: Component }>(new URL("./ProductGallery.tsx", import.meta.url));
  const { LilyumProductPurchase: Purchase } = load<{ LilyumProductPurchase: Component }>(new URL("../themes/lilyum/LilyumProductPurchase.tsx", import.meta.url));
  return { calls, routes, tree: (item = product, settings = options, quantity = true) => React.createElement(Provider, { product: item }, React.createElement(Gallery, { product: item }), React.createElement(Purchase, { product: item, options: settings, showQuantitySelector: quantity })) };
}

test("Lilyum variant changes update actual media, price and SKU and bound the selected cart quantity", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(subject.tree());
    assert.equal(container.querySelector(".lf-purchase-price strong")?.textContent, "₺900,00");
    await click('button[aria-label="Adedi artır"]');
    assert.equal(container.querySelector('button[aria-label="Adedi artır"]')?.hasAttribute("disabled"), true);
    await click(`input[value="${product.variants[1].id}"]`);
    assert.equal(container.querySelector(".gallery-main img")?.getAttribute("src"), "https://media.example/flower-2.webp");
    assert.equal(container.querySelector(".lf-purchase-price strong")?.textContent, "₺1.500,00");
    assert.equal(container.querySelector(".lf-purchase-price del"), null);
    assert.match(container.querySelector(".lf-product-sku")?.textContent ?? "", /LIL-2/);
    assert.equal(container.querySelector('output[aria-label="Adet"]')?.textContent, "1");
    assert.equal(container.querySelector(`input[value="${product.variants[2].id}"]`)?.hasAttribute("disabled"), true);
    await click('button[aria-label="Adedi artır"]'); await click('button[aria-label="Adedi artır"]');
    await click('.lf-purchase-actions button');
    assert.deepEqual(subject.calls, [{ productId: product.id, variantId: product.variants[1].id, quantity: 3 }]);
    assert.equal(container.querySelector('[role="status"]')?.textContent, "Ürün sepete eklendi.");
  });
});

test("Lilyum groups WhatsApp ordering with quantity and hides a single standard option without hiding real choices", async () => {
  const policy = resolveStorefrontCommercePolicy({ schemaVersion: 1, enabled: true, phone: "+905551112233", hidePrices: false, hideAddToCart: true, messageIntro: "Merhaba" });
  const subject = setup(undefined, policy);
  const standard = { ...product, variants: [{ ...product.variants[0], title: "Standart", stockQuantity: 5 }] };
  await withProductBrowser(async ({ container, render, click }) => {
    await render(subject.tree(standard));
    const order = container.querySelector('.lf-product-order[data-order-mode="whatsapp"]');
    assert.ok(order?.querySelector('[aria-label="Adet seçimi"]'));
    assert.ok(order?.querySelector('.whatsapp-order-action .lf-whatsapp-button'));
    assert.equal(container.querySelector('.lf-product-choices'), null);
    assert.equal(container.querySelector('[data-purchase-action]'), null);
    await click('button[aria-label="Adedi artır"]');
    assert.equal(container.querySelector('output[aria-label="Adet"]')?.textContent, "2");
    await render(subject.tree(standard, options, false));
    assert.ok(container.querySelector('.lf-product-order[data-quantity-hidden="true"] .lf-whatsapp-button'));
    assert.equal(container.querySelector('[aria-label="Adet seçimi"]'), null);
    await render(subject.tree({ ...product, variants: [standard.variants[0], product.variants[1]] }));
    assert.equal(container.querySelectorAll('.lf-product-choices input').length, 2);
    assert.ok(container.querySelector('.lf-product-choices')?.textContent?.includes("Büyük buket"));
    assert.deepEqual(subject.calls, []);
    assert.deepEqual(subject.routes, []);
  });
});

test("Lilyum shows the mobile purchase bar only while the main ordering controls are outside view", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render }) => {
    let visibility: IntersectionObserverCallback = () => {};
    let observed: Element | null = null;
    let disconnected = 0;
    window.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe(element: Element) { observed = element; }
      disconnect() { disconnected += 1; }
    } as unknown as typeof IntersectionObserver;
    await render(subject.tree(product, { ...options, mobileStickyPurchase: true }));
    const sticky = container.querySelector<HTMLElement>('[data-lilyum-sticky-purchase]')!;
    assert.equal(observed, container.querySelector('.lf-product-order'));
    assert.equal(sticky.hidden, false);
    await React.act(async () => visibility([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(sticky.hidden, true);
    await React.act(async () => visibility([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(sticky.hidden, false);
    await render(React.createElement("p", null, "Başka sayfa"));
    assert.equal(disconnected, 1);
  });
});

test("Lilyum respects hidden admin quantity/brand/SKU settings and hides only meaningless default choices", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    const item = { ...product, variants: [{ ...product.variants[0], title: "Varsayilan Varyant" }] };
    await render(subject.tree(item, { ...options, showBrand: false, showSku: false, mobileStickyPurchase: false }, false));
    assert.equal(container.querySelector("fieldset"), null);
    assert.equal(container.querySelector('[aria-label="Adet seçimi"]'), null);
    assert.equal(container.querySelector(".lf-product-brand"), null);
    assert.equal(container.querySelector(".lf-product-sku"), null);
    assert.equal(container.querySelector("[data-lilyum-sticky-purchase]"), null);
    await click('.lf-purchase-actions button:last-child');
    assert.deepEqual(subject.calls, [{ productId: product.id, variantId: item.variants[0].id, quantity: 1 }]);
    assert.deepEqual(subject.routes, ["/checkout"]);
  });
});

test("Lilyum unavailable products cannot enter either purchase flow", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(subject.tree({ ...product, available: false }));
    assert.equal(container.querySelectorAll('.lf-purchase-actions button:not(:disabled)').length, 0);
    await click('.lf-purchase-actions button');
    assert.deepEqual(subject.calls, []);
  });
});

test("Lilyum gallery prioritizes the visible photo and defers later photos without changing source assets", async () => {
  const load = componentLoader();
  const { ProductGallery: Gallery } = load<{ ProductGallery: Component }>(new URL("./ProductGallery.tsx", import.meta.url));
  const item = { ...product, variants: [] };
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Gallery, { product: item, optimizeLoading: true }));
    assert.equal(container.querySelector(".gallery-main img")?.getAttribute("fetchpriority"), "high");
    assert.equal(container.querySelector(".gallery-main img")?.getAttribute("decoding"), "async");
    assert.equal(container.querySelector(".gallery-mobile-track button:first-child img")?.getAttribute("loading"), "eager");
    assert.equal(container.querySelector(".gallery-mobile-track button:last-child img")?.getAttribute("loading"), "lazy");
    assert.equal(container.querySelector(".gallery-thumbnails img")?.getAttribute("loading"), "lazy");
    await click(".gallery-mobile-track button:last-child");
    assert.equal(container.querySelector(".gallery-zoom-dialog img")?.getAttribute("src"), product.media[1].url);
    await render(React.createElement(Gallery, { product: item }));
    assert.equal(container.querySelector(".gallery-main img")?.getAttribute("fetchpriority"), null);
    assert.equal(container.querySelector(".gallery-mobile-track button:last-child img")?.getAttribute("loading"), null);
  });
});

test("Lilyum home uses smaller copies of known assets and preserves a replacement published by the admin", async () => {
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
    "../../components/CampaignSectionContent": { CampaignSectionContent: () => null },
    "@celebix/storefront-design-ui": { isStorefrontPromotionActive },
  });
  const { LilyumHomeContent: Home } = load<{ LilyumHomeContent: Component }>(new URL("../themes/lilyum/LilyumHomeContent.tsx", import.meta.url));
  const category = "https://media.saas-staging.celebix.site/stores/89e1e15f-8282-4e9b-ae3e-f417501bd54a/storefront/category/38dea7f7-ee2a-50de-9793-1f430e3af96b.png";
  const base = buildDefaultStarterPresentation({ name: "Lilyum" });
  const presentation = { ...base, schemaVersion: 3, sections: [{ kind: "banner", slides: [{ enabled: true, headline: "Lilyum", desktopImage: { url: "https://media.example/e89e5b56-0c5a-5a96-b33d-4daf6234c84c.jpg" }, destination: "/products" }] }, { kind: "category_grid", heading: "Çiçekler", items: [{ name: "Orkideler", slug: "orkideler", image: { url: category, altText: "Yayınlanmış orkide", width: 850, height: 850 } }, { name: "Yeni çiçek", slug: "yeni", image: { url: "https://media.example/admin-replacement.webp", altText: "Yeni admin görseli" } }] }] };
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Home, { storefront: { locale: "tr" }, design: { publicationVersion: 1, promotion: { enabled: false } }, projection: { presentation, productRows: [] }, renderProductCards: () => null, renderProductRow: () => null, assetBaseUrl: "https://lilyumflora.net" }));
    const known = container.querySelector('.lf-collection img[alt="Yayınlanmış orkide"]');
    assert.equal(known?.getAttribute("src"), category);
    assert.match(known?.getAttribute("srcset") ?? "", /https:\/\/lilyumflora\.net\/themes\/lilyum\/optimized\/.+-320\.webp 320w/);
    assert.match(known?.getAttribute("sizes") ?? "", /760px/);
    const replacement = container.querySelector('.lf-collection img[alt="Yeni admin görseli"]');
    assert.equal(replacement?.getAttribute("src"), "https://media.example/admin-replacement.webp");
    assert.equal(replacement?.getAttribute("srcset"), null);
    assert.match(container.querySelector(".lf-hero img")?.getAttribute("srcset") ?? "", /1440\.webp 1440w/);
    assert.equal(container.querySelector(".lf-hero img")?.getAttribute("fetchpriority"), "high");
  });
});

test("Lilyum pending buy is single-flight and cannot redirect a visitor who already left the product", async () => {
  let finish: (cart: unknown) => void = () => {};
  const subject = setup(() => new Promise(resolve => { finish = resolve; }));
  await withProductBrowser(async ({ render, click }) => {
    await render(subject.tree());
    await click('.lf-purchase-actions button:last-child');
    await click('.lf-purchase-actions button:last-child');
    assert.equal(subject.calls.length, 1);
    await render(React.createElement("p", null, "Başka sayfa"));
    await React.act(async () => finish({ itemCount: 1 }));
    assert.deepEqual(subject.routes, []);
  });
});
