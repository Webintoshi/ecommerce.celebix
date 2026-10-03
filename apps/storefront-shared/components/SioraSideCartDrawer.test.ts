import assert from "node:assert/strict";
import test from "node:test";
import React, { createContext, useContext, useState } from "react";
import type { PublicCart, PublicCartLine } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];
type Recommendation = { id: string; slug: string; title: string; priceCents: number; media: { url: string; altText: string; width: number; height: number } };
type DrawerState = { cart: PublicCart | null; loading: boolean; unavailable: boolean; drawerOpen: boolean };
type DrawerContext = DrawerState & { showQuantitySelector: boolean; refresh(): Promise<boolean>; replaceCart(value: PublicCart): void; closeDrawer(): void };
type DrawerBrowser = Browser & { fetches: Array<{ input: string; init?: RequestInit }>; removals: unknown[]; quantities: unknown[]; replaced: PublicCart[]; nativeDialogs: { shown: HTMLDialogElement[]; closed: HTMLDialogElement[] }; refreshes(): number; closes(): number; update(value: Partial<DrawerState>): Promise<void>; flushFocus(): Promise<void> };

const firstLine: PublicCartLine = { productId: "product-denim", variantId: "variant-denim-medium", slug: "denim-takim", title: "Denim takım", variantTitle: "Kahve / M", quantity: 2, unitPriceCents: 3700, lineTotalCents: 7400, available: true, media: { id: "denim-photo", productId: "product-denim", url: "https://media.example/denim.webp", mediaType: "image/webp", altText: "Gerçek denim fotoğrafı", width: 800, height: 1200, sortOrder: 0 } };
const secondLine: PublicCartLine = { productId: "product-belt", variantId: "variant-belt", slug: "deri-kemer", title: "Deri kemer", variantTitle: "Varsayılan", quantity: 1, unitPriceCents: 4500, lineTotalCents: 4500, available: true };
const cart: PublicCart = { version: 8, currency: "TRY", itemCount: 3, subtotalCents: 11900, shippingCents: 900, totalCents: 12800, checkoutReady: true, checkoutBlocker: null, items: [firstLine, secondLine] };
const emptyCart: PublicCart = { ...cart, version: 9, itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: false, checkoutBlocker: "empty_cart", items: [] };
const recommendation = (id: string): Recommendation => ({ id, slug: `urun-${id}`, title: `Öneri ${id}`, priceCents: 2500, media: { url: `https://media.example/${id}.webp`, altText: `Öneri fotoğrafı ${id}`, width: 400, height: 600 } });
const text = (element: Element | null) => element?.textContent?.replace(/\s+/gu, " ").trim() ?? "";

async function withDrawer(run: (browser: DrawerBrowser) => Promise<void>, options: Readonly<{ state?: Partial<DrawerState>; quantity?: boolean; trustMessage?: string; suggestions?: readonly Recommendation[]; recommendationFailure?: boolean; recommendationStatus?: number; removeFailure?: boolean; removalResult?: PublicCart }> = {}) {
  const fetches: DrawerBrowser["fetches"] = [], removals: unknown[] = [], quantities: unknown[] = [], replaced: PublicCart[] = [];
  let closeCount = 0, refreshCount = 0;
  let updateState: ((value: Partial<DrawerState>) => void) | undefined;
  const Context = createContext<DrawerContext | null>(null);
  function CartFixture({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<DrawerState>({ cart, loading: false, unavailable: false, drawerOpen: true, ...options.state });
    updateState = (value) => setState((current) => ({ ...current, ...value }));
    return React.createElement(Context.Provider, { value: { ...state, showQuantitySelector: options.quantity ?? false, async refresh() { refreshCount += 1; return false; }, replaceCart(value: PublicCart) { replaced.push(value); setState((current) => ({ ...current, cart: value })); }, closeDrawer() { closeCount += 1; setState((current) => ({ ...current, drawerOpen: false })); } } }, children);
  }
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
    "../../components/CartStatusProvider": { useCartStatus() { const value = useContext(Context); assert.ok(value); return value; } },
    "../../lib/format.ts": { formatTry: (value: number) => `₺${value / 100}` },
    "../../lib/storefront-routes.ts": { productPath: (_locale: string, slug: string) => `/products/${slug}`, productIndexPath: () => "/products" },
    "../../lib/cart/client.ts": { storefrontCartClient: { async remove(input: { variantId: string }) { removals.push(input); if (options.removeFailure) throw new Error("write failed"); if (options.removalResult) return options.removalResult; const remaining = cart.items.filter((line) => line.variantId !== input.variantId); const subtotalCents = remaining.reduce((sum, line) => sum + line.lineTotalCents, 0); return { ...cart, version: 9, items: remaining, itemCount: remaining.reduce((sum, line) => sum + line.quantity, 0), subtotalCents, totalCents: subtotalCents + cart.shippingCents }; }, async setQuantity(input: { variantId: string; quantity: number }) { quantities.push(input); const items = cart.items.map((line) => line.variantId === input.variantId ? { ...line, quantity: input.quantity, lineTotalCents: line.unitPriceCents * input.quantity } : line); const subtotalCents = items.reduce((sum, line) => sum + line.lineTotalCents, 0); return { ...cart, version: 9, items, itemCount: items.reduce((sum, line) => sum + line.quantity, 0), subtotalCents, totalCents: subtotalCents + cart.shippingCents }; } } },
  });
  const { SioraSideCartDrawer: Drawer } = load<{ SioraSideCartDrawer: Component }>(new URL("../themes/siora/SioraSideCartDrawer.tsx", import.meta.url));
  await withProductBrowser(async (browser) => {
    // Model native dialog lifecycle explicitly; the DOM fixture cannot emulate a browser's top layer.
    const dialogPrototype = window.HTMLDialogElement.prototype;
    const dialogDescriptors = { showModal: Object.getOwnPropertyDescriptor(dialogPrototype, "showModal"), close: Object.getOwnPropertyDescriptor(dialogPrototype, "close") };
    const nativeDialogs: DrawerBrowser["nativeDialogs"] = { shown: [], closed: [] };
    Object.defineProperties(dialogPrototype, {
      showModal: { configurable: true, writable: true, value(this: HTMLDialogElement) { assert.ok(this.isConnected); assert.equal(this.open, false); this.open = true; nativeDialogs.shown.push(this); } },
      close: { configurable: true, writable: true, value(this: HTMLDialogElement) { assert.equal(this.open, true); this.open = false; nativeDialogs.closed.push(this); this.dispatchEvent(new window.Event("close")); } },
    });
    const previous = { fetch: globalThis.fetch, HTMLElement: globalThis.HTMLElement, HTMLAnchorElement: globalThis.HTMLAnchorElement, Node: globalThis.Node };
    Object.assign(globalThis, { HTMLElement: window.HTMLElement, HTMLAnchorElement: window.HTMLAnchorElement, Node: window.Node, fetch: async (input: RequestInfo | URL, init?: RequestInit) => { fetches.push({ input: String(input), init }); if (options.recommendationFailure) throw new Error("recommendations unavailable"); return new Response(JSON.stringify({ suggestions: options.suggestions ?? [recommendation("new-one"), recommendation("new-two"), recommendation("new-three")] }), { status: options.recommendationStatus ?? 200, headers: { "content-type": "application/json" } }); } });
    const flushFocus = async () => React.act(async () => { await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())); });
    try {
      await browser.render(React.createElement(CartFixture, null, React.createElement(Drawer, { locale: "tr", presentation: { showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: options.quantity ?? false, trustMessage: options.trustMessage } })));
      await flushFocus();
      await run({ ...browser, fetches, removals, quantities, replaced, nativeDialogs, refreshes: () => refreshCount, closes: () => closeCount, update: async (value) => { assert.ok(updateState); await React.act(async () => updateState?.(value)); }, flushFocus });
    } finally {
      await browser.render(null);
      Object.assign(globalThis, previous);
      for (const name of ["showModal", "close"] as const) { const descriptor = dialogDescriptors[name]; if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor); else Reflect.deleteProperty(dialogPrototype, name); }
    }
  });
}

function findButton(container: HTMLElement, matcher: RegExp): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => matcher.test(text(item)) || matcher.test(item.getAttribute("aria-label") ?? ""));
  assert.ok(button, `button ${matcher} exists`);
  return button;
}

test("drawer shows canonical cart lines, a truthful title, only the canonical subtotal and one checkout destination", async () => {
  await withDrawer(async ({ container, closes }) => {
    assert.equal(text(container.querySelector("h2")), "Sepetiniz");
    assert.ok(container.querySelector('dialog[open][aria-modal="true"]'));
    assert.ok(container.querySelector('a[href="/products/denim-takim"]'));
    assert.match(container.textContent ?? "", /Kahve \/ M/u);
    assert.match(container.textContent ?? "", /₺74/u);
    assert.doesNotMatch(container.textContent ?? "", /Varsayılan/u);
    const image = container.querySelector<HTMLImageElement>('img[src="https://media.example/denim.webp"]');
    assert.equal(image?.alt, "Gerçek denim fotoğrafı");
    const footer = container.querySelector("footer");
    assert.ok(footer);
    assert.match(text(footer), /₺119/u);
    assert.doesNotMatch(text(footer), /₺128|₺9\b|Kargo|^Toplam/u);
    const checkout = container.querySelector<HTMLAnchorElement>('a[href="/checkout"]');
    assert.ok(checkout);
    assert.equal(container.querySelectorAll('a[href="/checkout"]').length, 1);
    assert.equal(text(checkout).toLocaleUpperCase("tr-TR"), "ÖDEMEYE GEÇ");
    assert.equal(container.querySelector('a[href="/cart"]'), null);
    await React.act(async () => checkout.click());
    assert.equal(closes(), 1);
    assert.equal(container.querySelector("dialog"), null);
  });
});

test("continue shopping closes the drawer directly without a cart-page destination", async () => {
  await withDrawer(async ({ container, closes }) => {
    const button = findButton(container, /alışverişe devam/iu);
    assert.equal(container.querySelector('a[href="/cart"]'), null);
    await React.act(async () => button.click());
    assert.equal(closes(), 1);
    assert.equal(container.querySelector("dialog"), null);
  });
});

test("the footer preserves the published admin trust message without adding an unconfigured message", async () => {
  await withDrawer(async ({ container }) => { assert.doesNotMatch(text(container.querySelector("footer")), /Güvenli ödeme/u); });
  await withDrawer(async ({ container }) => { assert.match(text(container.querySelector("footer")), /Güvenli ödeme · Siora güvencesi/u); }, { trustMessage: "Güvenli ödeme · Siora güvencesi" });
});

test("recommendations are fetched only on opening a nonempty drawer and exclude every cart product with a two-item limit", async () => {
  await withDrawer(async ({ container, fetches, update, flushFocus }) => {
    assert.equal(fetches.length, 0);
    assert.equal(container.querySelector("dialog"), null);
    await update({ drawerOpen: true });
    await flushFocus();
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].input, "/api/cart/recommendations");
    assert.equal(fetches[0].init?.method ?? "GET", "GET");
    assert.equal(container.querySelector('a[href="/products/urun-product-denim"]'), null);
    assert.equal(container.querySelector('a[href="/products/urun-product-belt"]'), null);
    assert.ok(container.querySelector('a[href="/products/urun-new-one"]'));
    assert.ok(container.querySelector('a[href="/products/urun-new-two"]'));
    assert.equal(container.querySelector('a[href="/products/urun-new-one"] img')?.getAttribute("loading"), "lazy");
    assert.equal(container.querySelector('a[href="/products/urun-new-three"]'), null);
  }, { state: { drawerOpen: false }, suggestions: [recommendation(firstLine.productId), recommendation(secondLine.productId), recommendation("new-one"), recommendation("new-two"), recommendation("new-three")] });
  await withDrawer(async ({ fetches }) => { assert.equal(fetches.length, 0); }, { state: { cart: emptyCart } });
});

test("recommendation failures never block the existing checkout destination", async () => {
  for (const failure of [{ recommendationFailure: true }, { recommendationStatus: 503 }]) {
    await withDrawer(async ({ container, fetches }) => {
      assert.equal(fetches.length, 1);
      const checkout = container.querySelector<HTMLAnchorElement>('a[href="/checkout"]');
      assert.ok(checkout);
      assert.notEqual(checkout.getAttribute("aria-disabled"), "true");
      assert.equal(container.querySelector('a[href="/products/urun-new-one"]'), null);
    }, failure);
  }
});

test("published quantity flag controls the selector and a quantity mutation uses the real variant and cart version", async () => {
  await withDrawer(async ({ container }) => {
    assert.equal(container.querySelector('button[aria-label="Denim takım adet artır"]'), null);
  });
  await withDrawer(async ({ container, quantities, replaced }) => {
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Denim takım adet artır"]');
    assert.ok(button);
    await React.act(async () => button.click());
    assert.deepEqual(quantities, [{ variantId: firstLine.variantId, quantity: 3, expectedVersion: cart.version }]);
    assert.equal(replaced[0]?.version, 9);
    assert.equal(replaced[0]?.items[0].quantity, 3);
  }, { quantity: true });
});

test("Sil uses the existing removal mutation with actual variant/version and installs the returned cart", async () => {
  await withDrawer(async ({ container, removals, replaced }) => {
    const article = container.querySelector('a[href="/products/denim-takim"]')?.closest("article");
    assert.ok(article);
    const button = [...article.querySelectorAll<HTMLButtonElement>("button")].find((item) => /^sil$/iu.test(text(item)));
    assert.ok(button);
    await React.act(async () => button.click());
    assert.deepEqual(removals, [{ variantId: firstLine.variantId, expectedVersion: cart.version }]);
    assert.equal(replaced[0].items.some(({ variantId }) => variantId === firstLine.variantId), false);
    assert.equal(container.querySelector('a[href="/products/denim-takim"]'), null);
  });
});

test("removing the focused final line restores focus inside the open modal after the canonical empty cart arrives", async () => {
  await withDrawer(async ({ container, removals, replaced, closes }) => {
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Sepeti kapat"]');
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Denim takım ürününü sil"]');
    assert.ok(dialog && close && remove);
    remove.focus();
    assert.equal(document.activeElement, remove);
    await React.act(async () => remove.click());
    assert.deepEqual(removals, [{ variantId: firstLine.variantId, expectedVersion: cart.version }]);
    assert.equal(replaced[0], emptyCart, "the server's empty cart is installed without a local reconstruction");
    assert.equal(remove.isConnected, false);
    assert.equal(container.querySelectorAll("article").length, 0);
    assert.ok(container.querySelector('a[href="/products"]'));
    assert.equal(container.querySelector('a[href="/checkout"]'), null);
    assert.equal(dialog.open, true);
    assert.equal(closes(), 0);
    assert.equal(document.activeElement, close, "focus cannot remain on the document after the focused line is removed");
    assert.equal(document.body.style.overflow, "hidden");
  }, { state: { cart: { ...cart, items: [firstLine], itemCount: firstLine.quantity, subtotalCents: firstLine.lineTotalCents, totalCents: firstLine.lineTotalCents + cart.shippingCents } }, removalResult: emptyCart });
});

test("a failed removal is not replayed and performs one read-only recovery with status feedback", async () => {
  await withDrawer(async ({ container, removals, refreshes }) => {
    const article = container.querySelector('a[href="/products/denim-takim"]')?.closest("article");
    assert.ok(article);
    const button = [...article.querySelectorAll<HTMLButtonElement>("button")].find((item) => /^sil$/iu.test(text(item)));
    assert.ok(button);
    await React.act(async () => button.click());
    assert.equal(removals.length, 1);
    assert.equal(refreshes(), 1);
    assert.match(container.textContent ?? "", /Sepet güncellenemedi/u);
    assert.equal(button.disabled, false);
  }, { removeFailure: true });
});

test("stock blockers disable checkout while configuration blockers retain the same primary destination and a notice", async () => {
  await withDrawer(async ({ container }) => {
    assert.equal(container.querySelector('a[href="/checkout"]'), null);
    const disabled = [...container.querySelectorAll<HTMLElement>('[aria-disabled="true"], button[disabled]')].find((item) => /ödemeye geç/iu.test(text(item)));
    assert.ok(disabled);
  }, { state: { cart: { ...cart, checkoutReady: false, checkoutBlocker: "stock_unavailable", items: [{ ...firstLine, available: false }, secondLine] } } });
  for (const checkoutBlocker of ["shipping_unavailable", "payment_unavailable"] as const) {
    await withDrawer(async ({ container }) => {
      const checkout = container.querySelector('a[href="/checkout"]');
      assert.ok(checkout);
      assert.equal(text(checkout).toLocaleUpperCase("tr-TR"), "ÖDEMEYE GEÇ");
      assert.match(container.textContent ?? "", /yapılandır|hazır|kullanıl/u);
    }, { state: { cart: { ...cart, checkoutReady: false, checkoutBlocker } } });
  }
});

test("empty, unavailable and loading states keep retry and discovery truthful without checkout or recommendations", async () => {
  await withDrawer(async ({ container, fetches }) => {
    assert.ok(container.querySelector('a[href="/products"]'), "empty cart offers product discovery");
    assert.equal(container.querySelectorAll("article").length, 0);
    assert.equal(container.querySelector('a[href="/checkout"]'), null);
    assert.equal(fetches.length, 0);
  }, { state: { cart: emptyCart } });
  await withDrawer(async ({ container, refreshes, fetches }) => {
    assert.ok(container.querySelector('[role="status"]'));
    const retry = findButton(container, /tekrar dene/iu);
    await React.act(async () => retry.click());
    assert.equal(refreshes(), 1);
    assert.equal(container.querySelector('a[href="/checkout"]'), null);
    assert.equal(fetches.length, 0);
  }, { state: { cart: null, unavailable: true } });
  await withDrawer(async ({ container, fetches }) => {
    assert.ok(container.querySelector('[role="status"][aria-busy="true"]'));
    assert.equal(container.querySelector('a[href="/checkout"]'), null);
    assert.equal(fetches.length, 0);
  }, { state: { cart: null, loading: true } });
});

test("drawer opens a native modal, traps Tab, closes on Escape and cleans up modal state on close and unmount", async () => {
  await withDrawer(async ({ container, closes, flushFocus, update, render, nativeDialogs }) => {
    await flushFocus();
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Sepeti kapat"]');
    assert.ok(dialog && close);
    assert.equal(dialog.open, true);
    assert.deepEqual(nativeDialogs.shown, [dialog]);
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(document.activeElement, close);
    const controls = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    const first = controls[0], last = controls.at(-1);
    assert.ok(first && last);
    await React.act(async () => { first.focus(); first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    assert.equal(document.activeElement, last);
    await React.act(async () => { last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    assert.equal(document.activeElement, first);
    await React.act(async () => { dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    assert.equal(closes(), 1);
    assert.equal(dialog.open, false);
    assert.deepEqual(nativeDialogs.closed, [dialog]);
    assert.equal(document.body.style.overflow, "");
    await update({ drawerOpen: true });
    const reopened = container.querySelector<HTMLDialogElement>("dialog");
    assert.ok(reopened && reopened !== dialog);
    assert.equal(reopened.open, true);
    assert.deepEqual(nativeDialogs.shown, [dialog, reopened]);
    assert.equal(document.body.style.overflow, "hidden");
    await render(null);
    assert.equal(reopened.open, false);
    assert.deepEqual(nativeDialogs.closed, [dialog, reopened]);
    assert.equal(document.body.style.overflow, "");
  });
});

test("native cancel closes through cart state exactly once and restores the previous body overflow", async () => {
  await withDrawer(async ({ container, closes, nativeDialogs, update }) => {
    await update({ drawerOpen: false });
    document.body.style.overflow = "scroll";
    await update({ drawerOpen: true });
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    assert.ok(dialog?.open);
    const cancel = new window.Event("cancel", { cancelable: true });
    await React.act(async () => { dialog.dispatchEvent(cancel); });
    assert.equal(cancel.defaultPrevented, true);
    assert.equal(closes(), 1);
    assert.equal(dialog.open, false);
    assert.equal(nativeDialogs.closed.at(-1), dialog);
    assert.equal(container.querySelector("dialog"), null);
    assert.equal(document.body.style.overflow, "scroll");
    document.body.style.overflow = "";
  });
});

test("only native backdrop coordinates outside the drawer bounds close it", async () => {
  await withDrawer(async ({ container, closes }) => {
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    assert.ok(dialog);
    dialog.getBoundingClientRect = () => ({ x: 600, y: 0, left: 600, right: 1160, top: 0, bottom: 800, width: 560, height: 800, toJSON: () => ({}) });
    await React.act(async () => { dialog.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, clientX: 800, clientY: 100 })); });
    assert.equal(closes(), 0, "clicking unused space inside the panel keeps it open");
    const title = container.querySelector("h2");
    assert.ok(title);
    await React.act(async () => { title.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 100 })); });
    assert.equal(closes(), 0, "child events cannot be mistaken for backdrop clicks");
    await React.act(async () => { dialog.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 100 })); });
    assert.equal(closes(), 1);
    assert.equal(dialog.open, false);
    assert.equal(container.querySelector("dialog"), null);
  });
});
