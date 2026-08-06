import assert from "node:assert/strict";
import test from "node:test";

import * as presentationModule from "./presentation.ts";
import * as validationModule from "./validation.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const CATEGORY = "20000000-0000-4000-8000-000000000001";
const PAGE = "25000000-0000-4000-8000-000000000001";
const ASSET = "30000000-0000-4000-8000-000000000001";

const IMAGE = Object.freeze({
  url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`,
  mediaType: "image/webp",
  altText: "Yeni sezon",
  width: 1600,
  height: 1000,
});

const baseTheme = Object.freeze({ colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true });
const legacyHero = Object.freeze({ enabled: true, headline: "Yeni sezon", body: "Yeni ürünleri keşfedin.", destination: "/products", image: IMAGE });
const visualV1 = Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" });
const visualV2 = Object.freeze({ ...visualV1, headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "airy" });

function compositionV2() {
  return {
    schemaVersion: 2,
    visual: visualV2,
    announcement: { enabled: true, items: ["Güvenli alışveriş"], destination: "/products" },
    navigation: { rootCategoryIds: [CATEGORY] },
    sections: [
      { kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "value_propositions", enabled: true, items: [
        { icon: "shield", heading: "Güvenli alışveriş", body: "Korunan ödeme akışı." },
        { icon: "return", heading: "Kolay iade", body: "Yayımlanmış koşulları inceleyin." },
      ] },
      { kind: "testimonials", enabled: true, heading: "Sizden gelenler", source: "approved_product_reviews", limit: 3, minimumRating: 4 },
    ],
    productDetail: {
      galleryStyle: "rail", showSku: true, showBrand: true, showBreadcrumbs: true,
      showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true,
      showSizeGuide: true,
      informationSections: ["description", "materials_and_care", "certifications", "shipping_and_returns"],
    },
    cart: { showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: true },
    footer: {
      tone: "dark",
      groups: [
        { heading: "Mağaza", links: [{ kind: "system", destination: "/products" }, { kind: "category", categoryId: CATEGORY }] },
        { heading: "Yardım", links: [{ kind: "fixed_policy", policyKey: "privacy_security" }, { kind: "page", pageId: PAGE }] },
      ],
      newsletter: { enabled: true, heading: "Bültene katılın", body: "Yeni ürünleri ilk siz öğrenin.", consentLabel: "E-posta iletişimine izin veriyorum." },
      social: [{ network: "instagram", url: "https://www.instagram.com/celebix" }],
    },
  };
}

function presentationV2() {
  return {
    schemaVersion: 2,
    displayName: "Pilot Store",
    theme: baseTheme,
    hero: legacyHero,
    visual: visualV1,
    navigation: { items: [] },
    sections: [{ kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 }],
    productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
    cart: { showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: true },
    seo: { allowIndex: false },
  };
}

function presentationV3() {
  return {
    ...presentationV2(),
    schemaVersion: 3,
    visual: visualV2,
    sections: [
      { kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "value_propositions", items: [
        { icon: "shield", heading: "Güvenli alışveriş", body: "Korunan ödeme akışı." },
        { icon: "return", heading: "Kolay iade", body: "Yayımlanmış koşulları inceleyin." },
      ] },
      { kind: "testimonials", heading: "Sizden gelenler", items: [
        { reviewerName: "Ada", rating: 5, title: "Harika", body: "Çok memnun kaldım.", merchantReply: "Teşekkür ederiz." },
      ] },
    ],
    productDetail: {
      galleryStyle: "rail", showSku: true, showBrand: true, showBreadcrumbs: true,
      showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true,
      showSizeGuide: true,
      informationSections: ["description", "materials_and_care", "certifications", "shipping_and_returns"],
    },
    footer: {
      tone: "dark",
      groups: [
        { heading: "Mağaza", links: [{ label: "Ürünler", destination: "/products" }] },
        { heading: "Yardım", links: [{ label: "Gizlilik ve Güvenlik", destination: "/policies/privacy-security" }] },
      ],
      newsletter: { enabled: true, heading: "Bültene katılın", body: "Yeni ürünleri ilk siz öğrenin.", consentLabel: "E-posta iletişimine izin veriyorum." },
      social: [{ network: "instagram", url: "https://www.instagram.com/celebix" }],
    },
    seo: { allowIndex: false },
  };
}

type RetailValidation = {
  parseStarterThemeCompositionConfig(value: unknown): Readonly<Record<string, unknown>>;
  parsePublicStarterThemePresentation(value: unknown): Readonly<Record<string, unknown>>;
  parsePublicProduct(value: unknown): Readonly<Record<string, unknown>>;
};
type RetailPresentation = {
  adaptStarterPresentationV2(value: unknown): Readonly<Record<string, unknown>>;
  buildDefaultStarterPresentation(value: Readonly<{ name: string }>): Readonly<Record<string, unknown>>;
};
const retailValidation = validationModule as unknown as RetailValidation;
const retailPresentation = presentationModule as unknown as RetailPresentation;

test("composition v2 accepts retail sections footer and exact product information controls", () => {
  const parsed = retailValidation.parseStarterThemeCompositionConfig(compositionV2());
  assert.equal(parsed.schemaVersion, 2);
  assert.equal((parsed.cart as { showQuantitySelector: boolean }).showQuantitySelector, true);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.footer), true);
  assert.equal(Object.isFrozen((parsed.footer as { groups: unknown }).groups), true);
});

test("composition v2 requires one exact boolean quantity-selector authority", () => {
  const value = compositionV2();
  const { showQuantitySelector: _missing, ...withoutQuantitySelector } = value.cart;
  assert.throws(() => retailValidation.parseStarterThemeCompositionConfig({ ...value, cart: withoutQuantitySelector }), /storefront_contract_invalid/);
  assert.throws(() => retailValidation.parseStarterThemeCompositionConfig({ ...value, cart: { ...value.cart, showQuantitySelector: "true" } }), /storefront_contract_invalid/);
  const disabled = retailValidation.parseStarterThemeCompositionConfig({ ...value, cart: { ...value.cart, showQuantitySelector: false } });
  assert.equal((disabled.cart as { showQuantitySelector: boolean }).showQuantitySelector, false);
});

test("composition v2 rejects fake testimonial copy unsafe social authority and duplicate information panels", () => {
  const value = compositionV2();
  assert.throws(() => retailValidation.parseStarterThemeCompositionConfig({ ...value, sections: [{ ...(value.sections[2] as object), quotes: ["sahte"] }] }), /storefront_contract_invalid/);
  assert.throws(() => retailValidation.parseStarterThemeCompositionConfig({ ...value, footer: { ...value.footer, social: [{ network: "instagram", url: "https://evil.example/celebix" }] } }), /storefront_contract_invalid/);
  assert.throws(() => retailValidation.parseStarterThemeCompositionConfig({ ...value, productDetail: { ...value.productDetail, informationSections: ["description", "description"] } }), /storefront_contract_invalid/);
});

test("presentation v3 is exact deeply frozen and excludes private references", () => {
  const parsed = retailValidation.parsePublicStarterThemePresentation(presentationV3());
  assert.equal(parsed.schemaVersion, 3);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen((parsed.footer as { groups: unknown }).groups), true);
  assert.doesNotMatch(JSON.stringify(parsed), /categoryId|pageId|tenantId|storeId|assetId/);
  assert.throws(() => retailValidation.parsePublicStarterThemePresentation({ ...presentationV3(), privateAuthority: true }), /storefront_contract_invalid/);
});

test("presentation v2 adapts to v3 without invented retail content", () => {
  const adapted = retailPresentation.adaptStarterPresentationV2(presentationV2());
  assert.equal(adapted.schemaVersion, 3);
  assert.equal((adapted.footer as { newsletter: { enabled: boolean } }).newsletter.enabled, false);
  assert.deepEqual((adapted.sections as Array<{ kind: string }>).filter(({ kind }) => kind === "testimonials"), []);
  assert.deepEqual((adapted.sections as Array<{ kind: string }>).filter(({ kind }) => kind === "value_propositions"), []);
  assert.equal((adapted.cart as { showQuantitySelector: boolean }).showQuantitySelector, true);
});

test("new starter storefronts expose every fixed policy route in the default footer", () => {
  const defaults = retailPresentation.buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  assert.doesNotThrow(() => retailValidation.parsePublicStarterThemePresentation(defaults));
  const footer = defaults.footer as { groups: readonly { heading: string; links: readonly { destination: string }[] }[] };
  assert.deepEqual(
    footer.groups.find(({ heading }) => heading === "Politikalar")?.links.map(({ destination }) => destination),
    [
      "/policies/privacy-security",
      "/policies/distance-sales",
      "/policies/kvkk",
      "/policies/payment-delivery",
      "/policies/cookies",
      "/policies/returns-exchanges",
      "/policies/membership",
    ],
  );
});

test("public product accepts bounded merchandising and approved review projections only", () => {
  const product = {
    id: "40000000-0000-4000-8000-000000000001", slug: "ornek-urun", title: "Örnek ürün", currency: "TRY", status: "active", priceCents: 12500, available: true,
    variants: [{ id: "50000000-0000-4000-8000-000000000001", title: "Standart", priceCents: 12500, stockTracking: true, stockQuantity: 2, available: true, attributes: {} }],
    media: [],
    merchandising: { highlights: ["El işçiliği"], materialsAndCare: "**Nazikçe** temizleyin.", certifications: ["Sertifika A"], sizeGuide: { heading: "Ölçü rehberi", body: "Çevre ölçüsünü kullanın." } },
    reviews: [{ reviewerName: "Ada", rating: 5, body: "Çok memnun kaldım." }],
  };
  const parsed = retailValidation.parsePublicProduct(product);
  assert.equal(Object.isFrozen(parsed.merchandising), true);
  assert.equal(Object.isFrozen(parsed.reviews), true);
  assert.throws(() => retailValidation.parsePublicProduct({ ...product, reviews: [{ ...product.reviews[0], status: "pending" }] }), /storefront_contract_invalid/);
});
