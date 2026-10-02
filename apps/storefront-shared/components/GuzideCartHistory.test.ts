import assert from "node:assert/strict";
import test from "node:test";
import React, { useEffect } from "react";
import type { PublicCart } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const STORE = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const PRODUCT_ROUTE = "/urun/14-ayar-altin-kolye";
const serverCart: PublicCart = {
  version: 4, currency: "TRY", itemCount: 1, subtotalCents: 10_000, shippingCents: 0, totalCents: 10_000,
  checkoutReady: true, checkoutBlocker: null,
  items: [{ productId: "00000000-0000-4000-8000-000000000001", variantId: "00000000-0000-4000-8000-000000000002", slug: "14-ayar-altin-kolye", title: "14 Ayar Altın Kolye", variantTitle: "Standart", quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, available: true }],
};
const replacedCart: PublicCart = { ...serverCart, version: 5, itemCount: 3, subtotalCents: 30_000, totalCents: 30_000, items: [{ ...serverCart.items[0], quantity: 3, lineTotalCents: 30_000 }] };
type Gate = () => Promise<boolean> | null;
type Status = { cart: PublicCart | null; drawerOpen: boolean; loading: boolean; openDrawer(trigger?: HTMLElement): void; replaceCart(cart: PublicCart): void; registerDrawerGate?(gate: Gate): () => void };
type CartModule = { CartStatusProvider: React.ComponentType<Record<string, unknown>>; useCartStatus(): Status };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(complete => { resolve = complete; }); return { promise, resolve }; }

async function withCart(run: (fixture: {
  container: HTMLElement; open(): Promise<void>; status(): Status; unmount(): Promise<void>;
}) => Promise<void>, options: { gate?: Gate; visualTheme?: string; storefrontId?: string; resolve?: () => Promise<PublicCart> } = {}) {
  const router = { push() {} };
  const load = componentLoader({
    "next/navigation": { useRouter: () => router, usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) },
    "@/lib/cart/client.ts": { storefrontCartClient: { resolve: options.resolve ?? (async () => serverCart) } },
    "./SideCartDrawer": { SideCartDrawer: () => null },
  });
  const module = load<CartModule>(new URL("./CartStatusProvider.tsx", import.meta.url));
  let status: Status;
  function Consumer() {
    status = module.useCartStatus();
    const register = status.registerDrawerGate;
    useEffect(() => options.gate && register ? register(options.gate) : undefined, [register]);
    return null;
  }
  // Tests observe the actual context's visible state, keeping drawer styling outside this provider contract.
  function Controls() {
    const state = module.useCartStatus();
    return React.createElement(React.Fragment, null,
      React.createElement("button", { id: "cart-trigger", type: "button", onClick: (event: React.MouseEvent<HTMLButtonElement>) => state.openDrawer(event.currentTarget) }, "Sepeti aç"),
      React.createElement("output", { "data-cart-open": String(state.drawerOpen), "data-cart-count": String(state.cart?.itemCount ?? 0), "data-cart-loading": String(state.loading) }, state.drawerOpen ? "Sepet açık" : "Sepet kapalı"));
  }
  await withProductBrowser(async ({ container, render, click }) => {
    const previousElement = globalThis.HTMLElement;
    Object.assign(globalThis, { HTMLElement: window.HTMLElement });
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["urun", {}] }], custom: "keep" }, "", PRODUCT_ROUTE);
    await render(React.createElement(module.CartStatusProvider, { visualTheme: options.visualTheme ?? "guzide-deniz", storefrontId: options.storefrontId ?? STORE, locale: "tr" }, React.createElement(Consumer), React.createElement(Controls)));
    try { await run({ container, open: () => click("#cart-trigger"), status: () => status!, unmount: () => render(null) }); }
    finally { Object.assign(globalThis, { HTMLElement: previousElement }); }
  });
}

test("Güzide waits for the menu gate before showing the cart and pushing its owned history entry", async () => {
  const gate = deferred<boolean>();
  await withCart(async ({ container, open }) => {
    const before = window.history.length;
    await open(); await open();
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "false");
    assert.equal(window.history.length, before); assert.equal(window.history.state.__celebixGuzidePanel, undefined);
    await React.act(async () => { gate.resolve(true); await gate.promise; });
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
    assert.equal(window.history.length, before + 1, "repeated waiting requests create one visible cart entry");
    assert.ok(window.history.state.__celebixGuzidePanel?.owner.includes(":cart:"));
    assert.equal(window.history.state.custom, "keep");
  }, { gate: () => gate.promise });
});

test("Güzide a rejected menu gate keeps the cart closed without losing an already accepted server cart", async () => {
  const gate = deferred<boolean>();
  await withCart(async ({ container, open, status }) => {
    const before = window.history.length;
    await React.act(async () => status().replaceCart(replacedCart)); await open();
    await React.act(async () => { gate.resolve(false); await gate.promise; });
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "false");
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-count"), "3");
    assert.equal(window.history.length, before); assert.equal(window.history.state.__celebixGuzidePanel, undefined);
  }, { gate: () => gate.promise });
});

test("Güzide a gate returning null opens immediately through the normal cart history path", async () => {
  await withCart(async ({ container, open }) => {
    const before = window.history.length; await open();
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-count"), "1");
    assert.equal(window.history.length, before + 1);
  }, { gate: () => null });
});

test("Güzide late resolve cannot overwrite the replacement cart while the drawer waits for its menu gate", async () => {
  const gate = deferred<boolean>(), initialResolve = deferred<PublicCart>();
  await withCart(async ({ container, open, status }) => {
    await React.act(async () => status().replaceCart(replacedCart)); await open();
    await React.act(async () => { initialResolve.resolve(serverCart); await initialResolve.promise; });
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-count"), "3");
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "false");
    await React.act(async () => { gate.resolve(true); await gate.promise; });
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-count"), "3");
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
  }, { gate: () => gate.promise, resolve: () => initialResolve.promise });
});

test("non-Güzide cart drawers keep their immediate behavior and never acquire Güzide history entries", async () => {
  for (const visualTheme of ["starter", "siora-deniz"]) {
    const gate = deferred<boolean>();
    await withCart(async ({ container, open }) => {
      const before = window.history.length; await open();
      assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
      assert.equal(window.history.length, before); assert.equal(window.history.state.__celebixGuzidePanel, undefined);
      await React.act(async () => { gate.resolve(false); await gate.promise; });
      assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
    }, { visualTheme, storefrontId: "other-store", gate: () => gate.promise });
  }
});

test("Güzide a gate completed after provider teardown cannot push a stale cart entry", async () => {
  const gate = deferred<boolean>();
  await withCart(async ({ open, unmount }) => {
    const before = window.history.length; await open(); await unmount();
    await React.act(async () => { gate.resolve(true); await gate.promise; });
    assert.equal(window.history.length, before); assert.equal(window.history.state.__celebixGuzidePanel, undefined);
  }, { gate: () => gate.promise });
});

test("Güzide a second open request cannot bypass an already pending gate after the menu hides", async () => {
  const gate = deferred<boolean>(); let requested = false;
  await withCart(async ({ container, open }) => {
    const before = window.history.length;
    await open(); await open();
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "false");
    assert.equal(window.history.length, before);
    await React.act(async () => { gate.resolve(true); await gate.promise; });
    assert.equal(container.querySelector("output")?.getAttribute("data-cart-open"), "true");
    assert.equal(window.history.length, before + 1);
  }, { gate: () => { if (requested) return null; requested = true; return gate.promise; } });
});
