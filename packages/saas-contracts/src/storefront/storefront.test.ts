import assert from "node:assert/strict";
import test from "node:test";

import { buildDefaultStarterPresentation, starterThemeTokens } from "./presentation.ts";
import { parsePublicProduct, parsePublicStorefront } from "./validation.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";

const PRESENTATION = Object.freeze({
  schemaVersion: 1 as const,
  displayName: "Pilot Store",
  supportEmail: "destek@pilot.example",
  theme: Object.freeze({ colorScheme: "neutral" as const, headingStyle: "serif" as const, productCardStyle: "editorial" as const, productImageRatio: "portrait" as const, homeProductLimit: 8 as const, showBrandStory: true }),
  hero: Object.freeze({ enabled: true, headline: "Pilot Store", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products", image: Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/hero/50000000-0000-4000-8000-000000000001.webp", mediaType: "image/webp" as const, altText: "Pilot ürün vitrini", width: 1600, height: 900 }) }),
  promotion: Object.freeze({ headline: "Yeni koleksiyon", body: "Aktif ürünleri keşfedin.", destination: "/products" }),
  marquee: Object.freeze({ items: Object.freeze(["Güvenli ödeme", "Özenli seçim"]), icon: "shield" as const, speed: "normal" as const, direction: "left" as const, animation: "continuous" as const }),
  seo: Object.freeze({ title: "Pilot Store", description: "Pilot mağaza ürünleri", allowIndex: false }),
});

const STOREFRONT = Object.freeze({ schemaVersion: 2 as const, id: STORE_ID, name: "Pilot Store", slug: "pilot-store", hostname: "pilot.saas-staging.celebix.site", primaryHostname: "pilot.saas-staging.celebix.site", canonicalUrl: "https://pilot.saas-staging.celebix.site/", currency: "TRY" as const, locale: "tr" as const, themeKey: "starter", presentation: PRESENTATION });

test("public storefront contract accepts only the exact schema-v2 presentation projection", () => {
  const parsed = parsePublicStorefront(STOREFRONT);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.presentation), true);
  assert.equal(Object.isFrozen(parsed.presentation.theme), true);
  assert.equal(Object.isFrozen(parsed.presentation.marquee?.items), true);
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

test("public storefront contract rejects getters and exotic presentation prototypes", () => {
  const getter = Object.defineProperty({ ...PRESENTATION }, "displayName", { enumerable: true, get() { return "Pilot Store"; } });
  assert.throws(() => parsePublicStorefront({ ...STOREFRONT, presentation: getter }));
  assert.throws(() => parsePublicStorefront({ ...STOREFRONT, presentation: Object.assign(Object.create({ inherited: true }), PRESENTATION) }));
});

test("starter presentation defaults and token mapping are deterministic and bounded", () => {
  const defaults = buildDefaultStarterPresentation({ name: "Yeni Mağaza" });
  assert.deepEqual(defaults, {
    schemaVersion: 1,
    displayName: "Yeni Mağaza",
    theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true },
    hero: { enabled: true, headline: "Yeni Mağaza", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" },
    seo: { allowIndex: false },
  });
  assert.equal(Object.isFrozen(defaults.hero), true);
  assert.deepEqual(starterThemeTokens(PRESENTATION), { schemeClass: "theme-neutral", headingClass: "heading-serif", cardClass: "cards-editorial", imageClass: "images-portrait" });
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
