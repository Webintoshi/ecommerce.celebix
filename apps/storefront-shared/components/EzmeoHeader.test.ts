import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];

async function withHeader(run: (browser: Browser & { pushes: string[]; triggers: HTMLElement[] }) => Promise<void>, options: { pathname?: string; style?: "solid" | "overlay" } = {}) {
  const pushes: string[] = [], triggers: HTMLElement[] = [];
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push: (href: string) => pushes.push(href) }), usePathname: () => options.pathname ?? "/urunler" },
    "next/link": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ cart: { itemCount: 4 }, drawerOpen: false, openDrawer: (trigger: HTMLElement) => triggers.push(trigger) }) },
    "../../components/use-hydrated": { useHydrated: () => true },
    "../siora/useCatalogScrollRestoration": { useCatalogScrollRestoration: () => undefined },
    "./CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
  });
  const { EzmeoHeaderClient } = load<{ EzmeoHeaderClient: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/ezmeo/EzmeoHeaderClient.tsx", import.meta.url));
  await withProductBrowser(async browser => {
    const previous = globalThis.FormData;
    Object.assign(globalThis, { FormData: window.FormData });
    try {
      await browser.render(React.createElement(EzmeoHeaderClient, { displayName: "Ezmeo", locale: "tr", style: options.style, navigation: [
        { name: "Geleneksel", slug: "geleneksel", children: [{ name: "Tarhanalar", slug: "tarhanalar", children: [] }] },
        { name: "Hikâyemiz", slug: "hikayemiz", path: "/pages/hikayemiz", children: [] },
      ] }));
      await run({ ...browser, pushes, triggers });
    } finally { Object.assign(globalThis, { FormData: previous }); }
  });
}

test("Ezmeo search opens in place, submits a real encoded query and restores scroll/focus on close", async () => {
  await withHeader(async ({ container, click, pushes }) => {
    await click('.ez-search-trigger');
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    const input = container.querySelector<HTMLInputElement>('input[name="q"]');
    assert.ok(dialog?.open && input);
    assert.equal(document.body.style.overflow, "hidden");
    assert.equal(document.activeElement, input);
    assert.deepEqual(pushes, [], "opening search must not navigate");
    input.value = "  Fındık & kakao  ";
    await React.act(async () => input.form!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(pushes, [`/search?q=${encodeURIComponent("Fındık & kakao")}`]);
    assert.equal(dialog.open, false);
    assert.equal(document.body.style.overflow, "");
    assert.equal(document.activeElement, container.querySelector(".ez-search-trigger"));
  });
});

test("Ezmeo honors overlay only on home and becomes opaque when scrolling", async () => {
  await withHeader(async ({ container }) => {
    const header = container.querySelector("header");
    assert.equal(header?.getAttribute("data-header-overlay"), "true");
    assert.equal(header?.getAttribute("data-header-scrolled"), "false");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 100 });
    await React.act(async () => window.dispatchEvent(new window.Event("scroll")));
    assert.equal(header?.getAttribute("data-header-scrolled"), "true");
  }, { pathname: "/", style: "overlay" });
  await withHeader(async ({ container }) => {
    assert.equal(container.querySelector("header")?.getAttribute("data-header-overlay"), "false");
  }, { pathname: "/urun/karakilcik-kesme-eriste", style: "overlay" });
});

test("Ezmeo nested menu preserves parent destinations, children and explicit page links", async () => {
  await withHeader(async ({ container, click, pushes }) => {
    await click('.ez-menu-trigger');
    assert.equal(container.querySelector<HTMLAnchorElement>('.ez-category-row a')?.getAttribute("href"), "/kategori/geleneksel");
    assert.equal(container.querySelector<HTMLAnchorElement>('.ez-category-row:last-child a')?.getAttribute("href"), "/pages/hikayemiz");
    await click('button[aria-label="Geleneksel alt kategorilerini aç"]');
    assert.equal(container.querySelector(".ez-panel-heading h2")?.textContent, "Geleneksel");
    await click('.ez-category-row a');
    assert.deepEqual(pushes, ["/kategori/tarhanalar"]);
    assert.equal(container.querySelector<HTMLDialogElement>("dialog")?.open, false);
    assert.equal(document.body.style.overflow, "");
  });
});

test("Ezmeo cart opens the existing provider and Escape dismisses navigation without losing focus", async () => {
  await withHeader(async ({ container, click, triggers }) => {
    await click('.ez-cart-trigger');
    const cart = container.querySelector<HTMLButtonElement>(".ez-cart-trigger");
    assert.equal(cart?.getAttribute("aria-label"), "Sepet, 4 ürün");
    assert.deepEqual(triggers, [cart]);
    await click('.ez-menu-trigger');
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    assert.ok(dialog?.open);
    await React.act(async () => dialog.dispatchEvent(new window.Event("cancel", { cancelable: true })));
    assert.equal(dialog.open, false);
    assert.equal(document.activeElement, container.querySelector(".ez-menu-trigger"));
    assert.equal(document.body.style.overflow, "");
  });
});
