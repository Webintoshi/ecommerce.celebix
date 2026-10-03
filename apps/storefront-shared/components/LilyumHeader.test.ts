import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

function setup() {
  let path = "/", opened = 0;
  const load = componentLoader({
    "next/navigation": { usePathname: () => path },
    "next/link": { __esModule: true, default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ cart: { itemCount: 2 }, drawerOpen: false, openDrawer: () => { opened++; } }) },
    "../../components/FavoriteStatusProvider": { useFavoriteStatus: () => ({ count: 3 }) },
    "../../components/use-hydrated": { useHydrated: () => true },
  });
  const { LilyumHeaderClient: Header } = load<{ LilyumHeaderClient: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/lilyum/LilyumHeaderClient.tsx", import.meta.url));
  return { Header, route(value: string) { path = value; }, calls: () => opened };
}
const props = { displayName: "Lilyum", locale: "tr", announcement: "Ordu’da aynı gün çiçek teslimatı", logo: { url: "https://media.example/real-logo.jpg", altText: "Gerçek logo" }, navigation: [{ name: "Lilyumlar", slug: "lilyumlar", children: [{ name: "Beyaz lilyum", slug: "beyaz-lilyum", children: [] }] }] };

test("Lilyum controls use real providers, localized routes, actual logo and nested navigation", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(subject.Header, props));
    const nav = container.querySelector('[aria-label="Alt gezinme"]'); assert.ok(nav);
    assert.deepEqual([...nav.querySelectorAll("a,button")].map(node => node.textContent?.replace(/\d/g, "").trim()), ["Ana Sayfa", "Keşfet", "Favoriler", "Sepet"]);
    assert.equal(nav.querySelector('a[href="/urunler"]')?.textContent, "Keşfet");
    assert.equal(nav.querySelector('a[href="/"]')?.getAttribute("aria-current"), "page");
    assert.equal(nav.querySelector('a[href="/favorites"]')?.getAttribute("aria-label"), "Favoriler, 3 ürün");
    await click('[aria-label="Alt gezinme"] button');
    assert.equal(subject.calls(), 1);
    assert.equal(container.querySelector(".lf-logo img")?.getAttribute("src"), props.logo.url);
    assert.ok(container.querySelector('a[href="/kategori/beyaz-lilyum"]'));
  });
});
test("Lilyum suppresses bottom navigation on checkout, product and keyboard form routes", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render }) => {
    for (const path of ["/checkout", "/checkout/payment/result", "/urun/pembe-lilyum", "/products/flower", "/account/login", "/search", "/odeme/hizli"]) {
      subject.route(path); await render(React.createElement(subject.Header, props));
      assert.equal(container.querySelector('[aria-label="Alt gezinme"]'), null, path);
    }
    subject.route("/kategori/lilyumlar"); await render(React.createElement(subject.Header, props));
    assert.equal(container.querySelector('[aria-label="Alt gezinme"] a[href="/urunler"]')?.getAttribute("aria-current"), "page");
  });
});
