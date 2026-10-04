import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../lib/storefront-routes.ts";

test("Güzide header searches without routing, blocks background controls and consumes its layer before a product route", async () => {
  const pushes: string[] = [], histories = new Map<string, { open(): boolean; close(): Promise<boolean> }>();
  let resolveSearch!: (sameRoute: boolean) => void;
  histories.set("menu", { open: () => true, close: async () => true });
  histories.set("search", { open: () => true, close: () => new Promise(resolve => { resolveSearch = resolve; }) });
  const cart = { drawerOpen: false, cart: null, openDrawer: () => {}, closeDrawerAndWait: async () => true, refresh: async () => true, registerDrawerGate: () => () => {} };
  const favorites = { count: 0, refresh: async () => {} };
  const navigation = { items: [{ name: "Kolyeler", slug: "kolyeler", children: [] }] };
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ prefetch: _prefetch, ...props }: Record<string, unknown>) => React.createElement("a", props) },
    "next/navigation": { usePathname: () => "/products/example", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: (href: string) => pushes.push(href) }) },
    "../../components/CartStatusProvider": { useCartStatus: () => cart },
    "./CartStatusProvider": { useCartStatus: () => cart },
    "../../components/FavoriteStatusProvider": { useFavoriteStatus: () => favorites },
    "./FavoriteStatusProvider": { useFavoriteStatus: () => favorites },
    "./GuzideBrowsingContinuity": { GuzideBrowsingContinuity: () => null },
    "./useGuzidePanelHistory": { useGuzidePanelHistory: ({ panel }: { panel: string }) => histories.get(panel) },
    "@/lib/storefront-routes.ts": { categoryPath, localizeStorefrontPath, productIndexPath },
  });
  const { GuzideHeaderClient: Header } = load<{ GuzideHeaderClient: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/guzide/GuzideHeaderClient.tsx", import.meta.url));
  const { GuzideClientFrame: Frame } = load<{ GuzideClientFrame: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/guzide/GuzideMobileExperience.tsx", import.meta.url));
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ items: [{ id: "gold", title: "Altın Kolye", href: "/urun/altin-kolye", priceCents: 10000, currency: "TRY", available: true, imageUrl: null, imageAlt: "" }] })) as typeof fetch;
  try {
    await withProductBrowser(async ({ container, render, click }) => {
      const header = React.createElement(Header, { navigation, displayName: "Güzide Kuyumcu", locale: "tr", menuImages: {}, desktopNavigation: null });
      await render(React.createElement(Frame, { storefrontId: "a828862c-4cc1-475a-89cc-5fbee31eb43f", className: "starter-storefront", locale: "tr", header, footer: "Footer", checkoutHeader: null, checkoutFooter: null }, "Ürün"));
      assert.equal(container.querySelector('[aria-label="Mağaza araçları"] a[href="/search"]'), null);
      await click('[aria-label="Mağaza araçları"] button[aria-label="Ara"]');
      assert.ok(container.querySelector('#guzide-search-panel'));
      assert.deepEqual(pushes, []);
      assert.ok(container.querySelector('main[inert]'));
      const input = container.querySelector<HTMLInputElement>('#guzide-search-panel input')!;
      await React.act(async () => { input.value = "kolye"; input.dispatchEvent(new window.Event("input", { bubbles: true })); });
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
      await click('#guzide-search-panel a[href="/urun/altin-kolye"]');
      assert.equal(container.querySelector('#guzide-search-panel'), null);
      assert.equal(container.querySelector('main[inert]'), null);
      assert.deepEqual(pushes, [], "routing waits for the overlay history entry to be consumed");
      await React.act(async () => { resolveSearch(true); await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.deepEqual(pushes, ["/urun/altin-kolye"]);
      await click('button[aria-label="Menüyü aç"]');
      assert.ok(container.querySelector('#campaign-mobile-menu'));
      await click('#campaign-mobile-menu button[aria-controls="guzide-search-panel"]');
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.equal(container.querySelector('#campaign-mobile-menu'), null, "search replaces the menu layer");
      assert.ok(container.querySelector('#guzide-search-panel'));
      assert.ok(container.querySelector('main[inert]'));
      assert.equal(document.body.style.overflow, "hidden", "the replacement panel retains its own scroll lock");
      assert.equal(document.activeElement, container.querySelector('#guzide-search-panel input'));
      await click('button[aria-label="Aramayı kapat"]');
      await React.act(async () => { resolveSearch(true); await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.equal(container.querySelector('#guzide-search-panel'), null);
      assert.equal(document.body.style.overflow, "");
      assert.equal(document.activeElement, container.querySelector('button[aria-label="Menüyü aç"]'), "the detached menu search control restores focus to its original menu trigger");
    });
  } finally { globalThis.fetch = previous; }
});
