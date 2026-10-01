import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type PublicProduct } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const PRODUCT = "20000000-0000-4000-8000-000000000001";
const RED = "30000000-0000-4000-8000-000000000001";
const WHITE = "30000000-0000-4000-8000-000000000002";
const GREEN = "30000000-0000-4000-8000-000000000003";
const GENERAL = "40000000-0000-4000-8000-000000000001";
const FRONT = "40000000-0000-4000-8000-000000000002";
const BACK = "40000000-0000-4000-8000-000000000003";
const WHITE_COVER = "40000000-0000-4000-8000-000000000004";
const variant = { title: "Kırmızı / M", priceCents: 1000, available: true, stockTracking: true, stockQuantity: 10, attributes: {} };
const product: PublicProduct = {
  id: PRODUCT, slug: "ornek-urun", title: "Örnek ürün", currency: "TRY", status: "active", priceCents: 1000, available: true,
  variants: [{ ...variant, id: RED, mediaIds: [BACK, FRONT] }, { ...variant, title: "Beyaz / M", id: WHITE, mediaIds: [WHITE_COVER, FRONT] }, { ...variant, title: "Yeşil / M", id: GREEN, mediaIds: [GENERAL] }],
  media: [GENERAL, FRONT, BACK, WHITE_COVER].map((id, sortOrder) => ({ id, productId: PRODUCT, sortOrder, url: `https://media.example/${id}.webp`, mediaType: "image/webp", altText: "Ürün", width: 500, height: 600 })),
};
type Component = React.ComponentType<Record<string, unknown>>;

function loader(calls: unknown[]) {
  return componentLoader({
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "@/lib/cart/client.ts": { storefrontCartClient: { add() {} }, addCartLineAndOpenDrawer: async (input: unknown) => { calls.push(input); } },
    "@/lib/format.ts": { formatTry: (value: number) => `₺${value / 100}` },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "./CartStatusProvider": { useCartStatus: () => ({ openDrawer() {}, replaceCart() {} }) },
  });
}
const mainImage = (container: HTMLElement) => container.querySelector<HTMLImageElement>(".gallery-main img")?.getAttribute("src");

test("real variant radios change gallery order, retain a shared current image and send the selected variant to cart", async () => {
  const calls: unknown[] = [], load = loader(calls);
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { ProductGallery: Gallery } = load<{ ProductGallery: Component }>(new URL("./ProductGallery.tsx", import.meta.url));
  const { ProductPurchasePanel: Purchase } = load<{ ProductPurchasePanel: Component }>(new URL("./ProductPurchasePanel.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product }), React.createElement(Purchase, { product, available: true })));
    assert.equal(mainImage(container), `https://media.example/${BACK}.webp`);
    assert.deepEqual([...container.querySelectorAll(".gallery-thumbnails img")].map((image) => image.getAttribute("src")), [`https://media.example/${BACK}.webp`, `https://media.example/${FRONT}.webp`]);
    await click('.gallery-thumbnails button[aria-label="2. görseli göster"]');
    await click(`input[value="${WHITE}"]`);
    assert.equal(mainImage(container), `https://media.example/${FRONT}.webp`);
    assert.equal(container.querySelector('.gallery-thumbnails button[aria-current="true"]')?.getAttribute("aria-label"), "2. görseli göster");
    await click(".purchase-actions button");
    assert.deepEqual(calls, [{ productId: PRODUCT, variantId: WHITE, quantity: 1 }]);
    await click(`input[value="${GREEN}"]`);
    assert.equal(mainImage(container), `https://media.example/${GENERAL}.webp`);
    await click(`input[value="${RED}"]`);
    assert.equal(mainImage(container), `https://media.example/${BACK}.webp`);
  });
});

test("quick view variant selection changes its cover and purchases that same selected variant", async () => {
  const calls: unknown[] = [], load = loader(calls);
  const { ProductQuickView } = load<{ ProductQuickView: Component }>(new URL("./ProductQuickView.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(ProductQuickView, { product }));
    await click(".product-card-cart");
    assert.equal(container.querySelector(".media img")?.getAttribute("src"), `https://media.example/${BACK}.webp`);
    await click(`input[value="${WHITE}"]`);
    assert.equal(container.querySelector(".media img")?.getAttribute("src"), `https://media.example/${WHITE_COVER}.webp`);
    await click(".purchase-actions button");
    assert.deepEqual(calls, [{ productId: PRODUCT, variantId: WHITE, quantity: 1 }]);
  });
});

test("design preview uses the same variant gallery and retains a shared photo when the variant changes", async () => {
  const load = componentLoader();
  const { ProductDetailPreview } = load<{ ProductDetailPreview: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductDetailPresentation.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click, change }) => {
    await render(React.createElement(ProductDetailPreview, { product, options: createDefaultStarterThemeComposition().productDetail, cart: { showQuantitySelector: true }, mode: "desktop" }));
    const image = () => container.querySelector(".celebix-product-main-image")?.getAttribute("src");
    assert.equal(image(), `https://media.example/${BACK}.webp`);
    await click('.celebix-product-thumbnails button[aria-label="2. ürün görseli"]');
    await change("select", WHITE);
    assert.equal(image(), `https://media.example/${FRONT}.webp`);
    await change("select", GREEN);
    assert.equal(image(), `https://media.example/${GENERAL}.webp`);
  });
});
