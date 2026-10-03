import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type PublicProduct } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { formatTry } from "../lib/format.ts";

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

function setup(add?: (input: unknown) => Promise<unknown>) {
  const calls: unknown[] = [], routes: string[] = [];
  const load = componentLoader({
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
