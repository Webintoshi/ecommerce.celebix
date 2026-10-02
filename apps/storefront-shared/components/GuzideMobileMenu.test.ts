import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PublicStarterNavigation, PublicStorefrontAsset } from "@celebix/saas-contracts";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../lib/storefront-routes.ts";
import { isValidProductCatalogSearch } from "../lib/product-catalog-query.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
type Browser = Parameters<Parameters<typeof withProductBrowser>[0]>[0];
type MenuBrowser = Browser & {
  pushes: string[];
  flushFrames(): Promise<void>;
  open(): Promise<void>;
  submitSearch(value: string): Promise<void>;
  resize(width: number): Promise<void>;
  navigate(pathname: string): Promise<void>;
};

const navigation: PublicStarterNavigation = { items: [
  { name: "Kolyeler", slug: "kolyeler", children: [
    { name: "Taşlı Kolyeler", slug: "tasli-kolyeler", children: [
      { name: "Kalp Modelleri", slug: "kalp-modelleri", children: [] },
    ] },
    { name: "Sade Kolyeler", slug: "sade-kolyeler", children: [] },
  ] },
  { name: "Bileklikler", slug: "bileklikler", children: [] },
  { name: "Evlilik Koleksiyonu", slug: "evlilik", kind: "catalog_collection", resourceId: "00000000-0000-4000-8000-000000000003", path: "/collections/evlilik", children: [] },
] };
const photo: PublicStorefrontAsset = { url: "https://media.example.test/guzide/kolyeler.webp", altText: "Kolyeler kategori fotoğrafı", mediaType: "image/webp", width: 640, height: 854 };
const logo = { url: "https://media.example.test/guzide/logo.webp", altText: "Güzide Kuyumcu", width: 1920, height: 891 };

function Link({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  return React.createElement("a", props, children);
}

async function withMenu(run: (browser: MenuBrowser) => Promise<void>, config: Readonly<{
  locale?: string;
  pathname?: string;
  navigation?: PublicStarterNavigation;
  menuImages?: Record<string, PublicStorefrontAsset>;
  supportEmail?: string;
  logo?: typeof logo | null;
}> = {}) {
  let pathname = config.pathname ?? "/urun/kolye-960", width = 390;
  const pushes: string[] = [];
  const load = componentLoader({
    "next/link": { __esModule: true, default: Link },
    "next/navigation": { usePathname: () => pathname, useRouter: () => ({ push(href: string) { pushes.push(href); } }) },
    "./StoreUtilities": { StoreUtilities: () => React.createElement("nav", { "aria-label": "Mağaza araçları" }, React.createElement("a", { href: "/account" }, "Hesabım")) },
    "@/lib/storefront-routes.ts": { categoryPath, localizeStorefrontPath, productIndexPath },
    "@/lib/product-catalog-query.ts": { isValidProductCatalogSearch },
  });
  const { GuzideHeaderClient: Header } = load<{ GuzideHeaderClient: Component }>(new URL("../themes/guzide/GuzideHeaderClient.tsx", import.meta.url));
  await withProductBrowser(async (browser) => {
    const original = { matchMedia: window.matchMedia, requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame, globalFrame: globalThis.requestAnimationFrame, globalCancel: globalThis.cancelAnimationFrame, FormData: globalThis.FormData };
    Object.assign(globalThis, { FormData: window.FormData });
    const queries = new Map<string, MediaQueryList>();
    const matches = (query: string) => {
      const minimum = /min-width:\s*(\d+)px/u.exec(query), maximum = /max-width:\s*(\d+)px/u.exec(query);
      return (!minimum || width >= Number(minimum[1])) && (!maximum || width <= Number(maximum[1]));
    };
    window.matchMedia = (query) => {
      if (!queries.has(query)) {
        const target = new window.EventTarget();
        Object.defineProperties(target, { media: { value: query }, matches: { get: () => matches(query) }, onchange: { writable: true, value: null } });
        Object.assign(target, { addListener: (callback: EventListener) => target.addEventListener("change", callback), removeListener: (callback: EventListener) => target.removeEventListener("change", callback) });
        queries.set(query, target as unknown as MediaQueryList);
      }
      return queries.get(query)!;
    };
    Object.defineProperty(window, "innerWidth", { configurable: true, get: () => width });
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    const frame = (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; };
    const cancelFrame = (id: number) => { frames.delete(id); };
    window.requestAnimationFrame = globalThis.requestAnimationFrame = frame;
    window.cancelAnimationFrame = globalThis.cancelAnimationFrame = cancelFrame;
    const flushFrames = async () => {
      for (let round = 0; round < 5 && frames.size; round++) {
        await React.act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0)); });
      }
    };
    const props = { displayName: "Güzide Kuyumcu", locale: config.locale ?? "tr", logo: config.logo === null ? null : config.logo ?? logo, navigation: config.navigation ?? navigation, desktopNavigation: React.createElement("nav", { "aria-label": "Ana menü" }, React.createElement("a", { href: "/urunler", "data-test-desktop": true }, "Ürünler")), menuImages: config.menuImages ?? { kolyeler: photo }, supportEmail: config.supportEmail };
    const renderHeader = () => browser.render(React.createElement(Header, props));
    try {
      await renderHeader();
      await run({ ...browser, pushes, flushFrames,
        open: async () => { await browser.click('button[aria-label="Menüyü aç"]'); await flushFrames(); },
        submitSearch: async (value) => {
          const input = browser.container.querySelector<HTMLInputElement>('#campaign-mobile-menu input[name="q"]');
          const form = input?.closest("form");
          assert.ok(input && form, "the menu exposes a real search input and form");
          await React.act(async () => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); });
          await React.act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
          await flushFrames();
        },
        resize: async (value) => {
          width = value;
          await React.act(async () => { for (const [query, target] of queries) { const event = new window.Event("change"); Object.defineProperties(event, { matches: { value: matches(query) }, media: { value: query } }); target.dispatchEvent(event); } window.dispatchEvent(new window.Event("resize")); });
          await flushFrames();
        },
        navigate: async (value) => { pathname = value; await renderHeader(); await flushFrames(); },
      });
    } finally {
      await browser.render(null);
      window.matchMedia = original.matchMedia;
      window.requestAnimationFrame = original.requestAnimationFrame;
      window.cancelAnimationFrame = original.cancelAnimationFrame;
      Object.assign(globalThis, { requestAnimationFrame: original.globalFrame, cancelAnimationFrame: original.globalCancel, FormData: original.FormData });
    }
  });
}

function menu(container: HTMLElement) {
  const dialog = container.querySelector<HTMLElement>("#campaign-mobile-menu");
  assert.ok(dialog, "the mobile menu is open");
  return dialog;
}

function back(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Ana menüye dön"],button[aria-label="Önceki menüye dön"]');
  assert.ok(button, "drill-down has an accessible back control");
  return button;
}

test("Güzide menu opens as a labelled modal with the existing logo, ordered admin categories and real image", async () => {
  await withMenu(async ({ container, open }) => {
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    await open();
    const dialog = menu(container);
    assert.equal(dialog.getAttribute("role"), "dialog");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.ok(dialog.getAttribute("aria-label") || dialog.getAttribute("aria-labelledby"));
    assert.equal(container.querySelector('button[aria-label="Menüyü aç"]')?.getAttribute("aria-expanded"), "true");
    assert.equal(document.activeElement, dialog.querySelector('button[aria-label="Menüyü kapat"]'), "opening the menu gives its close control keyboard focus");
    assert.equal(dialog.querySelector<HTMLImageElement>(`img[src="${logo.url}"]`)?.alt, logo.altText);
    const nav = dialog.querySelector("[data-guzide-menu-level]");
    assert.ok(nav);
    const labels = [...nav.querySelectorAll("[data-menu-index]")].map((item) => item.textContent?.trim());
    assert.deepEqual(labels, ["Kolyeler", "Bileklikler", "Evlilik Koleksiyonu"]);
    assert.ok(nav.querySelector(`img[src="${photo.url}"]`));
    assert.equal(dialog.querySelector<HTMLLabelElement>('label[for]')?.textContent, "Ürün veya kategori ara");
    assert.equal(document.body.style.overflow, "hidden");
  });
});

test("Güzide leaf category and collection preserve canonical Turkish destinations and close without a second tap", async () => {
  await withMenu(async ({ container, open, click, flushFrames }) => {
    await open();
    assert.ok(menu(container).querySelector('a[href="/kategori/bileklikler"]'));
    assert.ok(menu(container).querySelector('a[href="/koleksiyon/evlilik"]'));
    await click('#campaign-mobile-menu a[href="/kategori/bileklikler"]');
    await flushFrames();
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "");
  });
});

test("Güzide non-Turkish menus retain legacy category and collection routes", async () => {
  await withMenu(async ({ container, open }) => {
    await open();
    assert.ok(menu(container).querySelector('a[href="/categories/bileklikler"]'));
    assert.ok(menu(container).querySelector('a[href="/collections/evlilik"]'));
  }, { locale: "en-US" });
});

test("Güzide three-level navigation gives each category its own browse link and returns focus through the original controls", async () => {
  await withMenu(async ({ container, open, click, flushFrames }) => {
    await open();
    const root = menu(container).querySelector<HTMLButtonElement>('button[data-menu-index="0"]');
    assert.ok(root);
    await click('#campaign-mobile-menu button[data-menu-index="0"]');
    await flushFrames();
    assert.ok(menu(container).querySelector('a[href="/kategori/kolyeler"]'));
    assert.ok(menu(container).querySelector('a[href="/kategori/sade-kolyeler"]'));
    assert.equal(document.activeElement, back(container));
    await click('#campaign-mobile-menu button[data-menu-index="0"]');
    await flushFrames();
    assert.ok(menu(container).querySelector('a[href="/kategori/tasli-kolyeler"]'));
    assert.ok(menu(container).querySelector('a[href="/kategori/kalp-modelleri"]'));
    assert.equal(document.activeElement, back(container));
    await React.act(async () => back(container).click());
    await flushFrames();
    assert.ok(menu(container).querySelector('a[href="/kategori/sade-kolyeler"]'));
    assert.equal(document.activeElement, menu(container).querySelector('button[data-menu-index="0"]'));
    await React.act(async () => back(container).click());
    await flushFrames();
    assert.ok(menu(container).querySelector('a[href="/kategori/bileklikler"]'));
    assert.equal(document.activeElement, menu(container).querySelector('button[data-menu-index="0"]'));
  });
});

test("Güzide search submits one trimmed and encoded real query and closes even on the same search pathname", async () => {
  await withMenu(async ({ container, open, submitSearch, pushes }) => {
    await open();
    await submitSearch("  Altın kolye & kalp  ");
    assert.deepEqual(pushes, [`/search?q=${encodeURIComponent("Altın kolye & kalp")}`]);
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "");
  }, { pathname: "/search" });
});

test("Güzide search rejects whitespace, control characters and text beyond the public 100-byte limit before navigating", async () => {
  for (const value of ["   ", "altın\u0001kolye", "altın\u0085kolye", "ş".repeat(51)]) {
    await withMenu(async ({ container, open, submitSearch, pushes }) => {
      await open();
      await submitSearch(value);
      assert.deepEqual(pushes, []);
      const input = menu(container).querySelector<HTMLInputElement>('input[name="q"]');
      assert.ok(input);
      assert.equal(input.validity.customError, true);
      assert.equal(document.body.style.overflow, "hidden");
      await submitSearch("  Kolye  ");
      assert.deepEqual(pushes, ["/search?q=Kolye"]);
      assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    });
  }
});

test("Güzide modal keyboard trap includes its search field and Escape restores the real menu trigger", async () => {
  await withMenu(async ({ container, open, flushFrames }) => {
    await open();
    const dialog = menu(container), input = dialog.querySelector<HTMLInputElement>('input[name="q"]');
    assert.ok(input);
    const focusables = [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter((node) => !node.closest('[hidden],[inert]'));
    assert.ok(focusables.includes(input));
    const first = focusables[0]!, last = focusables.at(-1)!;
    await React.act(async () => { first.focus(); first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    assert.equal(document.activeElement, last);
    await React.act(async () => { last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    assert.equal(document.activeElement, first);
    await React.act(async () => { input.focus(); input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    await flushFrames();
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.activeElement, container.querySelector('button[aria-label="Menüyü aç"]'));
    assert.equal(document.body.style.overflow, "");
  });
});

test("Güzide close control and backdrop both restore the prior body overflow", async () => {
  await withMenu(async ({ container, open, click, flushFrames }) => {
    document.body.style.overflow = "clip";
    await open();
    await click('#campaign-mobile-menu button[aria-label="Menüyü kapat"]');
    await flushFrames();
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "clip");
    await open();
    const backdrop = menu(container).parentElement!;
    await React.act(async () => { backdrop.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true })); });
    await flushFrames();
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "clip");
  });
});

test("Güzide menu releases the body lock when its header unmounts", async () => {
  await withMenu(async ({ open, render }) => {
    document.body.style.overflow = "auto";
    await open();
    assert.equal(document.body.style.overflow, "hidden");
    await render(null);
    assert.equal(document.body.style.overflow, "auto");
  });
});

test("Güzide mobile drawer closes at the 1025px desktop breakpoint and never reopens on resize back", async () => {
  await withMenu(async ({ container, open, resize }) => {
    await open();
    await resize(1024);
    assert.ok(container.querySelector("#campaign-mobile-menu"));
    await resize(1025);
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "");
    await resize(390);
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(container.querySelector('button[aria-label="Menüyü aç"]')?.getAttribute("aria-expanded"), "false");
  });
});

test("Güzide route changes dismiss the mobile menu without leaving a stale child pane or scroll lock", async () => {
  await withMenu(async ({ container, open, click, navigate, flushFrames }) => {
    await open();
    await click('#campaign-mobile-menu button[data-menu-index="0"]');
    await flushFrames();
    await navigate("/kategori/bileklikler");
    assert.equal(container.querySelector("#campaign-mobile-menu"), null);
    assert.equal(document.body.style.overflow, "");
    await open();
    assert.ok(menu(container).querySelector('a[href="/kategori/bileklikler"]'));
    assert.equal(menu(container).querySelector('button[aria-label="Ana menüye dön"]'), null);
  });
});

test("Güzide no-image and no-logo fallback keeps all real destinations usable without fake content", async () => {
  await withMenu(async ({ container, open }) => {
    await open();
    const dialog = menu(container);
    assert.equal(dialog.querySelector("img"), null);
    assert.match(dialog.textContent ?? "", /Güzide Kuyumcu/u);
    assert.ok(dialog.querySelector('a[href="/kategori/bileklikler"]'));
    assert.equal(dialog.querySelector('a[href^="mailto:"]'), null);
    assert.equal(dialog.querySelector('a[href^="https://wa.me"]'), null);
    assert.ok(container.querySelector("[data-test-desktop]"), "the existing desktop navigation remains mounted");
  }, { logo: null, menuImages: {} });
});

test("Güzide support links use only the actual tenant email and utility routes", async () => {
  await withMenu(async ({ container, open }) => {
    await open();
    const dialog = menu(container);
    assert.ok(dialog.querySelector('a[href="mailto:info@guzidekuyumcu.com.tr"]'));
    assert.ok(dialog.querySelector('a[href="/favorites"]'));
    assert.ok(dialog.querySelector('a[href="/account"]'));
  }, { supportEmail: "info@guzidekuyumcu.com.tr" });
});
