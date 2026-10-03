import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type PublicProduct, type PublicProductVariant } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type AddInput = Readonly<{ productId: string; variantId: string; quantity: number }>;
type Component = React.ComponentType<Record<string, unknown>>;
type CommerceEvent = { name: string; data: { variantId: string; quantity: number; valueMinor: number } };
type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];

const productId = "20000000-0000-4000-8000-000000000001";
const variant = (id: string, color: string, size: string, available = true, priceCents = 3500): PublicProductVariant => ({ id, title: `${color} / ${size}`, attributes: { color, size }, available, priceCents, stockTracking: true, stockQuantity: available ? 2 : 0, mediaIds: [color] });
const product: PublicProduct = {
  id: productId, slug: "denim", title: "Denim takım", currency: "TRY", status: "active", available: true, priceCents: 3500,
  variants: [variant("brown-small", "kahve", "Small"), variant("brown-medium", "kahve", "Medium", true, 3700), variant("brown-large", "kahve", "Large", false), variant("blue-small", "mavi", "Small", true, 3900), variant("blue-medium", "mavi", "Medium", false), variant("black-medium", "siyah", "Medium", true, 4500), variant("white-s", "beyaz", "S", true, 4600), variant("white-large", "beyaz", "Large", true, 4600)],
  media: ["kahve", "mavi", "siyah", "beyaz"].map((id, sortOrder) => ({ id, productId, url: `https://media.example/${id}.webp`, mediaType: "image/webp", altText: "Denim", sortOrder })),
};

function installDialogBehavior() {
  const prototype = window.HTMLDialogElement.prototype;
  if (typeof prototype.showModal !== "function") prototype.showModal = function () { this.setAttribute("open", ""); };
  if (typeof prototype.close !== "function") prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
}

async function withPurchase(run: (context: Browser & { calls: AddInput[]; events: CommerceEvent[]; order: string[]; replaced: unknown[] }) => Promise<void>, config: Readonly<{ quantity?: boolean; add?: (input: AddInput) => Promise<unknown>; initialVariantId?: string; deferDrawer?: boolean; product?: PublicProduct; guide?: {heading: string; body: React.ReactNode} }> = {}) {
  const calls: AddInput[] = [], events: CommerceEvent[] = [], order: string[] = [], replaced: unknown[] = [];
  const snapshot = { itemCount: 1 };
  const add = async (input: AddInput) => { calls.push(input); order.push("add"); return config.add ? config.add(input) : snapshot; };
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push(path: string) { order.push(`push:${path}`); }, back() {} }), usePathname: () => "/products/denim" },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ cart: snapshot, drawerOpen: false, openDrawer() { order.push("drawer"); }, replaceCart(value: unknown) { replaced.push(value); order.push("replace"); } }) },
    "../../components/FavoriteButton": { FavoriteButton: () => null },
    "../../components/use-hydrated": { useHydrated: () => true },
    "./useCatalogScrollRestoration": { useCatalogScrollRestoration() {}, sioraCatalogReturnRoute: () => null },
    "@/lib/storefront-routes.ts": { productIndexPath: () => "/products" },
    "@/lib/format.ts": { formatTry: (value: number) => `₺${value / 100}` },
    "@/lib/analytics/events.ts": { emitStorefrontCommerceEvent(event: CommerceEvent) { events.push(event); order.push(`event:${event.name}`); } },
    "@/lib/cart/client.ts": { storefrontCartClient: { add }, async addCartLineAndOpenDrawer(input: AddInput, trigger: HTMLElement, dependencies: { add(input: AddInput): Promise<unknown>; openDrawer(trigger: HTMLElement): void; replaceCart(value: unknown): void }) { if (!config.deferDrawer) dependencies.openDrawer(trigger); const cart = await dependencies.add(input); dependencies.replaceCart(cart); if (config.deferDrawer) dependencies.openDrawer(trigger); return cart; } },
  });
  const { SioraProductPurchase: Purchase } = load<{ SioraProductPurchase: Component }>(new URL("../themes/siora/SioraProductPurchase.tsx", import.meta.url));
  const { ProductVariantMediaProvider: Provider } = load<{ ProductVariantMediaProvider: Component }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  await withProductBrowser(async (browser) => {
    installDialogBehavior();
    const subject = config.product ?? product;
    await browser.render(React.createElement(Provider, { product: subject, initialVariantId: config.initialVariantId }, React.createElement(Purchase, { product: subject, storefrontId: "store", locale: "tr", options: { ...createDefaultStarterThemeComposition().productDetail, mobileStickyPurchase: false }, showQuantitySelector: config.quantity ?? false, sizeGuide: config.guide?.body, sizeGuideHeading: config.guide?.heading })));
    await run({ ...browser, calls, events, order, replaced });
  });
}

const choose = async (browser: Browser, label: string) => {
  await browser.click(".selector");
  const buttons = [...browser.container.querySelectorAll<HTMLButtonElement>(".optionList button")];
  const button = buttons.find((item) => item.querySelector("span")?.textContent === label);
  assert.ok(button, `option ${label} exists`);
  await React.act(async () => button.click());
};

test("add asks for an explicit size and never auto-adds; sold-out size is disabled", async () => {
  await withPurchase(async ({ container, click, calls }) => {
    assert.equal(container.querySelector(".selector")?.textContent, "Beden seçin");
    await click(".actions button:nth-child(2)");
    assert.deepEqual(calls, []);
    assert.equal(container.querySelector<HTMLDialogElement>("dialog")?.open, true);
    assert.match(container.querySelector('[role="status"]')?.textContent ?? "", /beden seçin/u);
    const sold = [...container.querySelectorAll<HTMLButtonElement>(".optionList button")].find((item) => item.querySelector("span")?.textContent === "L");
    assert.ok(sold?.disabled);
    await React.act(async () => sold.click());
    assert.equal(container.querySelector(".selector")?.textContent, "Beden seçin");
    assert.deepEqual(calls, []);
  });
});

test("chosen color and size send the real API variant and its price in commerce events", async () => {
  await withPurchase(async (context) => {
    await context.click('.swatches button[aria-label="Mavi"]');
    await choose(context, "S");
    assert.equal(context.container.querySelector(".price span")?.textContent, "₺39");
    await context.click(".actions button:nth-child(2)");
    assert.deepEqual(context.calls, [{ productId, variantId: "blue-small", quantity: 1 }]);
    assert.equal(context.events[0].data.variantId, "blue-small");
    assert.equal(context.events[0].data.valueMinor, 3900);
    assert.deepEqual(context.order, ["drawer", "add", "replace", "event:add_to_cart"]);
  });
});

test("color changes preserve an available exact size and clear a sold-out matching size", async () => {
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click('.swatches button[aria-label="Siyah"]');
    assert.equal(context.container.querySelector(".selector")?.textContent, "Beden: M");
    await context.click(".actions button:nth-child(2)");
    assert.equal(context.calls[0].variantId, "black-medium");
    await context.click('.swatches button[aria-label="Mavi"]');
    assert.equal(context.container.querySelector(".selector")?.textContent, "Beden seçin");
    await context.click(".actions button:nth-child(2)");
    assert.equal(context.calls.length, 1);
    assert.equal(context.container.querySelector<HTMLDialogElement>("dialog")?.open, true);
  });
});

test("identical displayed Small/S labels do not preserve distinct raw options", async () => {
  await withPurchase(async (context) => {
    await choose(context, "S");
    await context.click('.swatches button[aria-label="Beyaz"]');
    assert.equal(context.container.querySelector(".selector")?.textContent, "Beden seçin");
    await context.click(".actions button:nth-child(2)");
    assert.deepEqual(context.calls, []);
  });
});

test("buy adds the selected variant to the shared cart before navigating to checkout", async () => {
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click(".actions button:first-child");
    assert.deepEqual(context.calls, [{ productId, variantId: "brown-medium", quantity: 1 }]);
    assert.deepEqual(context.order, ["add", "replace", "event:add_to_cart", "event:begin_checkout", "push:/checkout"]);
    assert.equal(context.events[1].data.valueMinor, 3700);
    assert.equal(context.replaced.length, 1);
  });
});

function deferredCart() {
  let resolve!: (cart: Readonly<{ itemCount: number }>) => void;
  const promise = new Promise<Readonly<{ itemCount: number }>>((finish) => { resolve = finish; });
  return { promise, resolve };
}

test("leaving the product page during a pending buy prevents late checkout navigation", async () => {
  const request = deferredCart();
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click(".actions button:first-child");
    assert.equal(context.container.querySelector<HTMLButtonElement>(".actions button:first-child")?.disabled, true);
    assert.deepEqual(context.calls, [{ productId, variantId: "brown-medium", quantity: 1 }]);
    await context.render(null);
    const returnedCart = { itemCount: 1 };
    await React.act(async () => request.resolve(returnedCart));
    assert.deepEqual(context.replaced, [returnedCart], "the completed server cart is still reconciled");
    assert.equal(context.events.some(({ name }) => name === "begin_checkout"), false);
    assert.equal(context.order.some((step) => step.startsWith("push:")), false);
    assert.equal(context.order.includes("drawer"), false);
  }, { add: () => request.promise });
});

test("a changed URL query while buy is pending prevents checkout even before the page unmounts", async () => {
  const request = deferredCart();
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click(".actions button:first-child");
    window.history.pushState({}, "", `${window.location.pathname}?view=collection`);
    await React.act(async () => request.resolve({ itemCount: 1 }));
    assert.equal(context.events.some(({ name }) => name === "begin_checkout"), false);
    assert.equal(context.order.some((step) => step.startsWith("push:")), false);
  }, { add: () => request.promise });
});

test("a deferred cart drawer callback cannot open after the purchase page unmounts", async () => {
  const request = deferredCart();
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click(".actions button:nth-child(2)");
    assert.equal(context.calls.length, 1);
    assert.equal(context.order.includes("drawer"), false);
    await context.render(null);
    await React.act(async () => request.resolve({ itemCount: 1 }));
    assert.equal(context.replaced.length, 1);
    assert.equal(context.order.includes("drawer"), false);
    assert.equal(context.events.some(({ name }) => name === "begin_checkout"), false);
  }, { add: () => request.promise, deferDrawer: true });
});

test("a failed request clears pending, shows retry guidance and allows the same chosen variant to retry", async () => {
  let attempts = 0;
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click(".actions button:nth-child(2)");
    assert.match(context.container.querySelector('[role="status"]')?.textContent ?? "", /yeniden deneyin/u);
    assert.equal(context.container.querySelector<HTMLButtonElement>(".actions button:nth-child(2)")?.disabled, false);
    assert.equal(context.events.length, 0);
    await context.click(".actions button:nth-child(2)");
    assert.equal(context.calls.length, 2);
    assert.equal(context.calls[1].variantId, "brown-medium");
    assert.match(context.container.querySelector('[role="status"]')?.textContent ?? "", /sepete eklendi/u);
  }, { add: async () => { if (++attempts === 1) throw new Error("request failed"); return { itemCount: 1 }; } });
});

test("quantity controls honor the feature flag, stock limit and selected variant total", async () => {
  await withPurchase(async (context) => {
    assert.equal(context.container.querySelector(".quantity"), null);
  });
  await withPurchase(async (context) => {
    await choose(context, "M");
    await context.click('button[aria-label="Adedi artır"]');
    assert.equal(context.container.querySelector(".quantity output")?.textContent, "2");
    assert.equal(context.container.querySelector<HTMLButtonElement>('button[aria-label="Adedi artır"]')?.disabled, true);
    await context.click(".actions button:nth-child(2)");
    assert.deepEqual(context.calls, [{ productId, variantId: "brown-medium", quantity: 2 }]);
    assert.equal(context.events[0].data.valueMinor, 7400);
  }, { quantity: true });
});

test("provider accepts a valid initial variant, falls back for an invalid ID and recovers when product changes", async () => {
  const load = componentLoader();
  const { ProductVariantMediaProvider: Provider, useProductVariantSelection: useSelection } = load<{ ProductVariantMediaProvider: Component; useProductVariantSelection(product: PublicProduct): readonly [string, (id: string) => void] }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  function Probe({ source }: { source: PublicProduct }) { const [id] = useSelection(source); return React.createElement("output", null, id); }
  await withProductBrowser(async ({ container, render }) => {
    const tree = (source: PublicProduct, initialVariantId: string, key: string) => React.createElement(Provider, { key, product: source, initialVariantId }, React.createElement(Probe, { source }));
    await render(tree(product, "black-medium", "valid"));
    assert.equal(container.querySelector("output")?.textContent, "black-medium");
    await render(tree(product, "missing-id", "invalid"));
    assert.equal(container.querySelector("output")?.textContent, "brown-small");
    const soldFirst = { ...product, variants: [{ ...product.variants[0], available: false }, ...product.variants.slice(1)] };
    await render(tree(soldFirst, "missing-id", "sold-first"));
    assert.equal(container.querySelector("output")?.textContent, "brown-medium");
    const replacement = { ...product, id: "other-product", variants: [product.variants[5]] };
    await render(tree(replacement, "black-medium", "sold-first"));
    assert.equal(container.querySelector("output")?.textContent, "black-medium");
  });
});


test("a meaningful single title-only variant remains visible and purchases its actual ID", async () => {
  const only = { ...product.variants[0], id: "only-xl", title: "XL", attributes: {} };
  await withPurchase(async (context) => {
    assert.equal(context.container.querySelector(".selector")?.textContent, "Seçenek: XL");
    await context.click(".actions button:nth-child(2)");
    assert.deepEqual(context.calls, [{ productId, variantId: "only-xl", quantity: 1 }]);
  }, { product: { ...product, variants: [only] } });
});


test("Siora guide uses the merchant heading in its trigger and payment-independent modal", async () => {
  await withPurchase(async ({ container, click, calls }) => {
    const trigger = container.querySelector<HTMLButtonElement>(".sizeHelp");
    assert.ok(trigger);
    assert.ok(trigger.textContent?.includes("Ölçünüzü belirleyin"));
    await click(".sizeHelp");
    assert.equal(container.querySelector("dialog h2")?.textContent, "Ölçünüzü belirleyin");
    assert.ok(container.querySelector("dialog")?.textContent?.includes("Mağazanın ölçü açıklaması"));
    assert.deepEqual(calls, []);
  }, { guide: {heading: "Ölçünüzü belirleyin", body: React.createElement("p", null, "Mağazanın ölçü açıklaması")} });
});
