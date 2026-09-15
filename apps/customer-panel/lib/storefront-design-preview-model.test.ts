import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition, type PublicProduct, type StarterThemeCompositionConfigV3 } from "@celebix/saas-contracts";

import { composeDraftCampaignProjection, storefrontDesignPreviewDependencyKey, type StorefrontDesignPreviewResources } from "./storefront-design-preview-model.ts";

const ASSET_A = "51000000-0000-4000-8000-000000000001";
const ASSET_B = "51000000-0000-4000-8000-000000000002";

function product(index: number, available = true): PublicProduct {
  return Object.freeze({ id: `52000000-0000-4000-8000-${String(index).padStart(12, "0")}`, slug: `urun-${index}`, title: `Ürün ${index}`, currency: "TRY", status: "active", priceCents: 1_000 + index, available, variants: Object.freeze([]), media: Object.freeze([]) });
}

function composition(sections: StarterThemeCompositionConfigV3["sections"]): StarterThemeCompositionConfigV3 {
  return Object.freeze({ ...createDefaultStarterThemeComposition(), sections });
}

function resources(input: Partial<StorefrontDesignPreviewResources> = {}): StorefrontDesignPreviewResources {
  return Object.freeze({ schemaVersion: 1, dependencyKey: "test", productSources: Object.freeze([]), assets: Object.freeze([]), hotspots: Object.freeze([]), categoryShowcase: Object.freeze({ status: "missing" }), ...input });
}

test("row projection applies the section limit before availability and keeps current IDs, order, and labels", () => {
  const draft = composition(Object.freeze([
    { sectionId: "home_latest_short", kind: "product_row", enabled: true, heading: "Güncel kısa başlık", source: "latest", limit: 4 },
    { sectionId: "home_latest_long", kind: "product_row", enabled: true, heading: "Güncel uzun başlık", source: "latest", limit: 8 },
  ]));
  const candidates = Object.freeze([product(1), product(2, false), product(3), product(4), product(5), product(6), product(7), product(8)]);
  const result = composeDraftCampaignProjection({ composition: draft, storeName: "Atlas", destinations: Object.freeze([]), resources: resources({ productSources: Object.freeze([{ key: "latest", status: "ready", items: candidates }]) }) });
  assert.deepEqual(result.projection.presentation.sections.map(({ sectionId, kind }) => [sectionId, kind]), [["home_latest_short", "product_row"], ["home_latest_long", "product_row"]]);
  assert.deepEqual(result.projection.presentation.sections.map((section) => section.kind === "product_row" ? section.heading : ""), ["Güncel kısa başlık", "Güncel uzun başlık"]);
  assert.deepEqual(result.projection.productRows.map(({ items }) => items.map(({ title }) => title)), [["Ürün 1", "Ürün 3", "Ürün 4"], ["Ürün 1", "Ürün 3", "Ürün 4", "Ürün 5", "Ürün 6", "Ürün 7", "Ürün 8"]]);
});

test("dependency key changes only for selected source/media dependencies", () => {
  const first = composition(Object.freeze([{ sectionId: "home_row_a", kind: "product_row", enabled: true, heading: "A", source: "latest", limit: 4 }, { sectionId: "home_story_a", kind: "brand_story", enabled: true, heading: "Hikâye", body: "Metin", assetId: ASSET_A }]));
  const cosmetic = composition(Object.freeze([{ sectionId: "home_story_changed", kind: "brand_story", enabled: true, heading: "Başka", body: "Başka metin", assetId: ASSET_A }, { sectionId: "home_row_changed", kind: "product_row", enabled: true, heading: "Başka başlık", source: "latest", limit: 4 }]));
  const dependency = composition(Object.freeze([{ sectionId: "home_row_a", kind: "product_row", enabled: true, heading: "A", source: "latest", limit: 8 }, { sectionId: "home_story_a", kind: "brand_story", enabled: true, heading: "Hikâye", body: "Metin", assetId: ASSET_B }]));
  assert.equal(storefrontDesignPreviewDependencyKey(first), storefrontDesignPreviewDependencyKey(cosmetic));
  assert.notEqual(storefrontDesignPreviewDependencyKey(first), storefrontDesignPreviewDependencyKey(dependency));
});

test("hero and split sections report partial when only some requested media resolves", () => {
  const draft = composition(Object.freeze([
    { sectionId: "home_hero_partial", kind: "hero", enabled: true, slides: [{ heading: "Hero", desktopAssetId: ASSET_A, mobileAssetId: ASSET_B, destination: "/products" }] },
    { sectionId: "home_split_partial", kind: "split_campaign", enabled: true, panels: [{ heading: "A", assetId: ASSET_A, destination: "/products" }, { heading: "B", assetId: ASSET_B, destination: "/products" }] },
    { sectionId: "home_reviews_unavailable", kind: "testimonials", enabled: true, heading: "Yorumlar", source: "approved_product_reviews", limit: 3, minimumRating: 4 },
  ]));
  const image = Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/51000000-0000-4000-8000-000000000003/storefront/hero/51000000-0000-4000-8000-000000000001.webp", mediaType: "image/webp", altText: "Hero", width: 1600, height: 900 });
  const result = composeDraftCampaignProjection({ composition: draft, storeName: "Atlas", destinations: Object.freeze([]), resources: resources({ assets: Object.freeze([{ id: ASSET_A, status: "ready", image }, { id: ASSET_B, status: "missing" }]) }) });
  assert.deepEqual(result.sectionStates, [{ sectionId: "home_hero_partial", status: "partial" }, { sectionId: "home_split_partial", status: "partial" }, { sectionId: "home_reviews_unavailable", status: "unavailable" }]);
});
