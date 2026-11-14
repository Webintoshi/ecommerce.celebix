import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PublicProduct } from "@celebix/saas-contracts";
import { SIORA_STOREFRONT_ID } from "../themes/siora/theme.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const product: PublicProduct = {
  id: "gallery-product", slug: "gallery-product", title: "Test ürünü", currency: "TRY", status: "active", priceCents: 1000, available: true, variants: [],
  media: ["one", "two", "three", "four"].map((id, sortOrder) => ({
    id, sortOrder, productId: "gallery-product", url: `https://media.saas-staging.celebix.site/stores/${SIORA_STOREFRONT_ID}/products/gallery-product/${id}.jpg`,
    mediaType: "image/jpeg", altText: id, width: 1086, height: 1448,
  })),
};
const selectedThumbnail = '[aria-label="Fotoğraf seçimi"] [aria-current="true"]';
const zoomButton = '[aria-label="Seçili fotoğrafı büyüt"]';
const thirdThumbnail = '[aria-label="3. fotoğrafı göster"]';
const gallerySelector = '[aria-label="Ürün fotoğrafları"]';

function galleryComponent() {
  const load = componentLoader({
    "next/image": { getImageProps: ({ src }: { src: string }) => ({ props: { src: `/_next/image?url=${encodeURIComponent(src)}&w=640&q=75`, srcSet: "/_next/image?w=640 640w" } }) },
  });
  return load<{ SioraProductGallery: React.ComponentType<{ product: PublicProduct }> }>(
    new URL("../themes/siora/SioraProductGallery.tsx", import.meta.url),
  ).SioraProductGallery;
}

test("desktop end scrolling selects the fourth photo and opens its original even before scroll settles", async () => {
  const Gallery = galleryComponent();
  await withProductBrowser(async ({ container, render, click }) => {
    await render(React.createElement(Gallery, { product }));
    const strip = container.querySelector<HTMLDivElement>(gallerySelector)!;
    Object.defineProperties(strip, {
      clientWidth: { value: 1440 },
      scrollWidth: { value: 2586 },
    });
    Array.from(strip.children).forEach((panel, index) => Object.defineProperty(panel, "offsetLeft", { value: [0, 647, 1293, 1940][index] }));
    strip.scrollTo = (options?: ScrollToOptions | number) => {
      if (typeof options !== "number") strip.scrollLeft = options?.left ?? strip.scrollLeft;
      strip.dispatchEvent(new window.Event("scroll"));
    };
    const waitForScroll = () => React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 125)); });

    const mainPhoto = strip.querySelector("img")!;
    assert.equal(mainPhoto.getAttribute("loading"), "eager");
    assert.match(mainPhoto.getAttribute("srcset") ?? "", /640w/);
    assert.equal(strip.querySelectorAll("img")[1]?.getAttribute("loading"), "lazy");
    assert.equal(container.querySelector(`${selectedThumbnail} img`)?.getAttribute("sizes"), "(max-width: 767px) 35px, 44px");
    assert.equal(container.querySelector("dialog img"), null);
    await React.act(async () => mainPhoto.dispatchEvent(new window.Event("error")));
    assert.equal(mainPhoto.getAttribute("srcset"), null);
    assert.equal(mainPhoto.getAttribute("src"), product.media[0].url);

    await React.act(async () => {
      strip.dispatchEvent(new window.WheelEvent("wheel", { bubbles: true, deltaX: 1146 }));
      strip.scrollLeft = 1145.7;
      strip.dispatchEvent(new window.Event("scroll"));
    });
    await click(zoomButton);
    assert.equal(container.querySelector("dialog[open] img")?.getAttribute("src"), product.media[3].url);
    assert.equal(container.querySelector(selectedThumbnail)?.getAttribute("aria-label"), "4. fotoğrafı göster");
    await click('[aria-label="Büyütülmüş fotoğrafı kapat"]');

    await click(thirdThumbnail);
    await waitForScroll();
    assert.equal(strip.scrollLeft, 1146);
    assert.equal(container.querySelector(selectedThumbnail)?.getAttribute("aria-label"), "3. fotoğrafı göster");
    await click(zoomButton);
    assert.equal(container.querySelector("dialog[open] img")?.getAttribute("src"), product.media[2].url);
    await click('[aria-label="Büyütülmüş fotoğrafı kapat"]');

    await React.act(async () => {
      strip.scrollLeft = 647;
      strip.dispatchEvent(new window.Event("scroll"));
    });
    await waitForScroll();
    assert.equal(container.querySelector(selectedThumbnail)?.getAttribute("aria-label"), "2. fotoğrafı göster");
    await React.act(async () => {
      strip.scrollLeft = 1146;
      strip.dispatchEvent(new window.Event("scroll"));
    });
    await waitForScroll();
    assert.equal(container.querySelector(selectedThumbnail)?.getAttribute("aria-label"), "4. fotoğrafı göster");
  });
});
