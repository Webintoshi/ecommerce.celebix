import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

async function navigation(run: (fixture: { commit(route: string, pop?: boolean): Promise<void>; flush(): Promise<void>; scroll(top: number): void; position(): number; unmount(): Promise<void> }) => Promise<void>) {
  let pathname = "/urun/first";
  const load = componentLoader({ "next/navigation": { usePathname: () => pathname } });
  const { StorefrontNavigationScroll: Boundary } = load<{ StorefrontNavigationScroll: React.ComponentType }>(new URL("./StorefrontNavigationScroll.tsx", import.meta.url));
  await withProductBrowser(async ({ render }) => {
    const frames = new Map<number, FrameRequestCallback>(); let frame = 0;
    window.requestAnimationFrame = callback => { frames.set(++frame, callback); return frame; };
    window.cancelAnimationFrame = id => { frames.delete(id); };
    Object.defineProperties(window, { scrollY: { configurable: true, writable: true, value: 0 }, scrollX: { configurable: true, writable: true, value: 0 } });
    window.scrollTo = options => { assert.equal(typeof options, "object"); if (typeof options === "object") Object.assign(window, { scrollY: options.top, scrollX: options.left }); };
    window.history.replaceState({ __NA: true, keep: "next-state" }, "", pathname);
    await render(React.createElement(Boundary));
    await run({
      commit: async (route, pop = false) => {
        window.history.replaceState(window.history.state, "", route);
        if (pop) await React.act(async () => window.dispatchEvent(new window.PopStateEvent("popstate", { state: window.history.state })));
        pathname = window.location.pathname;
        await render(React.createElement(Boundary));
      },
      flush: async () => { const pending = [...frames.values()]; frames.clear(); await React.act(async () => pending.forEach(callback => callback(16))); },
      scroll: top => { Object.assign(window, { scrollY: top }); }, position: () => window.scrollY,
      unmount: () => render(null),
    });
    assert.equal(window.history.state.keep, "next-state", "the boundary never rewrites Next history state");
  });
}

test("a different product starts at the top even when its dynamic page template is reused", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    scroll(1480); await commit("/urun/second"); await flush(); assert.equal(position(), 0);
    scroll(900); await commit("/products/third"); await flush(); assert.equal(position(), 0);
  });
});
test("new catalog, checkout and tenant page destinations start at the top", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    for (const route of ["/kategori/kolyeler", "/checkout", "/en/products/example", "/"]) {
      scroll(1250); await commit(route); await flush(); assert.equal(position(), 0, route);
    }
  });
});
test("Back and Forward keep the browser's restored coordinate, then a fresh product resets normally", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    scroll(1734); await commit("/kategori/kolyeler?sort=price_asc", true); await flush(); assert.equal(position(), 1734);
    scroll(640); await commit("/urun/first", true); await flush(); assert.equal(position(), 640);
    await commit("/urun/new"); await flush(); assert.equal(position(), 0);
  });
});
test("same-page filters and panel history do not reset scrolling or suppress a later navigation", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    scroll(820); await commit("/urun/first?color=gold"); await flush(); assert.equal(position(), 820);
    await commit("/urun/first?color=gold", true); await flush(); assert.equal(position(), 820);
    await commit("/urun/new"); await flush(); assert.equal(position(), 0);
  });
});
test("an anchor destination is left to the browser's hash scrolling", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    scroll(1100); await commit("/#lilyum-delivery"); await flush(); assert.equal(position(), 1100);
  });
});
test("initial hydration, rerender and unmount do not rewind a restored page", async () => {
  await navigation(async ({ commit, flush, scroll, position, unmount }) => {
    scroll(560); await commit("/urun/first"); await flush(); assert.equal(position(), 560);
    await commit("/urun/new"); scroll(300); await unmount(); await flush(); assert.equal(position(), 300);
  });
});
test("a hash or same-page Back arriving before the settling frame keeps its restored position", async () => {
  await navigation(async ({ commit, flush, scroll, position }) => {
    await commit("/urun/second"); scroll(420); await commit("/urun/second#details"); await flush(); assert.equal(position(), 420);
    await commit("/urun/third"); scroll(680); await commit("/urun/third", true); await flush(); assert.equal(position(), 680);
  });
});
