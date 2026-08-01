import assert from "node:assert/strict";
import test from "node:test";

import type { StarterThemeSectionConfig } from "@celebix/saas-contracts";
import { buildStarterThemeComposition, createStarterThemeEditorState, moveStarterSection } from "./starter-theme-composer-model.ts";

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
test("default editor state is publishable and contains no invented catalog references", () => { const value = buildStarterThemeComposition(createStarterThemeEditorState()); assert.deepEqual(value.navigation.rootCategoryIds, []); assert.doesNotMatch(JSON.stringify(value), /assetId|categoryId|productId/); });
test("move reorders sections immutably", () => { const sections = state().sections; const moved = moveStarterSection(sections, 1, -1); assert.notEqual(moved, sections); assert.equal(moved[0]?.kind, "category_grid"); assert.equal(Object.isFrozen(moved), true); });
test("move keeps the first section stable at the upper boundary", () => { const sections = Object.freeze(state().sections); assert.equal(moveStarterSection(sections, 0, -1), sections); });
test("move keeps the last section stable at the lower boundary", () => { const sections = Object.freeze(state().sections); assert.equal(moveStarterSection(sections, sections.length - 1, 1), sections); });
test("move never mutates the caller-owned section array", () => { const sections = state().sections; const before = sections.map(({ kind }) => kind); moveStarterSection(sections, 2, -1); assert.deepEqual(sections.map(({ kind }) => kind), before); });
