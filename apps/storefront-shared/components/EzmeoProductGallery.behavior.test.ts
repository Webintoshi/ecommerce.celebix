import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PublicProduct } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const ids = ["back", "front", "white", "general"];
const product: PublicProduct = {
  id: "gallery-product", slug: "gallery-product", title: "Test ürünü", currency: "TRY", status: "active", priceCents: 1000, available: true,
  variants: [
    { id: "red", title: "Kırmızı", priceCents: 1000, available: true, stockTracking: false, stockQuantity: 0, attributes: {}, mediaIds: ["back", "front"] },
    { id: "white", title: "Beyaz", priceCents: 1000, available: true, stockTracking: false, stockQuantity: 0, attributes: {}, mediaIds: ["white", "front"] },
    { id: "green", title: "Yeşil", priceCents: 1000, available: true, stockTracking: false, stockQuantity: 0, attributes: {}, mediaIds: ["general"] },
  ],
  media: ids.map((id, sortOrder) => ({ id, productId: "gallery-product", sortOrder, url: `https://media.example/${id}.webp`, mediaType: "image/webp", altText: id, width: 800, height: 800 })),
};
type Component = React.ComponentType<Record<string, unknown>>;
function setup() {
  const load = componentLoader();
  const { ProductVariantMediaProvider: Provider, useProductVariantSelection } = load<{ ProductVariantMediaProvider: Component; useProductVariantSelection(p: PublicProduct): readonly [string, (id: string) => void] }>(new URL("./ProductVariantMedia.tsx", import.meta.url));
  const { EzmeoProductGallery: Gallery } = load<{ EzmeoProductGallery: Component }>(new URL("../themes/ezmeo/EzmeoProductGallery.tsx", import.meta.url));
  function Variants() {
    const [, select] = useProductVariantSelection(product);
    return React.createElement("div", {}, ...product.variants.map(({ id }) => React.createElement("button", { key: id, "data-variant": id, onClick: () => select(id) }, id)));
  }
  return { Provider, Gallery, Variants };
}
function track(container: HTMLElement) {
  const node = container.querySelector<HTMLElement>("[data-ezmeo-gallery-track]")!;
  assert.ok(node);
  Object.defineProperty(node, "clientWidth", { configurable: true, value: 320 });
  node.scrollTo = (options: ScrollToOptions | number) => {
    if (typeof options !== "number") node.scrollLeft = options.left ?? node.scrollLeft;
    node.dispatchEvent(new window.Event("scroll", { bubbles: true }));
  };
  return node;
}
const activeImage = (container: HTMLElement) => container.querySelector('[data-ezmeo-slide][aria-current="true"] img')?.getAttribute("src");

test("Ezmeo thumbnails and bounded previous/next controls select the same real photo", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    const viewport = track(container);
    assert.equal(activeImage(container), "https://media.example/back.webp");
    assert.equal(container.querySelectorAll("[data-ezmeo-thumbnail]").length, 2);
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Önceki görsel"]')?.disabled, true);
    await click('[aria-label="Sonraki görsel"]');
    assert.equal(viewport.scrollLeft, 320);
    assert.equal(activeImage(container), "https://media.example/front.webp");
    assert.equal(container.querySelector('[data-ezmeo-thumbnail][aria-current="true"]')?.getAttribute("aria-label"), "2. görseli göster");
    assert.equal(container.querySelector<HTMLButtonElement>('[aria-label="Sonraki görsel"]')?.disabled, true);
    await click('[data-ezmeo-thumbnail][aria-label="1. görseli göster"]');
    assert.equal(viewport.scrollLeft, 0);
    assert.equal(activeImage(container), "https://media.example/back.webp");
  });
});

test("swiping updates selected thumbnail and variant changes preserve a shared image then reset unavailable media", async () => {
  const { Provider, Gallery, Variants } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product }), React.createElement(Variants)));
    const viewport = track(container);
    await React.act(async () => { viewport.scrollLeft = 320; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); });
    assert.equal(activeImage(container), "https://media.example/front.webp");
    await click('[data-variant="white"]');
    assert.equal(activeImage(container), "https://media.example/front.webp");
    assert.equal(viewport.scrollLeft, 320);
    await click('[data-variant="green"]');
    assert.equal(activeImage(container), "https://media.example/general.webp");
    assert.equal(viewport.scrollLeft, 0);
    assert.equal(container.querySelector('[aria-label="Sonraki görsel"]'), null);
  });
});

test("empty and single image products do not show fake gallery navigation", async () => {
  const { Gallery } = setup();
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Gallery, { product: { ...product, variants: [], media: [] } }));
    assert.match(container.textContent ?? "", /Görsel yakında/);
    await render(React.createElement(Gallery, { product: { ...product, variants: [product.variants[2]], media: [product.media[3]] } }));
    assert.equal(activeImage(container), "https://media.example/general.webp");
    assert.equal(container.querySelector("[data-ezmeo-thumbnail]"), null);
    assert.equal(container.querySelector('[aria-label="Sonraki görsel"]'), null);
  });
});

test("zoom closes with Escape, restores the exact body scroll value and returns focus to its trigger", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    const trigger = container.querySelector<HTMLButtonElement>('[data-ezmeo-slide][aria-current="true"]')!;
    document.body.style.overflow = "scroll";
    trigger.focus();
    await click('[data-ezmeo-slide][aria-current="true"]');
    assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(document.body.style.overflow, "hidden");
    await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    assert.equal(container.querySelector('[role="dialog"]'), null);
    assert.equal(document.body.style.overflow, "scroll");
    assert.equal(document.activeElement === trigger, true, "focus returns to the zoom trigger");
  });
});

test("keyboard navigation moves focus to the current slide so Enter zooms the photo being shown", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    track(container);
    const first = container.querySelector<HTMLButtonElement>('[data-ezmeo-slide][aria-current="true"]')!;
    first.focus();
    await React.act(async () => { first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    const current = container.querySelector<HTMLButtonElement>('[data-ezmeo-slide][aria-current="true"]')!;
    assert.equal(document.activeElement === current, true, "keyboard focus follows the visible slide");
    await React.act(async () => (document.activeElement as HTMLButtonElement).click());
    assert.equal(container.querySelector('[role="dialog"] img')?.getAttribute("src"), "https://media.example/front.webp");
  });
});

test("removing all media while zoom is open restores scrolling and does not reopen zoom when media returns", async () => {
  const { Gallery } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    document.body.style.overflow = "auto";
    await render(React.createElement(Gallery, { product }));
    await click('[data-ezmeo-slide][aria-current="true"]');
    assert.equal(document.body.style.overflow, "hidden");
    await render(React.createElement(Gallery, { product: { ...product, variants: [], media: [] } }));
    assert.equal(document.body.style.overflow, "auto");
    await render(React.createElement(Gallery, { product }));
    assert.equal(container.querySelector('[role="dialog"]'), null);
  });
});

test("opening zoom interrupts an unfinished arrow movement and keeps the photo that was clicked", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    const viewport = track(container);
    await React.act(async () => window.dispatchEvent(new window.Event("resize")));
    let pending: number | null = null;
    viewport.scrollTo = (options: ScrollToOptions | number) => {
      if (typeof options === "number") return;
      if (options.behavior === "smooth") pending = options.left ?? 0;
      else { pending = null; viewport.scrollLeft = options.left ?? 0; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); }
    };
    await click('[aria-label="Sonraki görsel"]');
    await click('[data-ezmeo-slide]:first-child');
    await React.act(async () => { if (pending !== null) { viewport.scrollLeft = pending; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); } });
    assert.equal(container.querySelector('[role="dialog"] img')?.getAttribute("src"), "https://media.example/back.webp");
  });
});

test("resizing keeps the active photo aligned and its thumbnail fully inside the strip", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    const viewport = track(container);
    const selected = container.querySelectorAll<HTMLElement>("[data-ezmeo-thumbnail]")[1];
    const strip = selected.parentElement!;
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 400 });
    Object.defineProperty(selected, "offsetLeft", { configurable: true, value: 80 });
    Object.defineProperty(selected, "offsetWidth", { configurable: true, value: 72 });
    strip.scrollTo = (options: ScrollToOptions | number) => { if (typeof options !== "number") strip.scrollLeft = options.left ?? strip.scrollLeft; };
    await click('[aria-label="Sonraki görsel"]');
    assert.equal(strip.scrollLeft, 0);
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 240 });
    Object.defineProperty(strip, "clientWidth", { configurable: true, value: 100 });
    await React.act(async () => window.dispatchEvent(new window.Event("resize")));
    assert.equal(viewport.scrollLeft, 240);
    assert.equal(strip.scrollLeft, 52);
    assert.equal(activeImage(container), "https://media.example/front.webp");
  });
});

test("native scrolling carries slide focus with the photo without stealing focus from thumbnails", async () => {
  const { Provider, Gallery } = setup();
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Provider, { product }, React.createElement(Gallery, { product })));
    const viewport = track(container);
    container.querySelector<HTMLButtonElement>('[data-ezmeo-slide][aria-current="true"]')!.focus();
    await React.act(async () => { viewport.scrollLeft = 320; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    assert.equal(document.activeElement === container.querySelector('[data-ezmeo-slide][aria-current="true"]'), true, "native scroll focus follows the photo");
    await React.act(async () => (document.activeElement as HTMLButtonElement).click());
    assert.equal(container.querySelector('[role="dialog"] img')?.getAttribute("src"), "https://media.example/front.webp");
    await React.act(async () => { document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    const thumbnail = container.querySelector<HTMLButtonElement>("[data-ezmeo-thumbnail]")!;
    thumbnail.focus();
    await React.act(async () => { viewport.scrollLeft = 0; viewport.dispatchEvent(new window.Event("scroll", { bubbles: true })); await new Promise(resolve => window.requestAnimationFrame(resolve)); });
    assert.equal(document.activeElement === thumbnail, true, "native scroll does not steal thumbnail focus");
  });
});
