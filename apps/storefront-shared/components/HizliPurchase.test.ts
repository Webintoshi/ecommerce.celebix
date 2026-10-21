import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type PublicProduct } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { formatTry } from "../lib/format.ts";

const product: PublicProduct = { id: "20000000-0000-4000-8000-000000000001", slug: "test-kutu", title: "Kontrol ürünü", priceCents: 450000, status: "active", available: true, currency: "TRY", media: [], variants: [
  { id: "30000000-0000-4000-8000-000000000001", title: "28 cm / 250 adet", sku: "K-250", priceCents: 450000, available: true, stockTracking: true, stockQuantity: 2, attributes: { "Ölçü": "28 cm", "Paket içi adet": "250" } },
  { id: "30000000-0000-4000-8000-000000000002", title: "30 cm / 500 adet", sku: "K-500", priceCents: 800000, available: true, stockTracking: true, stockQuantity: 3, attributes: { "Ölçü": "30 cm", "Paket içi adet": "500" } },
  { id: "30000000-0000-4000-8000-000000000003", title: "33 cm / 500 adet", priceCents: 900000, available: false, stockTracking: true, stockQuantity: 0, attributes: {} },
] };
const options = createDefaultStarterThemeComposition().productDetail;
function subject() {
  const calls: unknown[] = [], routes: string[] = [];
  const load = componentLoader({
    "next/link": { __esModule: true, default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props) },
    "next/navigation": { useRouter: () => ({ push: (href: string) => routes.push(href) }) },
    "@/lib/format.ts": { formatTry },
    "@/lib/cart/client.ts": { storefrontCartClient: { async add(input: unknown) { calls.push(input); return { itemCount: 1 }; } }, addCartLineAndOpenDrawer: async (input: unknown, trigger: HTMLElement, ports: { add(input: unknown): Promise<unknown>; replaceCart(cart: unknown): void; openDrawer(trigger: HTMLElement): void }) => { ports.replaceCart(await ports.add(input)); ports.openDrawer(trigger); } },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ drawerOpen: false, openDrawer() {}, replaceCart() {} }) },
    "../../components/FavoriteButton": { FavoriteButton: () => null },
  });
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: React.ComponentType<any> }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { HizliProductPurchase: Purchase } = load<{ HizliProductPurchase: React.ComponentType<any> }>(new URL("../themes/hizli-kutu/HizliProductPurchase.tsx", import.meta.url));
  return { calls, routes, tree: (settings = options, quantity = true) => React.createElement(Provider, { product }, React.createElement(Purchase, { product, options: settings, showQuantitySelector: quantity })) };
}
test("pack choice updates real price and SKU, resets quantity, and adds only the selected variant", async () => {
  const s = subject();
  await withProductBrowser(async ({ container, render, click, change }) => {
    await render(s.tree());
    assert.equal(container.querySelector(".hk-unit-price")?.textContent, `${formatTry(1800)} / adet`);
    await click('[aria-label="Adedi artır"]');
    assert.equal(container.querySelector('[aria-label="Adedi artır"]')?.hasAttribute("disabled"), true);
    await change('select', product.variants[1].id);
    assert.equal(container.querySelector('output[aria-label="Sipariş adedi"]')?.textContent, "1");
    assert.match(container.querySelector('.hk-product-sku')?.textContent ?? "", /K-500/);
    assert.equal(container.querySelector('.hk-total strong')?.textContent, formatTry(800000));
    assert.equal(container.querySelector(`option[value="${product.variants[2].id}"]`)?.hasAttribute("disabled"), true);
    assert.doesNotMatch(container.textContent ?? "", /2 adet stok|3 adet stok|KDV|Minimum/u);
    await click('[aria-label="Adedi artır"]');
    await click('.hk-purchase-actions button');
    assert.deepEqual(s.calls, [{ productId: product.id, variantId: product.variants[1].id, quantity: 2 }]);
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /sepete eklendi/u);
  });
});
test("buy now goes directly to shared checkout and respects hidden admin quantity and SKU settings", async () => {
  const s = subject();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(s.tree({ ...options, showSku: false, mobileStickyPurchase: false }, false));
    assert.equal(container.querySelector('.hk-product-sku'), null);
    assert.equal(container.querySelector('[aria-label="Sipariş adedi seçimi"]'), null);
    assert.equal(container.querySelector('.hk-purchase-sticky'), null);
    await click('.hk-purchase-actions button:last-child');
    assert.deepEqual(s.routes, ['/checkout']);
    assert.deepEqual(s.calls, [{ productId: product.id, variantId: product.variants[0].id, quantity: 1 }]);
  });
});
