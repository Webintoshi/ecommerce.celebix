import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const { StorefrontBanner } = componentLoader()<{ StorefrontBanner: React.ComponentType<Record<string, unknown>> }>(new URL("../../../packages/storefront-design-ui/src/StorefrontBanner.tsx", import.meta.url));
const section = { layout: "slider", presentation: "image_only", autoplay: false, slides: [0, 1, 2].map(i => ({ slideId: `slide-${i}`, enabled: true, headline: `Banner ${i}`, destination: "/urunler", desktopImage: { url: `https://fixture.invalid/banner-${i}.png`, altText: "", width: 800, height: 600 } })) };

function touch(element: Element, type: string, x: number, y: number) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { touches: { value: [{ clientX: x, clientY: y }] }, changedTouches: { value: [{ clientX: x, clientY: y }] } });
  element.dispatchEvent(event);
}

test("opt-in banner swipe changes one slide while vertical scrolling and taps remain available", async () => {
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(StorefrontBanner, { section, swipeNavigation: true }));
    const banner = container.querySelector("section")!;
    const current = () => container.querySelector('.celebix-store-hero-dots [aria-current="true"]')?.getAttribute("aria-label");
    assert.equal(current(), "1. banner");
    await React.act(async () => { touch(banner, "touchstart", 250, 120); touch(banner, "touchend", 100, 122); });
    assert.equal(current(), "2. banner");
    const clickEvent = new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    container.querySelector('[data-active="true"] a')!.dispatchEvent(clickEvent);
    assert.equal(clickEvent.defaultPrevented, true, "a swipe must not follow the banner link");
    await React.act(async () => { touch(banner, "touchstart", 100, 200); touch(banner, "touchend", 110, 60); });
    assert.equal(current(), "2. banner", "vertical gesture must scroll the page");
    await click('.celebix-store-hero-dots button[aria-label="3. banner"]');
    assert.equal(current(), "3. banner");
    await React.act(async () => { touch(banner, "touchstart", 100, 120); touch(banner, "touchend", 250, 120); });
    assert.equal(current(), "2. banner");
  });
});

test("swipe is opt-in and single/stacked banners do not become carousels", async () => {
  for (const props of [{ section }, { section: { ...section, layout: "stacked" }, swipeNavigation: true }, { section: { ...section, layout: "single" }, swipeNavigation: true }]) {
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(StorefrontBanner, props));
      const banner = container.querySelector("section")!;
      await React.act(async () => { touch(banner, "touchstart", 250, 120); touch(banner, "touchend", 100, 120); });
      assert.equal(container.querySelector('[data-slide-id="slide-0"]')?.getAttribute("data-active"), "true");
    });
  }
});
