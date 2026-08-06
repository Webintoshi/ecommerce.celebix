import assert from "node:assert/strict";
import test from "node:test";

import * as presentationModule from "./presentation.ts";
import * as validationModule from "./validation.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const CATEGORY = "20000000-0000-4000-8000-000000000001";
const CATEGORY_TWO = "20000000-0000-4000-8000-000000000002";
const ASSET = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const HERO = Object.freeze({
  url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`,
  mediaType: "image/webp",
  altText: "Yeni sezon",
  width: 1600,
  height: 1000,
});

const legacyPresentation = Object.freeze({
  schemaVersion: 1,
  displayName: "Pilot Store",
  theme: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true }),
  hero: Object.freeze({ enabled: true, headline: "Pilot Store", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products", image: HERO }),
  marquee: Object.freeze({ items: Object.freeze(["Güvenli ödeme"]), icon: "shield", speed: "normal", direction: "left", animation: "continuous" }),
  categoryShowcase: Object.freeze({ heading: "Kategoriler", items: Object.freeze([Object.freeze({ id: CATEGORY, name: "Takılar", slug: "takilar", image: HERO })]) }),
  seo: Object.freeze({ allowIndex: false }),
});

function validComposition() {
  return {
    schemaVersion: 1,
    visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" },
    announcement: { enabled: true, items: ["Güvenli alışveriş"], destination: "/pages/odeme-teslimat" },
    navigation: { rootCategoryIds: [CATEGORY], featuredCategoryId: CATEGORY, featuredAssetId: ASSET },
    sections: [
      { kind: "hero", enabled: true, slides: [{ eyebrow: "Yeni sezon", heading: "Zamansız seçkiler", body: "Yeni ürünleri keşfedin.", desktopAssetId: ASSET, destination: "/products", productId: PRODUCT }] },
      { kind: "category_grid", enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY] },
      { kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "split_campaign", enabled: true, panels: [{ heading: "Takılar", assetId: ASSET, destination: "/categories/takilar" }] },
      { kind: "brand_story", enabled: true, eyebrow: "Hikâyemiz", heading: "Özenle seçildi", body: "Kalıcı tasarımlar.", assetId: ASSET, destination: "/pages/hakkimizda" },
    ],
    productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, trustMessage: "Güvenli ödeme" },
  };
}

function validPublicPresentation() {
  return {
    schemaVersion: 2,
    displayName: "Pilot Store",
    theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true },
    hero: { enabled: true, headline: "Zamansız seçkiler", body: "Yeni ürünleri keşfedin.", destination: "/products", image: HERO },
    marquee: { items: ["Güvenli alışveriş"], icon: "shield", speed: "normal", direction: "left", animation: "continuous" },
    categoryShowcase: { heading: "Kategoriler", items: [{ id: CATEGORY, name: "Takılar", slug: "takilar", image: HERO }] },
    visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" },
    announcement: { items: ["Güvenli alışveriş"], destination: "/pages/odeme-teslimat" },
    navigation: { items: [{ name: "Takılar", slug: "takilar", children: [{ name: "Yüzükler", slug: "yuzukler", children: [] }], featured: { name: "Takılar", slug: "takilar", image: HERO } }] },
    sections: [
      { kind: "hero", slides: [{ eyebrow: "Yeni sezon", heading: "Zamansız seçkiler", body: "Yeni ürünleri keşfedin.", desktopImage: HERO, destination: "/products", hotspot: { productSlug: "ornek-urun", title: "Örnek ürün", priceCents: 12500, currency: "TRY" } }] },
      { kind: "category_grid", heading: "Kategoriler", items: [{ name: "Takılar", slug: "takilar", image: HERO }] },
      { kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "split_campaign", panels: [{ heading: "Takılar", image: HERO, destination: "/categories/takilar" }] },
      { kind: "brand_story", eyebrow: "Hikâyemiz", heading: "Özenle seçildi", body: "Kalıcı tasarımlar.", image: HERO, destination: "/pages/hakkimizda" },
    ],
    productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, showQuantitySelector: true, trustMessage: "Güvenli ödeme" },
    seo: { allowIndex: false },
  };
}

type CampaignValidation = {
  parseStarterThemeCompositionConfig(value: unknown): Readonly<Record<string, unknown>>;
  parsePublicStarterThemePresentation(value: unknown): Readonly<Record<string, unknown>>;
  parsePublicProduct(value: unknown): Readonly<Record<string, unknown>>;
};
type CampaignPresentation = {
  adaptStarterPresentationV1(value: unknown): Readonly<Record<string, unknown>>;
  buildDefaultStarterPresentation(value: Readonly<{ name: string }>): Readonly<Record<string, unknown>>;
};
const campaignValidation = validationModule as unknown as CampaignValidation;
const campaignPresentation = presentationModule as unknown as CampaignPresentation;

test("campaign composition parses exact bounded input and freezes nested values", () => {
  const parsed = campaignValidation.parseStarterThemeCompositionConfig(validComposition());
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.sections), true);
  assert.equal(Object.isFrozen((parsed.sections as readonly unknown[])[0]), true);
});

test("campaign composition rejects unknown and incomplete root fields", () => {
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...validComposition(), tenantId: STORE }), /storefront_contract_invalid/);
  const { cart: _cart, ...missing } = validComposition();
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig(missing), /storefront_contract_invalid/);
});

test("campaign composition enforces hero and section count bounds", () => {
  const value = validComposition();
  const hero = value.sections[0] as { kind: string; enabled: boolean; slides: unknown[] };
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [{ ...hero, slides: [] }] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [{ ...hero, slides: Array.from({ length: 4 }, () => hero.slides[0]) }] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: Array.from({ length: 13 }, () => value.sections[2]) }), /storefront_contract_invalid/);
});

test("campaign composition rejects duplicate singleton sections", () => {
  const value = validComposition();
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [...value.sections, value.sections[0]] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [...value.sections, value.sections[1]] }), /storefront_contract_invalid/);
});

test("campaign composition validates same-store reference syntax and category source requirements", () => {
  const value = validComposition();
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, navigation: { rootCategoryIds: ["not-a-uuid"] } }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [{ kind: "product_row", enabled: true, heading: "Kategori", source: "category", limit: 8 }] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig({ ...value, sections: [{ kind: "product_row", enabled: true, heading: "Yeni", source: "latest", categoryId: CATEGORY, limit: 8 }] }), /storefront_contract_invalid/);
});

test("campaign composition rejects hostile accessors without invoking them", () => {
  let invoked = false;
  const value = validComposition();
  Object.defineProperty(value, "visual", { enumerable: true, get() { invoked = true; return {}; } });
  assert.throws(() => campaignValidation.parseStarterThemeCompositionConfig(value), /storefront_contract_invalid/);
  assert.equal(invoked, false);
});

test("public campaign projection is deeply frozen and excludes private references", () => {
  const parsed = campaignValidation.parsePublicStarterThemePresentation(validPublicPresentation());
  assert.equal(parsed.schemaVersion, 2);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.navigation), true);
  assert.equal(Object.isFrozen(parsed.sections), true);
  const encoded = JSON.stringify(parsed);
  assert.equal(encoded.includes("assetId"), false);
  assert.equal(encoded.includes("categoryId"), false);
  assert.equal(encoded.includes("productId"), false);
  const publicProduct = campaignValidation.parsePublicProduct({ id: PRODUCT, slug: "ornek-urun", title: "Örnek ürün", description: "**Kalıcı** açıklama", brand: { name: "Celebix", slug: "celebix" }, categoryPath: [{ name: "Takılar", slug: "takilar" }, { name: "Yüzükler", slug: "yuzukler" }], currency: "TRY", status: "active", priceCents: 12500, available: true, variants: [{ id: ASSET, title: "Standart", priceCents: 12500, stockTracking: true, stockQuantity: 2, available: true, attributes: {} }], media: [] });
  assert.deepEqual(publicProduct.brand, { name: "Celebix", slug: "celebix" });
  assert.equal(Object.isFrozen(publicProduct.categoryPath), true);
});

test("public navigation is canonical bounded and duplicate-free", () => {
  const value = validPublicPresentation();
  campaignValidation.parsePublicStarterThemePresentation(value);
  const item = value.navigation.items[0];
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, navigation: { items: [item, item] } }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, navigation: { items: Array.from({ length: 9 }, (_, index) => ({ name: `Kategori ${index}`, slug: `kategori-${index}`, children: [] })) } }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, navigation: { items: [{ ...item, slug: "Takılar" }] } }), /storefront_contract_invalid/);
});

test("public campaign sections reject unsafe routes malformed assets and invented currency", () => {
  const value = validPublicPresentation();
  campaignValidation.parsePublicStarterThemePresentation(value);
  const hero = value.sections[0] as { kind: string; slides: Array<Record<string, unknown>> };
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, sections: [{ ...hero, slides: [{ ...hero.slides[0], destination: "//evil.example" }] }] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, sections: [{ ...hero, slides: [{ ...hero.slides[0], desktopImage: { ...HERO, url: "https://evil.example/hero.webp" } }] }] }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, sections: [{ ...hero, slides: [{ ...hero.slides[0], hotspot: { ...(hero.slides[0]!.hotspot as object), currency: "USD" } }] }] }), /storefront_contract_invalid/);
});

test("legacy presentation adapts deterministically to retail schema v3", () => {
  const adapted = campaignPresentation.adaptStarterPresentationV1(legacyPresentation);
  assert.equal(adapted.schemaVersion, 3);
  assert.deepEqual((adapted.navigation as { items: unknown[] }).items.length, 1);
  assert.deepEqual((adapted.sections as Array<{ kind: string }>).map(({ kind }) => kind), ["hero", "category_grid", "product_row", "brand_story"]);
  assert.equal(Object.isFrozen(adapted), true);
});

test("new-store defaults are premium deterministic and contain no fake commerce data", () => {
  const defaults = campaignPresentation.buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  assert.equal(defaults.schemaVersion, 3);
  assert.equal((defaults.navigation as { items: unknown[] }).items.length, 0);
  assert.deepEqual((defaults.sections as Array<{ kind: string }>).map(({ kind }) => kind), ["hero", "product_row"]);
  assert.equal((defaults.footer as { newsletter: { enabled: boolean } }).newsletter.enabled, false);
  assert.equal(JSON.stringify(defaults).includes("discount"), false);
});

test("retail header layout is bounded to three merchant-selectable arrangements", () => {
  const defaults = campaignPresentation.buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  const visual = defaults.visual as Record<string, unknown>;
  assert.equal(visual.headerLayout, "menu_logo_actions");
  for (const headerLayout of ["menu_logo_actions", "logo_menu_actions", "stacked"] as const) {
    const parsed = campaignValidation.parsePublicStarterThemePresentation({
      ...defaults,
      visual: { ...visual, headerLayout },
    });
    assert.equal((parsed.visual as Record<string, unknown>).headerLayout, headerLayout);
  }
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({
    ...defaults,
    visual: { ...visual, headerLayout: "browser_custom" },
  }), /storefront_contract_invalid/);
});

test("public campaign parser rejects unknown private and inconsistent fields", () => {
  const value = validPublicPresentation();
  campaignValidation.parsePublicStarterThemePresentation(value);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, privateAuthority: true }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, schemaVersion: 1 }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, visual: { ...value.visual, headerStyle: "floating-secret" } }), /storefront_contract_invalid/);
  assert.throws(() => campaignValidation.parsePublicStarterThemePresentation({ ...value, sections: [{ kind: "brand_story", heading: "Hikâye", body: "Metin", image: { ...HERO, url: `${HERO.url}?private=1` } }] }), /storefront_contract_invalid/);
  assert.notEqual(CATEGORY, CATEGORY_TWO);
});
