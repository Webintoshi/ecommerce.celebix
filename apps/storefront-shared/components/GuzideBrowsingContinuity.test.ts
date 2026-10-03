import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const STORE = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const CATALOG = "/kategori/kolyeler?filter=in_stock&sort=price_asc&offset=24";
const PRODUCT = "/urun/kolye-960";
type ContinuityModule = { useGuzideBrowsingContinuity(options: { storefrontId: string; pathname: string; query: string; overlayOpen?: boolean }): void; guzideBrowsingReturnRoute(storefrontId: string): string | null };
type Panel = { open(): boolean; close(): Promise<boolean>; ownsEntry(): boolean };
type PanelModule = { useGuzidePanelHistory(options: { storefrontId: string; panel: string; onClose(reason: string): void; onBackWithinPanel?(): boolean }): Panel };

async function withNavigation(run: (fixture: {
  renderContinuity(options?: { storefrontId?: string; overlayOpen?: boolean }): Promise<void>;
  renderPanel(storefrontId?: string, onBackWithinPanel?: () => boolean): Promise<void>;
  renderReturn(storefrontId?: string): Promise<void>;
  clickReturn(modified?: boolean): Promise<void>;
  container: HTMLElement;
  backCalls(): number;
  unmount(): Promise<void>;
  clickProduct(href?: string, modified?: boolean): Promise<void>;
  pop(route: string, state: unknown): Promise<void>;
  flushFrames(): Promise<void>;
  scroll(top: number): Promise<void>;
  continuity: ContinuityModule;
  panel(): Panel;
  closed: string[];
  frames: Map<number, FrameRequestCallback>;
  scrolls: number[];
}) => Promise<void>) {
  let pathname = "/", query = "", nextFrame = 0, backCalls = 0;
  function Link({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) { return React.createElement("a", props, children); }
  const load = componentLoader({ "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query), useRouter: () => ({ back() { backCalls += 1; } }) }, "next/link": { __esModule: true, default: Link } });
  const continuity = load<ContinuityModule>(new URL("../themes/guzide/useGuzideBrowsingContinuity.ts", import.meta.url));
  const panelModule = load<PanelModule>(new URL("../themes/guzide/useGuzidePanelHistory.ts", import.meta.url));
  const { GuzideProductReturn: Return } = load<{ GuzideProductReturn: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/guzide/GuzideProductReturn.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    const frames = new Map<number, FrameRequestCallback>(), scrolls: number[] = [], closed: string[] = [];
    let panel: Panel;
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    window.requestAnimationFrame = (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { frames.delete(id); };
    Object.defineProperties(window, { scrollY: { configurable: true, writable: true, value: 0 }, scrollX: { configurable: true, writable: true, value: 0 }, innerHeight: { configurable: true, value: 844 } });
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 10_000 });
    window.scrollTo = (options) => { if (typeof options === "object") { scrolls.push(options.top ?? 0); Object.assign(window, { scrollY: options.top ?? 0 }); } };
    const updateRoute = () => { pathname = window.location.pathname; query = window.location.search.slice(1); };
    function Harness({ storefrontId = STORE, overlayOpen = false }: { storefrontId?: string; overlayOpen?: boolean }) { continuity.useGuzideBrowsingContinuity({ storefrontId, pathname, query, overlayOpen }); return null; }
    function PanelHarness({ storefrontId = STORE, onBackWithinPanel }: { storefrontId?: string; onBackWithinPanel?: () => boolean }) { panel = panelModule.useGuzidePanelHistory({ storefrontId, panel: "menu", onClose: reason => closed.push(reason), onBackWithinPanel }); return null; }
    const renderContinuity = async (options = {}) => { updateRoute(); await render(React.createElement(Harness, options)); };
    await run({
      continuity, closed, frames, scrolls, container, backCalls: () => backCalls, panel: () => panel!, renderContinuity,
      renderPanel: async (storefrontId = STORE, onBackWithinPanel?: () => boolean) => { updateRoute(); await render(React.createElement(PanelHarness, { storefrontId, onBackWithinPanel })); },
      renderReturn: async (storefrontId = STORE) => { updateRoute(); await render(React.createElement(Return, { storefrontId, fallbackHref: "/kategori/kolyeler", fallbackLabel: "Kolyelere dön" })); },
      clickReturn: async (modified = false) => { const link = container.querySelector("a"); assert.ok(link); const prevent = (event: Event) => event.preventDefault(); container.addEventListener("click", prevent); try { await React.act(async () => link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: modified }))); } finally { container.removeEventListener("click", prevent); } },
      unmount: () => render(null),
      clickProduct: async (href = PRODUCT, modified = false) => {
        const link = document.createElement("a"); link.href = href; link.textContent = "Ürün"; link.addEventListener("click", event => event.preventDefault()); container.append(link);
        await React.act(async () => link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: modified })));
        link.remove();
      },
      pop: async (route, state) => { window.history.replaceState(state, "", route); updateRoute(); await React.act(async () => window.dispatchEvent(new window.PopStateEvent("popstate", { state }))); },
      flushFrames: async () => { for (let count = 0; count < 12 && frames.size; count += 1) { const current = [...frames]; frames.clear(); await React.act(async () => { current.forEach(([, callback]) => callback(count * 16)); }); } },
      scroll: async top => { Object.assign(window, { scrollY: top }); await React.act(async () => window.dispatchEvent(new window.Event("scroll"))); },
    });
  });
}

test("Güzide returns from a clicked product to the exact filtered catalog entry and saved position", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, continuity, pop, flushFrames, scrolls }) => {
    const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["kategori", {}] }], keep: "yes" };
    window.history.replaceState(nextState, "", CATALOG);
    const length = window.history.length;
    await renderContinuity();
    assert.equal(window.history.length, length, "initial load adds no history entry");
    assert.equal(window.history.state.keep, "yes");
    Object.assign(window, { scrollY: 1734 });
    await clickProduct();
    const catalogState = window.history.state;
    window.history.pushState({ __NA: true }, "", PRODUCT);
    Object.assign(window, { scrollY: 0 });
    await renderContinuity();
    assert.equal(continuity.guzideBrowsingReturnRoute(STORE), CATALOG);
    const productState = window.history.state;
    await renderContinuity();
    assert.deepEqual(window.history.state, productState, "same entry rerenders never bind a second token");
    await pop(CATALOG, catalogState);
    await renderContinuity();
    await flushFrames();
    assert.equal(scrolls.at(-1), 1734);
    assert.equal(window.location.search, "?filter=in_stock&sort=price_asc&offset=24");
  });
});

test("Güzide tracks separate same-path query entries and never restores a different filter", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, pop, flushFrames, scrolls }) => {
    window.history.replaceState({ __NA: true }, "", "/search?q=kolye&sort=price_asc"); await renderContinuity();
    Object.assign(window, { scrollY: 900 }); await clickProduct(); const firstState = window.history.state;
    window.history.pushState({ __NA: true }, "", "/search?q=kolye&sort=price_desc"); Object.assign(window, { scrollY: 0 }); await renderContinuity();
    Object.assign(window, { scrollY: 420 }); await clickProduct(); const secondState = window.history.state;
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity();
    await pop("/search?q=kolye&sort=price_asc", firstState); await renderContinuity(); await flushFrames();
    assert.equal(scrolls.at(-1), 900);
    await pop("/search?q=kolye&sort=price_desc", secondState); await renderContinuity(); await flushFrames();
    assert.equal(scrolls.at(-1), 420);
  });
});

test("Güzide home rail position is restored without forcing a new initial visit to an old position", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, pop, flushFrames, scrolls }) => {
    window.history.replaceState({ __NA: true }, "", "/"); await renderContinuity(); Object.assign(window, { scrollY: 1080 }); await clickProduct(); const state = window.history.state;
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity();
    await pop("/", state); await renderContinuity(); await flushFrames(); assert.equal(scrolls.at(-1), 1080);
    await renderContinuity(); const prior = scrolls.length;
    window.history.pushState({ __NA: true }, "", "/"); await renderContinuity(); await flushFrames(); assert.equal(scrolls.length, prior);
  });
});

test("Güzide consumed product return cannot create a product checkout product reverse loop", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, continuity }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity(); await clickProduct();
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), CATALOG);
    window.history.pushState({ __NA: true }, "", "/checkout"); await renderContinuity();
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), null);
  });
});

test("Güzide rejects foreign tenant returns and foreign, modified or non-product link clicks", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, continuity, unmount }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity({ storefrontId: "other-tenant" }); const before = window.sessionStorage.length;
    await clickProduct(); assert.equal(window.sessionStorage.length, before); await unmount();
    await renderContinuity();
    for (const [destination, modified] of [["https://foreign.invalid/urun/example", false], ["/account", false], [PRODUCT, true]] as const) {
      await clickProduct(destination, modified); window.history.replaceState({ __NA: true }, "", PRODUCT); await renderContinuity();
      assert.equal(continuity.guzideBrowsingReturnRoute(STORE), null); window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity();
    }
    await clickProduct(); window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity();
    assert.equal(continuity.guzideBrowsingReturnRoute("other-tenant"), null);
  });
});

test("Güzide scroll restoration cancels on user input and unmount without overwriting an open overlay", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, pop, flushFrames, scrolls, frames, unmount }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity(); Object.assign(window, { scrollY: 800 }); await clickProduct(); const state = window.history.state;
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity();
    await pop(CATALOG, state); await renderContinuity(); window.dispatchEvent(new window.Event("touchstart")); await flushFrames(); assert.equal(scrolls.length, 0);
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity({ overlayOpen: true });
    await pop(CATALOG, state); await renderContinuity({ overlayOpen: true }); await flushFrames(); assert.equal(scrolls.length, 0);
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity({ overlayOpen: false });
    await pop(CATALOG, state); assert.ok(frames.size > 0); await unmount(); assert.equal(frames.size, 0);
  });
});

test("Güzide panel pushes one owned entry, preserves Next state, and closes on browser Back", async () => {
  await withNavigation(async ({ renderPanel, panel, pop, closed }) => {
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", { children: ["kategori", {}] }], unrelated: "keep" };
    window.history.replaceState(state, "", CATALOG); const length = window.history.length; await renderPanel(); assert.equal(window.history.length, length);
    assert.equal(panel().open(), true); assert.equal(panel().open(), true); assert.equal(window.history.length, length + 1); assert.equal(panel().ownsEntry(), true); assert.equal(window.history.state.unrelated, "keep");
    await pop(CATALOG, state); assert.deepEqual(closed, ["back"]); assert.equal(panel().ownsEntry(), false);
  });
});

test("Güzide panel same-path query change cancels stale ownership instead of going back", async () => {
  await withNavigation(async ({ renderPanel, panel, closed }) => {
    window.history.replaceState({ __NA: true }, "", "/search?q=kolye"); await renderPanel(); assert.equal(panel().open(), true);
    window.history.pushState({ __NA: true }, "", "/search?q=yuzuk"); await renderPanel();
    assert.equal(panel().ownsEntry(), false); assert.deepEqual(closed, ["navigate"]); assert.equal(await panel().close(), true); assert.equal(window.location.search, "?q=yuzuk");
  });
});

test("Güzide panel rejects other tenants and denied history, and unmount settles outstanding close", async () => {
  await withNavigation(async ({ renderPanel, panel, unmount }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderPanel("other-tenant"); assert.equal(panel().open(), false); await unmount();
    await renderPanel(); const push = window.history.pushState.bind(window.history); window.history.pushState = () => { throw new Error("denied"); };
    assert.equal(panel().open(), false); window.history.pushState = push;
    assert.equal(panel().open(), true); window.history.back = () => {}; const waiting = panel().close(); await unmount(); assert.equal(await waiting, false);
    assert.equal(window.history.state.__celebixGuzidePanel, undefined);
  });
});

test("Güzide browser Back consumes submenu levels before closing the root menu", async () => {
  await withNavigation(async ({ renderPanel, panel, pop, closed }) => {
    const state = { __NA: true, unrelated: "keep" }; let depth = 2;
    window.history.replaceState(state, "", CATALOG);
    await renderPanel(STORE, () => { if (!depth) return false; depth -= 1; return true; });
    assert.equal(panel().open(), true);
    await pop(CATALOG, state); assert.equal(depth, 1); assert.equal(panel().ownsEntry(), true); assert.deepEqual(closed, []);
    await pop(CATALOG, state); assert.equal(depth, 0); assert.equal(panel().ownsEntry(), true); assert.equal(window.history.state.unrelated, "keep");
    await pop(CATALOG, state); assert.equal(panel().ownsEntry(), false); assert.deepEqual(closed, ["back"]);
  });
});

test("Güzide programmatic close consumes the complete menu entry without stepping through submenu levels", async () => {
  await withNavigation(async ({ renderPanel, panel, pop, closed }) => {
    const state = { __NA: true }; let childBacks = 0;
    window.history.replaceState(state, "", CATALOG);
    await renderPanel(STORE, () => { childBacks += 1; return true; }); assert.equal(panel().open(), true);
    window.history.back = () => {}; const first = panel().close(), second = panel().close(); assert.equal(first, second);
    await pop(CATALOG, state); assert.equal(await first, true); assert.equal(childBacks, 0); assert.deepEqual(closed, ["navigate"]);
  });
});

test("Güzide browsing state cannot be replayed on another host or a desktop visit", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, continuity, unmount, renderPanel, panel }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity(); await clickProduct();
    const storage = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index)!);
    const values = storage.map(key => [key, window.sessionStorage.getItem(key)!] as const);
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), CATALOG);
    const marker = window.history.state; await unmount();
    window.location.href = "https://other-shop.invalid/urun/kolye-960";
    for (const [key, value] of values) window.sessionStorage.setItem(key, value);
    window.history.replaceState(marker, "", PRODUCT); await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), null);
    await unmount(); window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
    window.history.replaceState({ __NA: true }, "", CATALOG); const length = window.history.length; await renderContinuity(); await clickProduct();
    assert.equal(window.history.length, length); assert.deepEqual(window.history.state, { __NA: true });
    await unmount(); await renderPanel(); assert.equal(panel().open(), false);
  });
});

test("Güzide a direct product load or denied storage never manufactures a catalog Back token", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, continuity }) => {
    window.history.replaceState({ __NA: true }, "", PRODUCT); const length = window.history.length;
    await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), null); assert.equal(window.history.length, length); assert.deepEqual(window.history.state, { __NA: true });
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity();
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("denied"); } });
    await clickProduct(); window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); assert.equal(continuity.guzideBrowsingReturnRoute(STORE), null);
  });
});

test("Güzide PDP return link keeps the filter URL and uses native Back only for its bound product entry", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, renderReturn, flushFrames, clickReturn, backCalls, container }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity(); await clickProduct();
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); await renderReturn(); await flushFrames();
    assert.equal(container.querySelector("a")?.getAttribute("href"), CATALOG); assert.match(container.textContent ?? "", /Kolyelere dön/u);
    await clickReturn(true); assert.equal(backCalls(), 0, "modified click retains ordinary link behavior");
    await clickReturn(); assert.equal(backCalls(), 1);
  });
});

test("Güzide PDP direct entry retains the actual category fallback without arbitrary history Back", async () => {
  await withNavigation(async ({ renderContinuity, renderReturn, flushFrames, clickReturn, backCalls, container }) => {
    window.history.replaceState({ __NA: true }, "", PRODUCT); await renderContinuity(); await renderReturn(); await flushFrames();
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/kategori/kolyeler");
    await clickReturn(); assert.equal(backCalls(), 0);
  });
});

test("Güzide PDP home arrival returns to home with a correct label and survives same-entry remount", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, renderReturn, flushFrames, continuity, unmount, container }) => {
    window.history.replaceState({ __NA: true }, "", "/"); await renderContinuity(); await clickProduct();
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); await unmount(); await renderContinuity();
    assert.equal(continuity.guzideBrowsingReturnRoute(STORE), "/"); await renderReturn(); await flushFrames();
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/"); assert.match(container.textContent ?? "", /Ana sayfaya dön/u);
  });
});

test("Güzide PDP related-product route changes clear the old entry return before showing the fallback", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, renderReturn, flushFrames, clickReturn, backCalls, container }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity(); await clickProduct();
    window.history.pushState({ __NA: true }, "", PRODUCT); await renderContinuity(); await renderReturn(); await flushFrames();
    assert.equal(container.querySelector("a")?.getAttribute("href"), CATALOG);
    window.history.pushState({ __NA: true }, "", "/urun/ilgili-kolye"); await renderReturn(); await flushFrames();
    assert.equal(container.querySelector("a")?.getAttribute("href"), "/kategori/kolyeler"); await clickReturn(); assert.equal(backCalls(), 0);
  });
});

test("Güzide consuming an overlay on the current catalog entry never jumps to older stored coordinates", async () => {
  await withNavigation(async ({ renderContinuity, clickProduct, pop, flushFrames, scrolls }) => {
    window.history.replaceState({ __NA: true }, "", CATALOG); await renderContinuity();
    Object.assign(window, { scrollY: 400 }); await clickProduct(); const sourceState = window.history.state;
    Object.assign(window, { scrollY: 850 });
    window.history.pushState({ ...sourceState, __celebixGuzidePanel: { owner: "visible-menu" } }, "", CATALOG);
    await renderContinuity({ overlayOpen: true }); await renderContinuity({ overlayOpen: false });
    await pop(CATALOG, sourceState); await flushFrames();
    assert.equal(scrolls.length, 0); assert.equal(window.scrollY, 850);
  });
});
