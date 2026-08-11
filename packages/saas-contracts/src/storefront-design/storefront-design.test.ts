import assert from "node:assert/strict";
import test from "node:test";

import * as validation from "./validation.ts";

const {
  parsePublicStorefrontDesign,
  parseStorefrontDesignDocument,
  parseStorefrontDesignWorkspace,
} = validation;
const getStorefrontDesignPublishIssue = (validation as typeof validation & {
  getStorefrontDesignPublishIssue(value: unknown): unknown;
}).getStorefrontDesignPublishIssue;

const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";

const COMPOSITION = {
  schemaVersion: 2,
  visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "square", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait", headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" },
  announcement: { enabled: true, items: ["Güvenli alışveriş"], destination: "/pages/odeme-teslimat" },
  navigation: { rootCategoryIds: [] },
  sections: [{ kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 }],
  productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: ["description", "materials_and_care", "certifications", "shipping_and_returns"] },
  cart: { showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: true, trustMessage: "Güvenli ödeme" },
  footer: {
    tone: "dark",
    groups: [
      { heading: "Mağaza", links: [{ kind: "system", destination: "/products" }, { kind: "system", destination: "/favorites" }] },
      { heading: "Hesap", links: [{ kind: "system", destination: "/account" }] },
    ],
    newsletter: { enabled: false, heading: "Bizden haber alın", body: "Yeni ürün ve mağaza duyurularını e-postanızda alın.", consentLabel: "Aydınlatma metnini okudum ve iletişime izin veriyorum." },
    social: [],
  },
} as const;

const VERSIONED_COMPOSITION = {
  ...COMPOSITION,
  schemaVersion: 3,
  sections: COMPOSITION.sections.map((section, index) => ({
    ...section,
    sectionId: `home_${section.kind}_${index + 1}`,
  })),
} as const;

const SLIDE = {
  headline: "Zarafetin ışıltısı",
  body: "Her anınıza değer katan zamansız tasarımlar.",
  desktopImage: { kind: "media", mediaId: MEDIA_ID },
  mobileImage: null,
  destination: { kind: "product", resourceId: PRODUCT_ID },
  enabled: true,
} as const;

const TYPOGRAPHY = {
  headingFont: { family: "Playfair Display", category: "serif", availableWeights: ["500", "600", "700"], source: "google" },
  bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
  headingWeight: "700",
  bodyWeight: "400",
  headingSizePx: 48,
  bodySizePx: 16,
} as const;

const DESIGN = {
  schemaVersion: 3,
  brand: {
    logo: { kind: "media", mediaId: MEDIA_ID },
    favicon: null,
    primaryColor: "#FF5A00",
    accentColor: "#171717",
    backgroundColor: "#FFFFFF",
    textColor: "#171717",
    fontFamily: "inter",
  },
  hero: { enabled: true, slides: [SLIDE] },
  promotion: {
    headline: "Ücretsiz kargo",
    body: "Tüm siparişlerde geçerli.",
    destination: { kind: "none" },
    startsAt: "2026-08-03T09:00:00.000Z",
    endsAt: "2026-08-31T20:59:59.000Z",
    enabled: true,
  },
  announcement: {
    items: ["Tüm siparişlerde ücretsiz kargo", "14 gün içinde iade"],
    icon: "truck",
    speed: "normal",
    direction: "left",
    animation: "continuous",
    enabled: true,
  },
  typography: TYPOGRAPHY,
  composition: COMPOSITION,
} as const;

const { composition: _LEGACY_COMPOSITION, typography: _LEGACY_TYPOGRAPHY, ...DESIGN_WITHOUT_COMPOSITION } = DESIGN;
const LEGACY_DESIGN = {
  ...DESIGN_WITHOUT_COMPOSITION,
  schemaVersion: 1,
  hero: {
    headline: SLIDE.headline,
    body: SLIDE.body,
    image: SLIDE.desktopImage,
    destination: SLIDE.destination,
    enabled: false,
  },
} as const;

const PUBLIC_SLIDE = {
  headline: SLIDE.headline,
  body: SLIDE.body,
  desktopImage: {
    url: `https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/design/${MEDIA_ID}.webp`,
    altText: "Altın kolye ve yüzük",
  },
  mobileImage: null,
  destination: { path: "/products/pirlanta-kolye" },
} as const;

const PUBLIC_DESIGN = {
  schemaVersion: 2,
  publicationVersion: 3,
  publishedAt: "2026-08-03T10:00:00.000Z",
  brand: {
    logo: {
      url: `https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/design/${MEDIA_ID}.webp`,
      altText: "Güzide Kuyumcu",
    },
    favicon: null,
    primaryColor: "#FF5A00",
    accentColor: "#171717",
    backgroundColor: "#FFFFFF",
    textColor: "#171717",
    fontFamily: "inter",
  },
  hero: { enabled: true, slides: [PUBLIC_SLIDE] },
  promotion: {
    headline: "Ücretsiz kargo",
    body: "Tüm siparişlerde geçerli.",
    destination: null,
    startsAt: "2026-08-03T09:00:00.000Z",
    endsAt: "2026-08-31T20:59:59.000Z",
    enabled: true,
  },
  announcement: DESIGN.announcement,
  typography: TYPOGRAPHY,
} as const;

const { typography: _LEGACY_PUBLIC_TYPOGRAPHY, ...PUBLIC_DESIGN_WITHOUT_TYPOGRAPHY } = PUBLIC_DESIGN;
const LEGACY_PUBLIC_DESIGN = {
  ...PUBLIC_DESIGN_WITHOUT_TYPOGRAPHY,
  schemaVersion: 1,
  hero: {
    headline: PUBLIC_SLIDE.headline,
    body: PUBLIC_SLIDE.body,
    image: PUBLIC_SLIDE.desktopImage,
    destination: PUBLIC_SLIDE.destination,
    enabled: true,
  },
} as const;

const WORKSPACE = {
  schemaVersion: 3,
  draftVersion: 4,
  publishedVersion: 3,
  draftUpdatedAt: "2026-08-03T10:01:00.000Z",
  publishedAt: "2026-08-03T10:00:00.000Z",
  draft: DESIGN,
  published: PUBLIC_DESIGN,
  store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" },
  media: [{ id: MEDIA_ID, url: PUBLIC_DESIGN.brand.logo.url, altText: "Güzide Kuyumcu", mediaType: "image/webp", width: 1200, height: 600 }],
  destinations: [{ kind: "product", resourceId: PRODUCT_ID, label: "Pırlanta Kolye", path: `/products/${PRODUCT_ID}` }],
} as const;

test("storefront design composition accepts version three and normalizes one legacy hero without losing visibility", () => {
  assert.deepEqual(parseStorefrontDesignDocument(DESIGN), { ...DESIGN, schemaVersion: 4, composition: VERSIONED_COMPOSITION });
  assert.equal(Object.isFrozen(parseStorefrontDesignDocument(DESIGN).hero.slides), true);
  const legacy = parseStorefrontDesignDocument(LEGACY_DESIGN);
  assert.equal(legacy.schemaVersion, 4);
  assert.equal(legacy.hero.enabled, false);
  assert.deepEqual(legacy.hero.slides[0], { ...SLIDE, enabled: true });
});

test("homepage composition assigns immutable stable section identity and rejects ambiguous identity", () => {
  const canonical = parseStorefrontDesignDocument({
    ...DESIGN,
    schemaVersion: 4,
    composition: VERSIONED_COMPOSITION,
  });
  assert.equal(canonical.schemaVersion, 4);
  assert.deepEqual(canonical.composition, VERSIONED_COMPOSITION);
  assert.equal(Object.isFrozen(canonical.composition.sections), true);
  assert.equal(Object.isFrozen(canonical.composition.sections[0]), true);

  const legacy = parseStorefrontDesignDocument(DESIGN);
  assert.equal(legacy.schemaVersion, 4);
  assert.equal(legacy.composition.schemaVersion, 3);
  assert.equal(legacy.composition.sections[0]?.sectionId, "home_product_row_1");

  const duplicate = {
    ...VERSIONED_COMPOSITION,
    sections: [
      VERSIONED_COMPOSITION.sections[0],
      { ...VERSIONED_COMPOSITION.sections[0], heading: "İkinci sıra" },
    ],
  };
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, schemaVersion: 4, composition: duplicate }));
  assert.throws(() => parseStorefrontDesignDocument({
    ...DESIGN,
    schemaVersion: 4,
    composition: {
      ...VERSIONED_COMPOSITION,
      sections: [{ ...VERSIONED_COMPOSITION.sections[0], sectionId: "invalid id" }],
    },
  }));
});

test("storefront design accepts an intentionally empty homepage and rejects unknown composition fields", () => {
  const empty = parseStorefrontDesignDocument({ ...DESIGN, composition: { ...COMPOSITION, sections: [] } });
  assert.deepEqual(empty.composition.sections, []);
  assert.equal(Object.isFrozen(empty.composition.sections), true);
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, composition: { ...COMPOSITION, storeId: PRODUCT_ID } }));
});

test("storefront typography normalizes legacy fonts and rejects unsafe or unsupported authority", () => {
  const parsed = parseStorefrontDesignDocument(DESIGN);
  assert.deepEqual(parsed.typography, TYPOGRAPHY);
  assert.equal(Object.isFrozen(parsed.typography), true);
  assert.equal(Object.isFrozen(parsed.typography.headingFont.availableWeights), true);

  assert.deepEqual(parseStorefrontDesignDocument(LEGACY_DESIGN).typography, {
    headingFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
    bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
    headingWeight: "700",
    bodyWeight: "400",
    headingSizePx: 40,
    bodySizePx: 16,
  });

  const invalid = (typography: unknown) => assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, typography }));
  invalid({ ...TYPOGRAPHY, tenantId: PRODUCT_ID });
  invalid({ ...TYPOGRAPHY, headingFont: { ...TYPOGRAPHY.headingFont, family: "Inter; color:red" } });
  invalid({ ...TYPOGRAPHY, headingFont: { ...TYPOGRAPHY.headingFont, availableWeights: ["500", "500"] } });
  invalid({ ...TYPOGRAPHY, headingWeight: "400" });
  invalid({ ...TYPOGRAPHY, headingSizePx: 73 });
  invalid({ ...TYPOGRAPHY, bodySizePx: 13 });
});

test("design contract rejects unknown fields, unsafe values, invalid schedules, hostile shapes, and slider bounds", () => {
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, tenantId: PRODUCT_ID }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, brand: { ...DESIGN.brand, primaryColor: "orange" } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...SLIDE, headline: "Güvenli\u0000değil" }] } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, slides: [] } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, hero: { ...DESIGN.hero, slides: [SLIDE, SLIDE, SLIDE, SLIDE] } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, promotion: { ...DESIGN.promotion, startsAt: DESIGN.promotion.endsAt, endsAt: DESIGN.promotion.startsAt } }));
  assert.throws(() => parseStorefrontDesignDocument({ ...DESIGN, announcement: { ...DESIGN.announcement, items: new Array(2) } }));

  const accessor = { ...DESIGN } as Record<string, unknown>;
  Object.defineProperty(accessor, "brand", { enumerable: true, get: () => DESIGN.brand });
  assert.throws(() => parseStorefrontDesignDocument(accessor));
});

test("admin writes reject legacy remote images", () => {
  assert.throws(() => parseStorefrontDesignDocument({
    ...DESIGN,
    hero: { ...DESIGN.hero, slides: [{ ...SLIDE, desktopImage: { kind: "legacy_https", url: "https://legacy.example/hero.jpg" } }] },
  }));
});

test("publication validation reports the first exact banner issue", () => {
  assert.deepEqual(getStorefrontDesignPublishIssue({ ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...SLIDE, enabled: false }] } }), { code: "hero_enabled_slide_missing" });
  assert.deepEqual(getStorefrontDesignPublishIssue({ ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...SLIDE, headline: "" }] } }), { code: "hero_slide_headline_missing", slideIndex: 0 });
  assert.deepEqual(getStorefrontDesignPublishIssue({ ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...SLIDE, desktopImage: null }] } }), { code: "hero_slide_desktop_image_missing", slideIndex: 0 });
  assert.equal(getStorefrontDesignPublishIssue(DESIGN), null);
});

test("public contract resolves private identifiers and normalizes a legacy publication", () => {
  assert.deepEqual(parsePublicStorefrontDesign(PUBLIC_DESIGN), PUBLIC_DESIGN);
  assert.deepEqual(parsePublicStorefrontDesign(LEGACY_PUBLIC_DESIGN).typography, {
    headingFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
    bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" },
    headingWeight: "700",
    bodyWeight: "400",
    headingSizePx: 40,
    bodySizePx: 16,
  });
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, draftVersion: 2 }));
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, hero: { ...PUBLIC_DESIGN.hero, slides: [{ ...PUBLIC_SLIDE, mediaId: MEDIA_ID }] } }));
  assert.throws(() => parsePublicStorefrontDesign({ ...PUBLIC_DESIGN, hero: { ...PUBLIC_DESIGN.hero, slides: [{ ...PUBLIC_SLIDE, destination: { path: "https://evil.example/" } }] } }));
  const serialized = JSON.stringify(parsePublicStorefrontDesign(PUBLIC_DESIGN));
  assert.doesNotMatch(serialized, /"(?:mediaId|resourceId)":/);
  assert.doesNotMatch(serialized, /"composition":/);
});

test("authenticated workspace keeps exact tenant choices and versioned state", () => {
  assert.deepEqual(parseStorefrontDesignWorkspace(WORKSPACE), {
    ...WORKSPACE,
    draft: { ...DESIGN, schemaVersion: 4, composition: VERSIONED_COMPOSITION },
  });
  assert.throws(() => parseStorefrontDesignWorkspace({ ...WORKSPACE, storeId: PRODUCT_ID }));
  assert.throws(() => parseStorefrontDesignWorkspace({ ...WORKSPACE, destinations: [{ ...WORKSPACE.destinations[0], kind: "none" }] }));
});
