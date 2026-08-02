import assert from "node:assert/strict";
import test from "node:test";

import type { StarterThemeSectionConfig } from "@celebix/saas-contracts";
import {
  addStarterCampaignPanel,
  addStarterHeroSlide,
  buildStarterThemeComposition,
  createStarterThemeEditorState,
  moveStarterSection,
  removeStarterCampaignPanel,
  removeStarterHeroSlide,
  updateStarterCampaignPanel,
  updateStarterHeroSlide,
  updateStarterNavigationRoots,
} from "./starter-theme-composer-model.ts";

const CATEGORY = "20000000-0000-4000-8000-000000000001";
const ASSET = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";

function state() {
  return {
    visual: { colorScheme: "neutral" as const, headingStyle: "serif" as const, cornerStyle: "soft" as const, headerStyle: "overlay" as const, productCardStyle: "editorial" as const, productImageRatio: "portrait" as const },
    announcement: { enabled: true, items: ["Ücretsiz kargo"], destination: "/pages/odeme-teslimat" },
    navigation: { rootCategoryIds: [CATEGORY], featuredCategoryId: CATEGORY, featuredAssetId: ASSET },
    sections: [
      { kind: "hero" as const, enabled: true, slides: [{ heading: "Yeni sezon", desktopAssetId: ASSET, destination: "/products", productId: PRODUCT }] },
      { kind: "category_grid" as const, enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY] },
      { kind: "product_row" as const, enabled: true, heading: "Yeni ürünler", source: "latest" as const, limit: 8 as const },
      { kind: "split_campaign" as const, enabled: true, panels: [{ heading: "Koleksiyon", assetId: ASSET, destination: "/products" }] },
      { kind: "brand_story" as const, enabled: true, heading: "Hikâyemiz", body: "Özenle seçilmiş ürünler.", assetId: ASSET, destination: "/pages/hakkimizda" },
    ],
    productDetail: { galleryStyle: "grid" as const, showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, trustMessage: "Güvenli ödeme" },
  };
}

test("composer builds one immutable bounded composition", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.sections.length, 5); assert.equal(Object.isFrozen(value.sections), true); });
test("composer preserves category product and asset picker identifiers", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.navigation.rootCategoryIds[0], CATEGORY); assert.equal(value.navigation.featuredAssetId, ASSET); assert.match(JSON.stringify(value), new RegExp(PRODUCT)); });
test("composer rejects duplicate singleton sections", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, sections: [...value.sections, value.sections[0]!] })); });
test("composer rejects category product rows without a category", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, sections: [{ kind: "product_row", enabled: true, heading: "Kategori", source: "category", limit: 8 } as StarterThemeSectionConfig] })); });
test("composer rejects raw tenant authority", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, storeId: CATEGORY } as never)); });
test("default editor state is publishable, contains no invented catalog references, and disables unsupported shipping progress", () => { const state = createStarterThemeEditorState(); const value = buildStarterThemeComposition(state); assert.deepEqual(value.navigation.rootCategoryIds, []); assert.equal(state.cart.showShippingProgress, false); assert.equal(value.cart.showShippingProgress, false); assert.doesNotMatch(JSON.stringify(value), /assetId|categoryId|productId/); });
test("composer normalization cannot republish shipping progress without canonical threshold authority", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.cart.showShippingProgress, false); });
test("move reorders sections immutably", () => { const sections = state().sections; const moved = moveStarterSection(sections, 1, -1); assert.notEqual(moved, sections); assert.equal(moved[0]?.kind, "category_grid"); assert.equal(Object.isFrozen(moved), true); });
test("move keeps the first section stable at the upper boundary", () => { const sections = Object.freeze(state().sections); assert.equal(moveStarterSection(sections, 0, -1), sections); });
test("move keeps the last section stable at the lower boundary", () => { const sections = Object.freeze(state().sections); assert.equal(moveStarterSection(sections, sections.length - 1, 1), sections); });
test("move never mutates the caller-owned section array", () => { const sections = state().sections; const before = sections.map(({ kind }) => kind); moveStarterSection(sections, 2, -1); assert.deepEqual(sections.map(({ kind }) => kind), before); });

test("editing one hero field preserves every untouched bounded slide", () => {
  const section = {
    kind: "hero" as const,
    enabled: true,
    slides: [
      { heading: "Bir", desktopAssetId: ASSET, destination: "/products" },
      { eyebrow: "İki", heading: "İki", body: "Korunacak", desktopAssetId: ASSET, mobileAssetId: ASSET, destination: "/products", productId: PRODUCT },
      { heading: "Üç", desktopAssetId: ASSET, destination: "/products" },
    ],
  };
  const updated = updateStarterHeroSlide(section, 0, { heading: "Değişti" });
  assert.equal(updated.slides.length, 3);
  assert.deepEqual(updated.slides[1], section.slides[1]);
  assert.deepEqual(updated.slides[2], section.slides[2]);
  assert.equal(updated.slides[0]?.heading, "Değişti");
  assert.equal(Object.isFrozen(updated.slides), true);
});

test("hero slide add and remove controls enforce one to three entries", () => {
  const initial = state().sections[0] as Extract<StarterThemeSectionConfig, { kind: "hero" }>;
  const two = addStarterHeroSlide(initial, { heading: "İki", desktopAssetId: ASSET, destination: "/products" });
  const three = addStarterHeroSlide(two, { heading: "Üç", desktopAssetId: ASSET, destination: "/products" });
  assert.equal(three.slides.length, 3);
  assert.equal(addStarterHeroSlide(three, three.slides[0]!), three);
  const twoAgain = removeStarterHeroSlide(three, 1);
  const one = removeStarterHeroSlide(twoAgain, 1);
  assert.equal(one.slides.length, 1);
  assert.equal(removeStarterHeroSlide(one, 0), one);
});

test("editing one split campaign field preserves every untouched panel", () => {
  const section = {
    kind: "split_campaign" as const,
    enabled: true,
    panels: [
      { heading: "Sol", assetId: ASSET, destination: "/products" },
      { eyebrow: "Sağ", heading: "Sağ", body: "Korunacak", assetId: ASSET, destination: "/pages/odeme-teslimat" },
    ],
  };
  const updated = updateStarterCampaignPanel(section, 0, { heading: "Değişti" });
  assert.equal(updated.panels.length, 2);
  assert.deepEqual(updated.panels[1], section.panels[1]);
  assert.equal(updated.panels[0]?.heading, "Değişti");
  assert.equal(Object.isFrozen(updated.panels), true);
});

test("split campaign add and remove controls enforce one to two entries", () => {
  const initial = state().sections[3] as Extract<StarterThemeSectionConfig, { kind: "split_campaign" }>;
  const two = addStarterCampaignPanel(initial, { heading: "Sağ", assetId: ASSET, destination: "/products" });
  assert.equal(two.panels.length, 2);
  assert.equal(addStarterCampaignPanel(two, two.panels[0]!), two);
  const one = removeStarterCampaignPanel(two, 0);
  assert.equal(one.panels.length, 1);
  assert.equal(removeStarterCampaignPanel(one, 0), one);
});

test("editing navigation roots preserves featured references until explicit removal", () => {
  const navigation = state().navigation;
  const updated = updateStarterNavigationRoots(navigation, []);
  assert.deepEqual(updated.rootCategoryIds, []);
  assert.equal(updated.featuredCategoryId, CATEGORY);
  assert.equal(updated.featuredAssetId, ASSET);
  assert.equal(Object.isFrozen(updated.rootCategoryIds), true);
});
