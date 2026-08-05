import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultStarterPresentation, starterMarqueeTokens, starterThemeTokens } from "./presentation.ts";
import { parsePublicProduct, parsePublicStarterThemePresentation, parsePublicStorefront } from "./validation.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "60000000-0000-4000-8000-000000000001";
const CATEGORY_IMAGE = Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/category/70000000-0000-4000-8000-000000000001.webp", mediaType: "image/webp" as const, altText: "Bileklikler", width: 675, height: 900 });

const PRESENTATION = Object.freeze({
  schemaVersion: 1 as const,
  displayName: "Pilot Store",
  supportEmail: "destek@pilot.example",
  logo: Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/logo/50000000-0000-4000-8000-000000000002.webp", mediaType: "image/webp" as const, altText: "Pilot Store", width: 1440, height: 668 }),
  theme: Object.freeze({ colorScheme: "neutral" as const, headingStyle: "serif" as const, productCardStyle: "editorial" as const, productImageRatio: "portrait" as const, homeProductLimit: 8 as const, showBrandStory: true }),
  hero: Object.freeze({ enabled: true, headline: "Pilot Store", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products", image: Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/hero/50000000-0000-4000-8000-000000000001.webp", mediaType: "image/webp" as const, altText: "Pilot ürün vitrini", width: 1600, height: 900 }) }),
  promotion: Object.freeze({ headline: "Yeni koleksiyon", body: "Aktif ürünleri keşfedin.", destination: "/products" }),
  marquee: Object.freeze({ items: Object.freeze(["Güvenli ödeme", "Özenli seçim"]), icon: "shield" as const, speed: "normal" as const, direction: "left" as const, animation: "continuous" as const }),
  categoryShowcase: Object.freeze({ heading: "Kategorileri keşfet", items: Object.freeze([Object.freeze({ id: CATEGORY_ID, name: "Bileklikler", slug: "bileklikler", image: CATEGORY_IMAGE })]) }),
  seo: Object.freeze({ title: "Pilot Store", description: "Pilot mağaza ürünleri", allowIndex: false }),
});

const STOREFRONT = Object.freeze({ schemaVersion: 2 as const, id: STORE_ID, name: "Pilot Store", slug: "pilot-store", hostname: "pilot.saas-staging.celebix.site", primaryHostname: "pilot.saas-staging.celebix.site", canonicalUrl: "https://pilot.saas-staging.celebix.site/", currency: "TRY" as const, locale: "tr" as const, themeKey: "starter", presentation: PRESENTATION });

test("public storefront contract accepts only the exact schema-v2 presentation projection", () => {
  const parsed = parsePublicStorefront(STOREFRONT);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.presentation), true);
  assert.equal(Object.isFrozen(parsed.presentation.theme), true);
  assert.equal(Object.isFrozen(parsed.presentation.marquee?.items), true);
  assert.equal(Object.isFrozen(parsed.presentation.categoryShowcase?.items), true);
  assert.equal(Object.isFrozen(parsed.presentation.categoryShowcase?.items[0]?.image), true);
  assert.deepEqual(parsed, STOREFRONT);
  assert.throws(() => parsePublicStorefront({ ...parsed, membershipId: MEDIA_ID }));
  assert.throws(() => parsePublicStorefront({ ...parsed, hostname: "PILOT.saas-staging.celebix.site" }));
  assert.throws(() => parsePublicStorefront({ ...parsed, canonicalUrl: "https://other.example/" }));
  assert.throws(() => parsePublicStorefront({ ...parsed, schemaVersion: 1 }));
  assert.throws(() => parsePublicStorefront({ ...parsed, presentation: { ...PRESENTATION, debug: true } }));
  assert.throws(() => parsePublicStorefront({ ...parsed, presentation: { ...PRESENTATION, theme: { ...PRESENTATION.theme, homeProductLimit: 6 } } }));
  assert.throws(() => parsePublicStorefront({ ...parsed, presentation: { ...PRESENTATION, hero: { ...PRESENTATION.hero, destination: "//evil.example/path" } } }));
  assert.throws(() => parsePublicStorefront({ ...parsed, presentation: { ...PRESENTATION, hero: { ...PRESENTATION.hero, image: { ...PRESENTATION.hero.image, url: "http://media.example/hero.webp" } } } }));
  assert.throws(() => parsePublicStorefront({ ...parsed, presentation: { ...PRESENTATION, hero: { ...PRESENTATION.hero, image: { ...PRESENTATION.hero.image, height: undefined } } } }));
});

test("public storefront contract keeps the requested alias but canonicalizes to the active primary hostname", () => {
  const alias = {
    ...STOREFRONT,
    hostname: "shop.pilot.example",
    primaryHostname: "www.pilot.example",
    canonicalUrl: "https://www.pilot.example/",
  };

  assert.deepEqual(parsePublicStorefront(alias), alias);
  assert.throws(() => parsePublicStorefront({ ...alias, canonicalUrl: "https://shop.pilot.example/" }));
});

test("category showcase remains exact bounded canonical and duplicate-free", () => {
  const item = PRESENTATION.categoryShowcase!.items[0]!;
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, categoryShowcase: { heading: "Kategoriler", items: [] } }));
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, categoryShowcase: { heading: "Kategoriler", items: Array.from({ length: 9 }, (_, index) => ({ ...item, id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })) } }));
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, categoryShowcase: { heading: "Kategoriler", items: [item, item] } }));
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, categoryShowcase: { heading: "Kategoriler", items: [{ ...item, slug: "Bileklikler" }] } }));
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, logo: { ...PRESENTATION.logo, url: "http://media.example/logo.webp" } }));
  for (const url of [
    "https://guzide.example/wp-content/logo.webp",
    `${PRESENTATION.logo.url}?tracking=1`,
    "https://media.saas-staging.celebix.site:444/stores/10000000-0000-4000-8000-000000000001/storefront/logo/50000000-0000-4000-8000-000000000002.webp",
    "https://media.saas-staging.celebix.site/stores/not-a-store/storefront/logo/not-an-asset.webp",
  ]) assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, logo: { ...PRESENTATION.logo, url } }));
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, categoryShowcase: { heading: "Kategoriler", items: [{ ...item, image: { ...item.image, url: "https://guzide.example/wp-content/category.webp" } }] } }));
});

test("public storefront contract rejects getters and exotic presentation prototypes", () => {
  const getter = Object.defineProperty({ ...PRESENTATION }, "displayName", { enumerable: true, get() { return "Pilot Store"; } });
  assert.throws(() => parsePublicStorefront({ ...STOREFRONT, presentation: getter }));
  assert.throws(() => parsePublicStorefront({ ...STOREFRONT, presentation: Object.assign(Object.create({ inherited: true }), PRESENTATION) }));
});

test("public storefront contract rejects marquee accessors without invoking them", () => {
  let invoked = false;
  const items = ["Güvenli ödeme"];
  Object.defineProperty(items, "0", { enumerable: true, configurable: true, get() { invoked = true; return "Güvenli ödeme"; } });
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, marquee: { ...PRESENTATION.marquee, items } }));
  assert.equal(invoked, false);
});

test("starter presentation parser is reusable without weakening the public storefront envelope", () => {
  assert.deepEqual(parsePublicStarterThemePresentation(PRESENTATION), PRESENTATION);
  assert.throws(() => parsePublicStarterThemePresentation({ ...PRESENTATION, privateAuthority: true }));
});

test("starter presentation defaults and token mapping are deterministic and bounded", () => {
  const defaults = buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  assert.deepEqual(defaults, {
    schemaVersion: 3,
    displayName: "Yeni Mağaza",
    theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: false },
    hero: { enabled: true, headline: "Yeni Mağaza", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" },
    visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait", headerWidth: "wide", sectionSpacing: "balanced" },
    navigation: { items: [] },
    sections: [
      { kind: "hero", slides: [{ heading: "Yeni Mağaza", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" }] },
      { kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 },
    ],
    productDetail: { galleryStyle: "rail", showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: ["description", "materials_and_care", "certifications", "shipping_and_returns"] },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, showQuantitySelector: true },
    footer: {
      tone: "dark",
      groups: [
        { heading: "Mağaza", links: [{ label: "Ana Sayfa", destination: "/" }, { label: "Tüm Ürünler", destination: "/products" }, { label: "Favoriler", destination: "/favorites" }] },
        { heading: "Politikalar", links: [
          { label: "Gizlilik ve Güvenlik", destination: "/policies/privacy-security" },
          { label: "Mesafeli Satış Sözleşmesi", destination: "/policies/distance-sales" },
          { label: "KVKK", destination: "/policies/kvkk" },
          { label: "Ödeme & Teslimat", destination: "/policies/payment-delivery" },
          { label: "Çerez Kullanımı", destination: "/policies/cookies" },
          { label: "İade & Değişim", destination: "/policies/returns-exchanges" },
          { label: "Üyelik", destination: "/policies/membership" },
        ] },
      ],
      newsletter: { enabled: false, heading: "Bültene katılın", body: "Yeni ürünleri ilk siz öğrenin.", consentLabel: "E-posta iletişimine izin veriyorum." },
      social: [],
    },
    seo: { allowIndex: false },
  });
  assert.equal(Object.isFrozen(defaults.hero), true);
  assert.deepEqual(starterThemeTokens(PRESENTATION), { schemeClass: "theme-neutral", headingClass: "heading-serif", cardClass: "cards-editorial", imageClass: "images-portrait" });
  assert.deepEqual(starterMarqueeTokens(PRESENTATION.marquee!), { iconSymbol: "✓", iconClass: "marquee-icon-shield", speedClass: "marquee-speed-normal", directionClass: "marquee-direction-left", animationClass: "marquee-animation-continuous" });
});

test("public product contract excludes cost and archived authority while preserving ordered active media", () => {
  const parsed = parsePublicProduct({ id: PRODUCT_ID, slug: "pilot-product", title: "Pilot Product", description: "Storefront description", currency: "TRY", status: "active", priceCents: 12_500, compareAtCents: 15_000, available: true, variants: [{ id: VARIANT_ID, title: "Default", sku: "PILOT-ONE", priceCents: 12_500, compareAtCents: 15_000, stockTracking: true, stockQuantity: 3, available: true, attributes: { color: "black" } }], media: [{ id: MEDIA_ID, productId: PRODUCT_ID, url: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, mediaType: "image/webp", altText: "Pilot product front view", width: 1200, height: 1200, sortOrder: 0 }] });
  assert.equal(Object.isFrozen(parsed.variants), true);
  assert.equal("costCents" in parsed.variants[0]!, false);
  assert.throws(() => parsePublicProduct({ ...parsed, costCents: 1 }));
  assert.throws(() => parsePublicProduct({ ...parsed, status: "draft" }));
});

test("public product contract preserves bounded multiline Markdown descriptions", () => {
  const markdown = "## Ürün özeti\n\n- 14 ayar altın\n- El işçiliği\n\n**Bakım:** Yumuşak bir bez kullanın.\nÖlçü bilgisi ürün detayındadır.";
  const product = {
    id: PRODUCT_ID,
    slug: "markdown-product",
    title: "Markdown Product",
    description: markdown,
    currency: "TRY",
    status: "active",
    priceCents: 12_500,
    available: true,
    variants: [{ id: VARIANT_ID, title: "Default", sku: "MARKDOWN-ONE", priceCents: 12_500, stockTracking: true, stockQuantity: 3, available: true, attributes: {} }],
    media: [],
  };

  assert.equal(parsePublicProduct(product).description, markdown);
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\u0000olmayan açıklama" }));
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\tolmayan açıklama" }));
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\rolmayan açıklama" }));
});
