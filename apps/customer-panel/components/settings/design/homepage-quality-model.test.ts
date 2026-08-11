import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type HomepageSectionId,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignDocument,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

import { scoreHomepageQuality } from "./homepage-quality-model.ts";

const IMAGE = "40000000-0000-4000-8000-000000000001";
const CATEGORY = "30000000-0000-4000-8000-000000000001";
const id = (value: string) => `home_${value}` as HomepageSectionId;

const media: readonly StorefrontDesignMediaOption[] = Object.freeze([
  Object.freeze({ id: IMAGE, url: "https://media.example.test/hero.webp", altText: "Altın takı koleksiyonu", mediaType: "image/webp", width: 1600, height: 900 }),
]);
const destinations: readonly StorefrontDesignDestinationOption[] = Object.freeze([
  Object.freeze({ kind: "collection", resourceId: CATEGORY, label: "Kolyeler", path: "/categories/kolyeler" }),
]);

function emptyDesign(): StorefrontDesignDocument {
  return Object.freeze({
    schemaVersion: 4,
    brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FFFFFF", accentColor: "#FFFFFF", backgroundColor: "#FFFFFF", textColor: "#FFFFFF", fontFamily: "inter" }),
    hero: Object.freeze({ enabled: false, slides: Object.freeze([{ headline: "", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" as const }), enabled: false }]) }),
    promotion: Object.freeze({ headline: "Kampanya", body: "", destination: Object.freeze({ kind: "none" as const }), startsAt: null, endsAt: null, enabled: false }),
    announcement: Object.freeze({ items: Object.freeze(["Güvenli alışveriş"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
    typography: Object.freeze({ headingFont: Object.freeze({ family: "Montserrat", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), bodyFont: Object.freeze({ family: "Inter", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 16 }),
    composition: Object.freeze({ ...createDefaultStarterThemeComposition(), sections: Object.freeze([]) }),
  }) as StorefrontDesignDocument;
}

function completeDesign(): StorefrontDesignDocument {
  const base = emptyDesign();
  return Object.freeze({
    ...base,
    brand: Object.freeze({ ...base.brand, textColor: "#171717" }),
    hero: Object.freeze({ enabled: true, slides: Object.freeze([{ headline: "Yeni koleksiyon", body: "Zamansız tasarımlar", desktopImage: Object.freeze({ kind: "media" as const, mediaId: IMAGE }), mobileImage: null, destination: Object.freeze({ kind: "collection" as const, resourceId: CATEGORY }), enabled: true }]) }),
    composition: Object.freeze({
      ...base.composition,
      schemaVersion: 3,
      sections: Object.freeze([
        Object.freeze({ sectionId: id("categories_10"), kind: "category_grid" as const, enabled: true, heading: "Kategorileri keşfedin", categoryIds: Object.freeze([CATEGORY]), layout: "grid" as const }),
        Object.freeze({ sectionId: id("products_10"), kind: "product_row" as const, enabled: true, heading: "Yeni ürünler", source: "latest" as const, limit: 8 as const }),
        Object.freeze({ sectionId: id("values_100"), kind: "value_propositions" as const, enabled: true, items: Object.freeze([Object.freeze({ icon: "shield" as const, heading: "Güvenli alışveriş", body: "Güvenli mağaza akışı" }), Object.freeze({ icon: "truck" as const, heading: "Özenli teslimat", body: "Özenli paketleme" })]) }),
        Object.freeze({ sectionId: id("reviews_10"), kind: "testimonials" as const, enabled: true, heading: "Müşteri yorumları", source: "approved_product_reviews" as const, limit: 3 as const, minimumRating: 5 as const }),
        Object.freeze({ sectionId: id("story_100"), kind: "brand_story" as const, enabled: true, heading: "Hikâyemiz", body: "Markamızın zamansız hikâyesi", assetId: IMAGE, destination: "/categories/kolyeler" }),
        Object.freeze({ sectionId: id("campaign_10"), kind: "split_campaign" as const, enabled: true, panels: Object.freeze([Object.freeze({ heading: "Kolyeleri keşfedin", assetId: IMAGE, destination: "/categories/kolyeler" })]) }),
      ]),
    }),
  }) as StorefrontDesignDocument;
}

test("derives zero, partial and exact 100 point results without persisting a score", () => {
  const empty = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  assert.equal(empty.score, 0);
  assert.equal(empty.label, "Başlangıç");
  assert.deepEqual(empty.categories.map(({ key, available }) => [key, available]), [["hero", 20], ["categories", 20], ["shopping", 20], ["trust", 15], ["content", 15], ["accessibility", 10]]);

  const partialDesign = emptyDesign();
  const partial = scoreHomepageQuality({ design: { ...partialDesign, brand: { ...partialDesign.brand, textColor: "#171717" }, composition: createDefaultStarterThemeComposition() }, media: [], destinations: [] });
  assert.equal(partial.score, 25);
  assert.equal(partial.label, "Başlangıç");

  const complete = scoreHomepageQuality({ design: completeDesign(), media, destinations });
  assert.equal(complete.score, 100);
  assert.equal(complete.label, "Çok başarılı");
  assert.deepEqual(complete.recommendations, []);
  assert.equal(Object.hasOwn(completeDesign(), "qualityScore"), false);
});

test("hidden sections, missing resources and invalid destinations earn no misleading points", () => {
  const design = completeDesign();
  const hidden = {
    ...design,
    composition: { ...design.composition, sections: design.composition.sections.map((section) => ({ ...section, enabled: false })) },
  } as StorefrontDesignDocument;
  const result = scoreHomepageQuality({ design: hidden, media: [], destinations: [] });
  assert.equal(result.categories.find(({ key }) => key === "categories")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "shopping")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "trust")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "content")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "hero")?.earned, 0);
});

test("recommendations are deterministic, highest-value first and capped at five", () => {
  const first = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  const second = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.equal(first.recommendations.length, 5);
  assert.deepEqual(first.recommendations.map(({ points }) => points), [20, 20, 20, 8, 8]);
  assert.deepEqual(first.recommendations.slice(0, 3).map(({ code }) => code), ["homepage_add_categories", "homepage_add_hero", "homepage_add_products"]);
});

test("result is deeply frozen and scoring never mutates caller-owned inputs", () => {
  const design = completeDesign();
  const before = structuredClone(design);
  const result = scoreHomepageQuality({ design, media, destinations });
  assert.deepEqual(design, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.categories), true);
  assert.equal(Object.isFrozen(result.categories[0]), true);
  assert.equal(Object.isFrozen(result.recommendations), true);
});

