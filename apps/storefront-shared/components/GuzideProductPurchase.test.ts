import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { buildDefaultStarterPresentation, type PublicCart, type PublicProduct, type StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { addCartLineAndOpenDrawer } from "../lib/cart/client.ts";
import { formatTry } from "../lib/format.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];
type AddInput = Readonly<{ productId: string; variantId: string; quantity: number }>;
type CommerceEvent = Readonly<{ name: string; data: AddInput & { valueMinor: number } }>;
const PRODUCT = "f51508fe-4ab3-4e9c-9dd9-c1130be59e1c";
const DEFAULT = "998dce64-cec8-4e23-a95a-d8a51bde42a8";
const ALTERNATIVE = "96100000-0000-4000-8000-000000000002";
const UNAVAILABLE = "96100000-0000-4000-8000-000000000003";
const product: PublicProduct = {
  id: PRODUCT, slug: "14-ayar-altin-tasli-dugum-kolye-960", title: "14 Ayar Altın Taşlı Düğüm Kolye 960",
  brand: { name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" },
  currency: "TRY", status: "active", available: true, priceCents: 3148200, compareAtCents: 5000000,
  variants: [
    { id: DEFAULT, title: "Varsayılan", sku: "KLY-960", priceCents: 3148200, compareAtCents: 3500000, stockTracking: true, stockQuantity: 3, available: true, attributes: { birim: "Adet", kdv: "0.18" } },
    { id: ALTERNATIVE, title: "45 cm", sku: "KLY-960-45", priceCents: 3280200, stockTracking: true, stockQuantity: 2, available: true, attributes: { uzunluk: "45 cm" } },
    { id: UNAVAILABLE, title: "50 cm", sku: "KLY-960-50", priceCents: 3399000, stockTracking: true, stockQuantity: 0, available: false, attributes: { uzunluk: "50 cm" } },
  ],
  media: [],
};
const options = buildDefaultStarterPresentation({ name: "Güzide Kuyumcu" }).productDetail;
const snapshot: PublicCart = { version: 1, currency: "TRY", itemCount: 1, subtotalCents: 3148200, shippingCents: 0, totalCents: 3148200, checkoutReady: false, checkoutBlocker: "payment_unavailable", items: [{ productId: PRODUCT, variantId: DEFAULT, slug: product.slug, title: product.title, variantTitle: "Varsayılan", quantity: 1, unitPriceCents: 3148200, lineTotalCents: 3148200, available: true }] };

function deferredCart() {
  let resolve!: (value: PublicCart) => void;
  const promise = new Promise<PublicCart>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function link({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return React.createElement("a", props, children);
}

async function withPurchase(run: (context: Browser & { calls: AddInput[]; events: CommerceEvent[]; order: string[]; replaced: PublicCart[] }) => Promise<void>, config: Readonly<{
  product?: PublicProduct;
  options?: StarterProductDetailConfigV2;
  quantity?: boolean;
  add?: (input: AddInput) => Promise<PublicCart>;
}> = {}) {
  const calls: AddInput[] = [], events: CommerceEvent[] = [], order: string[] = [], replaced: PublicCart[] = [];
  const add = async (input: AddInput) => { calls.push(input); order.push("add"); return config.add ? config.add(input) : snapshot; };
  const load = componentLoader({
    "next/link": { __esModule: true, default: link },
    "next/navigation": { useRouter: () => ({ push(path: string) { order.push(`push:${path}`); } }) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ drawerOpen: false, openDrawer() { order.push("drawer"); }, replaceCart(value: PublicCart) { replaced.push(value); order.push("replace"); } }) },
    "../../components/FavoriteButton": { FavoriteButton: () => null },
    "@/lib/format.ts": { formatTry },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent(event: CommerceEvent) { events.push(event); order.push(`event:${event.name}`); } },
    "@/lib/cart/client.ts": { storefrontCartClient: { add }, addCartLineAndOpenDrawer },
  });
  const { GuzideProductPurchase: Purchase } = load<{ GuzideProductPurchase: Component }>(new URL("../themes/guzide/GuzideProductPurchase.tsx", import.meta.url));
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const subject = config.product ?? product;
  await withProductBrowser(async (browser) => {
    await browser.render(React.createElement(Provider, { product: subject }, React.createElement(Purchase, { product: subject, options: { ...options, mobileStickyPurchase: false, ...config.options }, showQuantitySelector: config.quantity ?? true })));
    await run({ ...browser, calls, events, order, replaced });
  });
}

test("Güzide variant selection resets quantity, displays its own price and purchases its canonical ID", async () => {
  await withPurchase(async ({ container, click, calls, events }) => {
    assert.equal(container.querySelector(".price strong")?.textContent, formatTry(3148200));
    assert.equal(container.querySelector(".price del")?.textContent, formatTry(3500000));
    await click('button[aria-label="Adedi artır"]');
    await click('button[aria-label="Adedi artır"]');
    assert.equal(container.querySelector("output")?.textContent, "3");
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="Adedi artır"]')?.disabled, true);
    await click(`input[value="${ALTERNATIVE}"]`);
    assert.equal(container.querySelector("output")?.textContent, "1");
    assert.equal(container.querySelector(".price strong")?.textContent, formatTry(3280200));
    assert.equal(container.querySelector(".price del"), null, "the product-level comparison price must not leak onto another variant");
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="Adedi azalt"]')?.disabled, true);
    assert.equal(container.querySelector<HTMLInputElement>(`input[value="${UNAVAILABLE}"]`)?.disabled, true);
    await click('button[aria-label="Adedi artır"]');
    await click(".actions button:first-child");
    assert.deepEqual(calls, [{ productId: PRODUCT, variantId: ALTERNATIVE, quantity: 2 }]);
    assert.equal(events[0]?.data.variantId, ALTERNATIVE);
    assert.equal(events[0]?.data.valueMinor, 6560400);
  });
});

test("Güzide purchase hides equal or lower comparison amounts instead of presenting a false discount", async () => {
  for (const compareAtCents of [3148200, 1000]) {
    await withPurchase(async ({ container }) => {
      assert.equal(container.querySelector(".price strong")?.textContent, formatTry(3148200));
      assert.equal(container.querySelector(".price del"), null);
    }, { product: { ...product, variants: [{ ...product.variants[0]!, compareAtCents }] } });
  }
});

for (const kind of ["add", "buy"] as const) {
  test(`Güzide ${kind} serializes same-frame repeated and competing clicks before React disables the buttons`, async () => {
    const request = deferredCart();
    await withPurchase(async ({ container, calls, events, order, replaced }) => {
      const add = container.querySelector<HTMLButtonElement>(".actions button:first-child")!;
      const buy = container.querySelector<HTMLButtonElement>(".actions button:nth-child(2)")!;
      await React.act(async () => {
        const selected = kind === "add" ? add : buy;
        selected.click(); selected.click(); (kind === "add" ? buy : add).click();
      });
      assert.deepEqual(calls, [{ productId: PRODUCT, variantId: DEFAULT, quantity: 1 }]);
      assert.equal(add.disabled, true);
      assert.equal(buy.disabled, true);
      assert.equal(container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled, true);
      assert.equal(events.length, 0);
      assert.deepEqual(order, kind === "add" ? ["drawer", "add"] : ["add"]);
      await React.act(async () => request.resolve(snapshot));
      assert.deepEqual(replaced, [snapshot]);
      assert.deepEqual(order, kind === "add"
        ? ["drawer", "add", "replace", "event:add_to_cart"]
        : ["add", "replace", "event:add_to_cart", "event:begin_checkout", "push:/checkout"]);
      assert.equal(events[0]?.data.valueMinor, 3148200);
      assert.equal(add.disabled, false);
      assert.equal(buy.disabled, false);
    }, { add: () => request.promise });
  });
}

test("Güzide pending buy reconciles canonical cart but cannot navigate after the URL query changes", async () => {
  const request = deferredCart();
  await withPurchase(async ({ click, calls, order, replaced, events }) => {
    await click(`input[value="${ALTERNATIVE}"]`);
    await click(".actions button:nth-child(2)");
    window.history.pushState({}, "", `${window.location.pathname}?view=collection`);
    await React.act(async () => request.resolve(snapshot));
    assert.deepEqual(calls, [{ productId: PRODUCT, variantId: ALTERNATIVE, quantity: 1 }]);
    assert.deepEqual(replaced, [snapshot]);
    assert.deepEqual(order, ["add", "replace", "event:add_to_cart"]);
    assert.equal(events.some(({ name }) => name === "begin_checkout"), false);
  }, { add: () => request.promise });
});

test("Güzide pending add cannot write success status onto a different mounted URL", async () => {
  const request = deferredCart();
  await withPurchase(async ({ container, click, replaced }) => {
    await click(".actions button:first-child");
    window.history.pushState({}, "", "/products/another-product");
    await React.act(async () => request.resolve(snapshot));
    assert.deepEqual(replaced, [snapshot]);
    assert.equal(container.querySelector('[role="status"]')?.textContent, "");
  }, { add: () => request.promise });
});

test("Güzide admin flags hide optional purchase controls and a sold-out default variant cannot mutate", async () => {
  const single = { ...product, variants: [{ ...product.variants[0]!, available: false, stockQuantity: 0 }], available: false };
  await withPurchase(async ({ container, click, calls }) => {
    assert.equal(container.querySelector(".brand"), null);
    assert.equal(container.querySelector(".sku"), null);
    assert.equal(container.querySelector(".quantity"), null);
    assert.equal(container.querySelector("fieldset"), null, "a default variant must not become a synthetic option list");
    assert.equal(container.querySelector("[data-guzide-sticky-purchase]"), null);
    assert.ok([...container.querySelectorAll<HTMLButtonElement>(".actions button")].every((button) => button.disabled));
    await click(".actions button:first-child");
    await click(".actions button:nth-child(2)");
    assert.deepEqual(calls, []);
  }, { product: single, quantity: false, options: { ...options, showBrand: false, showSku: false, mobileStickyPurchase: false } });
});

test("Güzide sticky trigger stays mounted while the real cart provider hides it and restores focus after closing", async () => {
  type CartStatus = { drawerOpen: boolean; closeDrawerAndWait(): Promise<boolean> };
  let useCartStatus!: () => CartStatus;
  function Drawer() {
    const state = useCartStatus();
    const closeRef = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => { if (state.drawerOpen) closeRef.current?.focus(); }, [state.drawerOpen]);
    return state.drawerOpen ? React.createElement("button", { ref: closeRef, "data-test-drawer-close": "true", onClick: () => void state.closeDrawerAndWait() }, "Sepeti kapat") : null;
  }
  const load = componentLoader({
    "next/link": { __esModule: true, default: link },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "../../components/FavoriteButton": { FavoriteButton: () => null },
    "./SideCartDrawer": { SideCartDrawer: Drawer },
    "./use-hydrated": { useHydrated: () => true },
    "../themes/siora/useSioraPanelHistory": { useSioraPanelHistory: () => ({}) },
    "@/lib/format.ts": { formatTry },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent() {} },
    "@/lib/cart/client.ts": { storefrontCartClient: { async resolve() { return snapshot; }, async add() { return snapshot; } }, addCartLineAndOpenDrawer },
  });
  const { CartStatusProvider: CartProvider, useCartStatus: useStatus } = load<{ CartStatusProvider: Component; useCartStatus: () => CartStatus }>(new URL("./CartStatusProvider.tsx", import.meta.url));
  useCartStatus = useStatus;
  const { ProductVariantMediaProvider: VariantProvider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { GuzideProductPurchase: Purchase } = load<{ GuzideProductPurchase: Component }>(new URL("../themes/guzide/GuzideProductPurchase.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render, click }) => {
    const originalFrame = window.requestAnimationFrame;
    const frames: FrameRequestCallback[] = [];
    window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    try {
      await render(React.createElement(CartProvider, { locale: "tr", visualTheme: "guzide-deniz" }, React.createElement(VariantProvider, { product }, React.createElement(Purchase, { product, options: { ...options, mobileStickyPurchase: true }, showQuantitySelector: false }))));
      const sticky = container.querySelector<HTMLDivElement>("[data-guzide-sticky-purchase]")!;
      const trigger = sticky.querySelector<HTMLButtonElement>("button")!;
      assert.equal(sticky.hidden, false);
      await React.act(async () => trigger.focus());
      await click("[data-guzide-sticky-purchase] button");
      assert.equal(sticky.hidden, true);
      assert.equal(trigger.isConnected, true);
      assert.equal(container.querySelector("[data-guzide-sticky-purchase] button"), trigger);
      assert.equal(document.activeElement, container.querySelector("[data-test-drawer-close]"));
      await click("[data-test-drawer-close]");
      assert.equal(sticky.hidden, false);
      assert.equal(container.querySelector("[data-guzide-sticky-purchase] button"), trigger);
      await React.act(async () => frames.splice(0).forEach((callback) => callback(0)));
      assert.equal(document.activeElement, trigger, "the original connected, visible mobile trigger receives provider focus restoration");
    } finally { window.requestAnimationFrame = originalFrame; }
  });
});
