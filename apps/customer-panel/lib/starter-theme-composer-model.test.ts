import assert from "node:assert/strict";
import test from "node:test";

import type { StarterThemeCompositionConfig, StarterThemeSectionConfigV2 } from "@celebix/saas-contracts";
import {
  addStarterCampaignPanel,
  addStarterHeroSlide,
  buildStarterThemeComposition,
  createStarterThemeEditorState,
  moveStarterSection,
  removeStarterCampaignPanel,
  removeStarterHeroSlide,
  starterThemeCategoryPlaceholderLabels,
  updateStarterCampaignPanel,
  updateStarterHeroSlide,
  updateStarterNavigationRoots,
  upgradeStarterThemeComposition,
} from "./starter-theme-composer-model.ts";

const CATEGORY = "20000000-0000-4000-8000-000000000001";
const CATEGORY_TWO = "20000000-0000-4000-8000-000000000002";
const CATEGORY_THREE = "20000000-0000-4000-8000-000000000003";
const CATEGORY_FOUR = "20000000-0000-4000-8000-000000000004";
const ASSET = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";

function state() {
  return {
    visual: { colorScheme: "neutral" as const, headingStyle: "serif" as const, cornerStyle: "soft" as const, headerStyle: "overlay" as const, productCardStyle: "editorial" as const, productImageRatio: "portrait" as const, headerWidth: "wide" as const, sectionSpacing: "balanced" as const, logoSize: "medium" as const, logoAlignment: "center" as const, headerLayout: "centered" as const },
    announcement: { enabled: true, items: ["Ücretsiz kargo"], destination: "/pages/odeme-teslimat" },
    navigation: { rootCategoryIds: [CATEGORY], featuredCategoryId: CATEGORY, featuredAssetId: ASSET },
    sections: [
      { kind: "hero" as const, enabled: true, slides: [{ heading: "Yeni sezon", desktopAssetId: ASSET, destination: "/products", productId: PRODUCT }] },
      { kind: "category_grid" as const, enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY] },
      { kind: "product_row" as const, enabled: true, heading: "Yeni ürünler", source: "latest" as const, limit: 8 as const },
      { kind: "split_campaign" as const, enabled: true, panels: [{ heading: "Koleksiyon", assetId: ASSET, destination: "/products" }] },
      { kind: "brand_story" as const, enabled: true, heading: "Hikâyemiz", body: "Özenle seçilmiş ürünler.", assetId: ASSET, destination: "/pages/hakkimizda" },
    ],
    productDetail: { galleryStyle: "grid" as const, showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: ["description" as const, "materials_and_care" as const, "certifications" as const, "shipping_and_returns" as const] },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, showQuantitySelector: true, trustMessage: "Güvenli ödeme" },
    footer: { tone: "dark" as const, groups: [{ heading: "Mağaza", links: [{ kind: "system" as const, destination: "/products" as const }] }, { heading: "Yasal", links: [{ kind: "fixed_policy" as const, policyKey: "privacy_security" as const }] }], newsletter: { enabled: false, heading: "Bizden haber alın", body: "Duyuruları alın.", consentLabel: "İzin veriyorum." }, social: [] },
  };
}

test("composer builds one immutable bounded composition", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.sections.length, 5); assert.equal(Object.isFrozen(value.sections), true); });
test("composer preserves category product and asset picker identifiers", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.navigation.rootCategoryIds[0], CATEGORY); assert.equal(value.navigation.featuredAssetId, ASSET); assert.match(JSON.stringify(value), new RegExp(PRODUCT)); });
test("composer rejects duplicate singleton sections", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, sections: [...value.sections, value.sections[0]!] })); });
test("composer rejects category product rows without a category", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, sections: [{ kind: "product_row", enabled: true, heading: "Kategori", source: "category", limit: 8 } as StarterThemeSectionConfigV2] })); });
test("composer rejects raw tenant authority", () => { const value = state(); assert.throws(() => buildStarterThemeComposition({ ...value, storeId: CATEGORY } as never)); });
test("default editor state is publishable, contains no invented durable references, and disables unsupported shipping progress", () => { const state = createStarterThemeEditorState(); const value = buildStarterThemeComposition(state); assert.deepEqual(value.navigation.rootCategoryIds, []); assert.equal(state.cart.showShippingProgress, false); assert.equal(value.cart.showShippingProgress, false); assert.doesNotMatch(JSON.stringify(value), /assetId|categoryId|productId|pageId|fixed_policy/); });
test("composer normalization cannot republish shipping progress without canonical threshold authority", () => { const value = buildStarterThemeComposition(state()); assert.equal(value.cart.showShippingProgress, false); });
test("quantity-selector visibility is preserved by composer normalization", () => {
  const enabled = buildStarterThemeComposition(state());
  const current = state();
  const disabled = buildStarterThemeComposition({
    ...current,
    cart: { ...current.cart, showQuantitySelector: false },
  });
  assert.equal(enabled.cart.showQuantitySelector, true);
  assert.equal(disabled.cart.showQuantitySelector, false);
});
test("composer preserves every bounded header layout", () => {
  for (const headerLayout of ["centered", "logo_left", "logo_top", "menu_top"] as const) {
    const input = state();
    const value = buildStarterThemeComposition({
      ...input,
      visual: { ...input.visual, headerLayout },
    });
    assert.equal(value.visual.headerLayout, headerLayout);
  }
});
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
  const initial = state().sections[0] as Extract<StarterThemeSectionConfigV2, { kind: "hero" }>;
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
  const initial = state().sections[3] as Extract<StarterThemeSectionConfigV2, { kind: "split_campaign" }>;
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

test("new editor state exposes the complete retail schema without fake content", () => {
  const editor = createStarterThemeEditorState();
  const value = buildStarterThemeComposition(editor);
  assert.equal(value.schemaVersion, 2);
  assert.deepEqual(value.sections.map(({ kind }) => kind), ["product_row"]);
  assert.equal(value.visual.headerWidth, "wide");
  assert.equal(value.visual.sectionSpacing, "balanced");
  assert.equal(value.visual.logoSize, "medium");
  assert.equal(value.visual.logoAlignment, "center");
  assert.equal(value.visual.headerLayout, "centered");
  assert.equal(value.visual.cornerStyle, "square");
  assert.equal(value.productDetail.showBreadcrumbs, true);
  assert.equal(value.productDetail.showApprovedReviews, true);
  assert.equal(value.productDetail.showSizeGuide, true);
  assert.deepEqual(value.productDetail.informationSections, ["description", "materials_and_care", "certifications", "shipping_and_returns"]);
  assert.equal(value.footer.newsletter.enabled, false);
  assert.equal(value.cart.showQuantitySelector, true);
  assert.equal(value.footer.groups.length, 2);
  assert.equal(JSON.stringify(value).includes("testimonial quote"), false);
  assert.equal(Object.isFrozen(value.footer.groups), true);
});

test("editor preview exposes bounded category image slots without leaking catalog identifiers", () => {
  const labels = starterThemeCategoryPlaceholderLabels(buildStarterThemeComposition(state()));

  assert.deepEqual(labels, ["PLACEHOLDER 1"]);
  assert.equal(Object.isFrozen(labels), true);
  assert.doesNotMatch(JSON.stringify(labels), new RegExp(CATEGORY));
});

test("editor preview counts every configured category authority instead of only the first grid", () => {
  const input = state();
  const composition = buildStarterThemeComposition({
    ...input,
    navigation: {
      ...input.navigation,
      rootCategoryIds: [CATEGORY, CATEGORY_TWO, CATEGORY_THREE, CATEGORY_FOUR],
    },
  });

  assert.deepEqual(starterThemeCategoryPlaceholderLabels(composition), [
    "PLACEHOLDER 1",
    "PLACEHOLDER 2",
    "PLACEHOLDER 3",
    "PLACEHOLDER 4",
  ]);
});

test("editor preview has no invented category slots when no category authority is configured", () => {
  assert.deepEqual(starterThemeCategoryPlaceholderLabels(buildStarterThemeComposition(createStarterThemeEditorState())), []);
});

test("v1 editor state upgrades to v2 without inventing testimonials or social profiles", () => {
  const current = state();
  const legacy = {
    schemaVersion: 1,
    visual: { colorScheme: current.visual.colorScheme, headingStyle: current.visual.headingStyle, cornerStyle: current.visual.cornerStyle, headerStyle: current.visual.headerStyle, productCardStyle: current.visual.productCardStyle, productImageRatio: current.visual.productImageRatio },
    announcement: current.announcement,
    navigation: current.navigation,
    sections: current.sections,
    productDetail: { galleryStyle: current.productDetail.galleryStyle, showSku: current.productDetail.showSku, showBrand: current.productDetail.showBrand, showRelatedProducts: current.productDetail.showRelatedProducts, mobileStickyPurchase: current.productDetail.mobileStickyPurchase },
    cart: current.cart,
  } as StarterThemeCompositionConfig;
  const upgraded = upgradeStarterThemeComposition(legacy);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.cart.showQuantitySelector, true);
  assert.equal(upgraded.sections.some(({ kind }) => kind === "testimonials"), false);
  assert.deepEqual(upgraded.footer.social, []);
  assert.equal(upgraded.footer.newsletter.enabled, false);
});
