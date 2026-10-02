import assert from "node:assert/strict";
import test from "node:test";
import React, { createContext, useContext, useState } from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];
type CartContextValue = { cart: { itemCount: number }; drawerOpen: boolean; openDrawer(trigger: HTMLElement): void };
type HeaderBrowser = Browser & { pushes: string[]; drawerTriggers: HTMLElement[]; scroll(y: number): Promise<void>; resizeDesktop(desktop: boolean): Promise<void>; flushFrames(): Promise<void> };

async function withHeader(run: (browser: HeaderBrowser) => Promise<void>, options: Readonly<{ desktop?: boolean; count?: number }> = {}) {
  const pushes: string[] = [], drawerTriggers: HTMLElement[] = [];
  const CartContext = createContext<CartContextValue | null>(null);
  function CartFixture({ children }: { children: React.ReactNode }) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    return React.createElement(CartContext.Provider, { value: { cart: { itemCount: options.count ?? 3 }, drawerOpen, openDrawer(trigger: HTMLElement) { drawerTriggers.push(trigger); setDrawerOpen(true); } } }, children);
  }
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push(route: string) { pushes.push(route); } }), usePathname: () => "/products" },
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
    "../../components/CartStatusProvider": { useCartStatus() { const value = useContext(CartContext); assert.ok(value, "header actions use the surrounding cart provider"); return value; } },
    "../../components/use-hydrated": { useHydrated: () => true },
  });
  const { SioraHeaderChrome: Chrome } = load<{ SioraHeaderChrome: Component }>(new URL("../themes/siora/SioraHeaderChrome.tsx", import.meta.url));
  const { SioraHeaderSearch: Search, SioraHeaderActions: Actions } = load<{ SioraHeaderSearch: Component; SioraHeaderActions: Component }>(new URL("../themes/siora/SioraHeaderActions.tsx", import.meta.url));
  await withProductBrowser(async (browser) => {
    const previous = { Node: globalThis.Node, HTMLDetailsElement: globalThis.HTMLDetailsElement, FormData: globalThis.FormData };
    Object.assign(globalThis, { Node: window.Node, HTMLDetailsElement: window.HTMLDetailsElement, FormData: window.FormData });
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0, scrollY = 0, desktop = options.desktop ?? true;
    window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
    window.cancelAnimationFrame = (id) => { frames.delete(id); };
    const desktopMedia = window.matchMedia("(min-width: 768px)");
    Object.defineProperty(desktopMedia, "matches", { configurable: true, get: () => desktop });
    window.matchMedia = () => desktopMedia;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const flushFrames = async () => React.act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); });
    try {
      const navigation = React.createElement("nav", { className: "siora-desktop-navigation" },
        React.createElement("a", { href: "/products", id: "all-products" }, "Tüm ürünler"),
        React.createElement("details", { id: "clothes" }, React.createElement("summary", null, "Giyim"), React.createElement("a", { href: "/categories/clothes" }, "Tüm giyim")),
        React.createElement("details", { id: "accessories" }, React.createElement("summary", null, "Aksesuar"), React.createElement("a", { href: "/categories/accessories" }, "Tüm aksesuarlar")));
      await browser.render(React.createElement(CartFixture, null, React.createElement(Chrome, { headerStyle: "solid", headerWidth: "wide", headerLayout: "menu_logo_actions" },
        React.createElement("div", { className: "siora-header-bar" }, React.createElement(Search), React.createElement(Actions)),
        React.createElement("div", { className: "siora-header-navigation-row" }, navigation))));
      const upper = browser.container.querySelector<HTMLElement>(".siora-header-bar");
      assert.ok(upper);
      Object.defineProperty(upper, "offsetHeight", { configurable: true, value: 80 });
      await run({ ...browser, pushes, drawerTriggers, flushFrames, scroll: async (y) => { scrollY = y; window.dispatchEvent(new window.Event("scroll")); await flushFrames(); }, resizeDesktop: async (value) => { desktop = value; desktopMedia.dispatchEvent(new window.Event("change")); await flushFrames(); } });
    } finally {
      await browser.render(null);
      Object.assign(globalThis, previous);
    }
  });
}

test("header search submits a trimmed real form query to an encoded search route", async () => {
  await withHeader(async ({ container, pushes }) => {
    const form = container.querySelector<HTMLFormElement>("form[role=search]");
    const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
    assert.ok(form && input);
    input.value = "  Mavi gömlek & denim  ";
    await React.act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(pushes, [`/search?q=${encodeURIComponent("Mavi gömlek & denim")}`]);
  });
});

test("whitespace search is invalid and a new input clears the validation before retry", async () => {
  await withHeader(async ({ container, pushes }) => {
    const form = container.querySelector<HTMLFormElement>("form[role=search]");
    const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
    assert.ok(form && input);
    input.value = "   ";
    await React.act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(pushes, []);
    assert.equal(input.validity.customError, true);
    input.value = "Ceket";
    await React.act(async () => { input.dispatchEvent(new window.Event("input", { bubbles: true })); });
    assert.equal(input.validity.customError, false);
    await React.act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
    assert.deepEqual(pushes, ["/search?q=Ceket"]);
  });
});

test("header cart reflects its surrounding provider count and opens that provider with the actual trigger", async () => {
  await withHeader(async ({ container, click, drawerTriggers }) => {
    const button = container.querySelector<HTMLButtonElement>('.siora-header-actions button[aria-haspopup="dialog"]');
    assert.ok(button);
    assert.equal(button.getAttribute("aria-label"), "Sepetim, 3 ürün");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(button.querySelector(".siora-header-cart-count")?.textContent, " (3)");
    await click(".siora-header-actions button");
    assert.deepEqual(drawerTriggers, [button]);
    assert.equal(button.getAttribute("aria-expanded"), "true");
  });
});

test("desktop scroll down compacts the header and makes its upper controls inert; scrolling up restores them", async () => {
  await withHeader(async ({ container, scroll }) => {
    const header = container.querySelector("header");
    const upper = container.querySelector<HTMLElement>(".siora-header-bar");
    assert.equal(header?.getAttribute("data-siora-compact"), "false");
    await scroll(240);
    assert.equal(header?.getAttribute("data-siora-scrolled"), "true");
    assert.equal(header?.getAttribute("data-siora-compact"), "true");
    assert.equal(upper?.inert, true);
    await scroll(200);
    assert.equal(header?.getAttribute("data-siora-compact"), "false");
    assert.equal(upper?.inert, false);
  });
});

test("keyboard focus in the navigation expands a compact header and keeps it expanded while engaged", async () => {
  await withHeader(async ({ container, scroll }) => {
    await scroll(240);
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "true");
    const link = container.querySelector<HTMLAnchorElement>("#all-products");
    assert.ok(link);
    await React.act(async () => link.focus());
    assert.equal(document.activeElement, link);
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "false");
    assert.equal(container.querySelector<HTMLElement>(".siora-header-bar")?.inert, false);
    await scroll(360);
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "false");
  });
});

test("Escape closes an open navigation menu and restores summary focus; an outside pointer closes it too", async () => {
  await withHeader(async ({ container }) => {
    const menu = container.querySelector<HTMLDetailsElement>("#clothes");
    const header = container.querySelector("header");
    assert.ok(menu && header);
    await React.act(async () => { menu.open = true; menu.dispatchEvent(new window.Event("toggle")); });
    await React.act(async () => { header.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    assert.equal(menu.open, false);
    assert.equal(document.activeElement, menu.querySelector("summary"));
    await React.act(async () => { menu.open = true; menu.dispatchEvent(new window.Event("toggle")); });
    await React.act(async () => { document.body.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true })); });
    assert.equal(menu.open, false);
  });
});

test("opening another desktop menu closes the previous one and keeps the header expanded", async () => {
  await withHeader(async ({ container, scroll, flushFrames }) => {
    const first = container.querySelector<HTMLDetailsElement>("#clothes");
    const second = container.querySelector<HTMLDetailsElement>("#accessories");
    assert.ok(first && second);
    await scroll(240);
    await React.act(async () => { first.open = true; first.dispatchEvent(new window.Event("toggle")); });
    await flushFrames();
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "false");
    await React.act(async () => { second.open = true; second.dispatchEvent(new window.Event("toggle")); });
    assert.equal(first.open, false);
    assert.equal(second.open, true);
  });
});

test("mobile scroll never compacts the header or makes controls inert", async () => {
  await withHeader(async ({ container, scroll }) => {
    await scroll(400);
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-scrolled"), "true");
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "false");
    assert.equal(container.querySelector<HTMLElement>(".siora-header-bar")?.inert, false);
    await scroll(550);
    assert.equal(container.querySelector("header")?.getAttribute("data-siora-compact"), "false");
  }, { desktop: false });
});

test("switching an open desktop menu to mobile closes it and leaves Escape available to mobile controls", async () => {
  await withHeader(async ({ container, resizeDesktop, flushFrames }) => {
    const menu = container.querySelector<HTMLDetailsElement>("#clothes");
    const header = container.querySelector("header");
    assert.ok(menu && header);
    await React.act(async () => { menu.open = true; menu.dispatchEvent(new window.Event("toggle")); });
    await flushFrames();
    assert.equal(menu.open, true);
    await resizeDesktop(false);
    assert.equal(menu.open, false, "the hidden desktop menu is closed at the mobile breakpoint");
    assert.equal(container.querySelector<HTMLElement>(".siora-header-bar")?.inert, false);
    const escape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await React.act(async () => { header.dispatchEvent(escape); });
    assert.equal(escape.defaultPrevented, false);
    assert.notEqual(document.activeElement, menu.querySelector("summary"));
    // A delayed native details toggle must not let hidden desktop navigation consume Escape.
    await React.act(async () => { menu.open = true; menu.dispatchEvent(new window.Event("toggle")); });
    const staleMenuEscape = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    await React.act(async () => { header.dispatchEvent(staleMenuEscape); });
    assert.equal(staleMenuEscape.defaultPrevented, false);
    assert.notEqual(document.activeElement, menu.querySelector("summary"));
    await React.act(async () => { menu.open = false; menu.dispatchEvent(new window.Event("toggle")); });
    await resizeDesktop(true);
    assert.equal(menu.open, false, "returning to desktop does not restore a stale menu");
  });
});
