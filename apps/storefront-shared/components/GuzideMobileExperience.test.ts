import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const id = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
type Component = React.ComponentType<Record<string, unknown>>;
function setup() {
  let pathname = "/", cartOpens = 0, menuOpens = 0, cartMounts = 0, refreshes = 0;
  const load = componentLoader({
    "next/navigation": { usePathname: () => pathname },
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ cart: { itemCount: 2 }, drawerOpen: false, openDrawer: () => { cartOpens++; }, refresh: async () => { refreshes++; return true; } }) },
    "../../components/FavoriteStatusProvider": { useFavoriteStatus: () => ({ count: 3, refresh: async () => {} }) },
    "../../components/use-hydrated": { useHydrated: () => true },
    "./GuzideBrowsingContinuity": { GuzideBrowsingContinuity: () => null },
  });
  const { GuzideClientFrame: Frame, GuzidePageBoundary: Boundary, useGuzideMobileExperience: useSession } = load<{ GuzideClientFrame: Component; GuzidePageBoundary: Component; useGuzideMobileExperience: () => { registerMenu(handler: (trigger: HTMLElement) => void): () => void } | null }>(new URL("../themes/guzide/GuzideMobileExperience.tsx", import.meta.url));
  function Header() {
    const session = useSession();
    React.useEffect(() => { cartMounts++; return session?.registerMenu(() => { menuOpens++; }); }, [session?.registerMenu]);
    return React.createElement("header", { "data-test-header": "normal" }, "Güzide");
  }
  const props = { storefrontId: id, className: "starter-storefront", header: React.createElement(Header), checkoutHeader: React.createElement("header", { "data-test-header": "checkout" }, "Ödeme"), footer: React.createElement("footer", {}, "Normal"), checkoutFooter: React.createElement("footer", {}, "Ödeme"), locale: "tr" };
  return { Frame, Boundary, props, path(value: string) { pathname = value; }, calls: () => ({ cartOpens, menuOpens, cartMounts, refreshes }) };
}

test("approved four mobile controls use the real providers and existing menu", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(subject.Frame, subject.props, "Ana sayfa"));
    const nav = container.querySelector('[aria-label="Alt gezinme"]'); assert.ok(nav);
    assert.deepEqual([...nav.querySelectorAll("a,button")].map(node => node.textContent?.replace(/\d/g, "").trim()), ["Ana Sayfa", "Keşfet", "Favoriler", "Sepet"]);
    assert.equal(nav.querySelector('a[href="/"]')?.getAttribute("aria-current"), "page");
    assert.equal(nav.querySelector('a[href="/favorites"]')?.getAttribute("aria-label"), "Favoriler, 3 ürün");
    await click('[aria-label="Alt gezinme"] button[aria-label="Keşfet"]');
    await click('[aria-label="Alt gezinme"] button[aria-label="Sepet, 2 ürün"]');
    assert.deepEqual(subject.calls(), { cartOpens: 1, menuOpens: 1, cartMounts: 1, refreshes: 0 });
  });
});

test("route changes retain chrome while product and form routes suppress bottom navigation", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render }) => {
    const view = (copy: string) => render(React.createElement(subject.Frame, subject.props, copy));
    await view("Ana sayfa");
    subject.path("/kategori/kolyeler"); await view("Kolyeler");
    assert.equal(subject.calls().cartMounts, 1, "the header is not reconstructed per page");
    assert.equal(container.querySelector('[aria-label="Keşfet"]')?.getAttribute("aria-current"), "page");
    for (const route of ["/urun/kolye-960", "/products/necklace", "/search", "/account/login", "/checkout", "/checkout/payment/result", "/odeme/hizli"]) {
      subject.path(route); await view(route);
      assert.equal(container.querySelector('[aria-label="Alt gezinme"]'), null, route);
      assert.equal(container.querySelector('[data-test-header="checkout"]') !== null, route === "/checkout");
    }
  });
});

test("nested page frames disappear only inside the exact tenant persistent frame", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render }) => {
    const child = React.createElement(subject.Boundary, { fallback: React.createElement("div", { "data-test-fallback": true }, "Legacy") }, React.createElement("article", {}, "Ürün"));
    await render(React.createElement(subject.Frame, subject.props, child));
    assert.equal(container.querySelector("main article")?.textContent, "Ürün");
    assert.equal(container.querySelector("[data-test-fallback]"), null);
    assert.equal(container.querySelectorAll("main").length, 1);
    await render(child); assert.ok(container.querySelector("[data-test-fallback]"));
    await render(React.createElement(subject.Frame, { ...subject.props, storefrontId: "00000000-0000-4000-8000-000000000001" }, child));
    assert.ok(container.querySelector("[data-test-fallback]"));
    assert.equal(container.querySelector('[aria-label="Alt gezinme"]'), null);
  });
});


test("checkout entry revalidates persistent server cart while auth/quick-order retain their own main", async () => {
  const subject = setup();
  await withProductBrowser(async ({ container, render }) => {
    const view = (child: React.ReactNode) => render(React.createElement(subject.Frame, subject.props, child));
    await view("Catalogue");
    subject.path("/checkout"); await view("Checkout");
    assert.equal(subject.calls().refreshes, 1, "entering checkout refreshes the server cart once");
    subject.path("/checkout/payment/result"); await view("Result");
    assert.equal(subject.calls().refreshes, 1);
    assert.ok(container.querySelector('[data-test-header="normal"]'), "result preserves its existing shopping header");
    for (const route of ["/account/login", "/account/profile/verify-phone", "/odeme/hizli"]) {
      subject.path(route); await view(React.createElement("main", {}, "Standalone"));
      assert.equal(container.querySelectorAll("main").length, 1);
      assert.equal(container.querySelector("header"), null);
      assert.equal(container.querySelector("footer"), null);
      assert.equal(container.querySelector('[aria-label="Alt gezinme"]'), null);
    }
  });
});
