import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { productPath } from "../lib/storefront-routes.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const product = { id: "20000000-0000-4000-8000-000000000001", slug: "gercek-urun", title: "Ürün", currency: "TRY", priceCents: 1000, available: true, media: [] };
const load = componentLoader({ "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) }, "@celebix/storefront-design-ui": { isStorefrontPromotionActive: () => false } });
const Card = load<{ ProductCardContent: React.ComponentType<Record<string, unknown>> }>(new URL("./ProductCardContent.tsx", import.meta.url)).ProductCardContent;

test("all card styles show a five-star fractional review summary without another request or link", async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("unexpected_card_request"); };
  try {
    await withProductBrowser(async ({ container, render }) => {
      for (const cardStyle of ["editorial", "compact"]) for (const imageRatio of ["portrait", "square"]) {
        await render(React.createElement(Card, { product: { ...product, reviewSummary: { averageRating: 4.5, reviewCount: 24 } }, locale: "tr", cardStyle, imageRatio }));
        const rating = container.querySelector('[data-product-card-rating]');
        assert.ok(rating);
        assert.equal(rating.getAttribute("role"), "img");
        assert.equal(rating.getAttribute("aria-label"), "5 üzerinden 4,5 yıldız, 24 değerlendirme");
        assert.equal(rating.querySelectorAll("[data-review-star]").length, 5);
        assert.deepEqual(Array.from(rating.querySelectorAll<HTMLElement>("[data-review-star-fill]"), item => item.style.clipPath), ["inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 0% 0 0)", "inset(0 50% 0 0)"]);
        assert.match(rating.textContent ?? "", /\(24\)/u);
        assert.equal(container.querySelectorAll("a").length, 1);
        assert.equal(container.querySelector("a")?.getAttribute("href"), productPath("tr", product.slug));
      }
    });
    assert.equal(requests, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test("enabled unrated cards show five empty stars while a disabled summary reserves no row", async () => {
  await withProductBrowser(async ({ container, render }) => {
    const show = (value: object) => render(React.createElement(Card, { product: value, locale: "tr", cardStyle: "compact", imageRatio: "square" }));
    await show({ ...product, reviewSummary: { averageRating: 0, reviewCount: 0 } });
    const rating = container.querySelector('[data-product-card-rating]');
    assert.equal(rating?.getAttribute("aria-label"), "Henüz değerlendirme yok");
    assert.equal(rating?.querySelectorAll('[data-review-star]').length, 5);
    assert.ok(Array.from(rating!.querySelectorAll<HTMLElement>('[data-review-star-fill]')).every(item => item.style.clipPath === "inset(0 100% 0 0)"));
    assert.doesNotMatch(rating?.textContent ?? "", /0[,.]0|5[,.]0/u);
    await show(product);
    assert.equal(container.querySelector('[data-product-card-rating]'), null);
  });
});

test("Lilyum homepage cards reuse the same approved rating and hide it when the feature is off", async () => {
  const Cards = load<{ LilyumProductCardsContent: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/lilyum/LilyumHomeContent.tsx", import.meta.url)).LilyumProductCardsContent;
  await withProductBrowser(async ({ container, render }) => {
    const show = (value: object) => render(React.createElement(Cards, { products: [value], locale: "tr", renderFavorite: () => null }));
    await show({ ...product, reviewSummary: { averageRating: 3.25, reviewCount: 8 } });
    assert.equal(container.querySelector('[data-product-card-rating]')?.getAttribute("aria-label"), "5 üzerinden 3,25 yıldız, 8 değerlendirme");
    assert.equal(container.querySelector('[data-product-card-rating]')?.querySelectorAll('[data-review-star]').length, 5);
    await show(product);
    assert.equal(container.querySelector('[data-product-card-rating]'), null);
  });
});
