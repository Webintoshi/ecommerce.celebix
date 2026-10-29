import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPublicStorefrontRepository, PublicStorefrontRepositoryError } from "./index.ts";
import { PostgresPublicStorefrontContentRepository, StorefrontContentRepositoryError } from "../storefront-content/index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001", PRODUCT = "20000000-0000-4000-8000-000000000001", OTHER = "20000000-0000-4000-8000-000000000002", VARIANT = "30000000-0000-4000-8000-000000000001";
const HOST = "pilot.example.test", NOW = new Date("2026-10-29T12:00:00Z");
const product = { id: PRODUCT, slug: "gercek-urun", title: "Ürün", currency: "TRY", status: "active", priceCents: 1000, available: true, variants: [{ id: VARIANT, title: "Standart", priceCents: 1000, stockTracking: true, stockQuantity: 2, available: true, attributes: {} }], media: [] };
const presentation = {
  schemaVersion: 2, displayName: "Pilot", theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true },
  hero: { enabled: true, headline: "Pilot", body: "Mağazanın ürünleri", destination: "/products" }, visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" },
  navigation: { items: [] }, sections: [{ kind: "product_row", key: "latest-0", heading: "Ürünler", source: "latest", limit: 8 }],
  productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true }, cart: { showCheckoutReadiness: true, showShippingProgress: true, showQuantitySelector: true, trustMessage: "Güvenli ödeme" }, seo: { allowIndex: false },
} as const;
const storefront = { schemaVersion: 2, id: STORE, name: "Pilot", slug: "pilot", hostname: HOST, primaryHostname: HOST, canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr", themeKey: "starter", presentation } as const;
const summary = { enabled: true, items: [{ productId: PRODUCT, averageRating: 3.5, reviewCount: 22 }, { productId: OTHER, averageRating: 0, reviewCount: 0 }] };
const products = [product, { ...product, id: OTHER, slug: "diger-urun" }];
const timeouts = { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 };

function fixture(payload: unknown, summaries: unknown = summary) {
  const calls: { text: string; values: unknown[] }[] = [];
  const client = { async query(text: string, values: unknown[] = []) {
    calls.push({ text, values });
    const result_payload = text.includes("public_variant_media_assignments") ? { assignments: [] } : text.includes("public_product_review_summaries") ? typeof summaries === "function" ? summaries(values[2]) : summaries : payload;
    const rows = text.startsWith("SELECT outcome") ? [{ outcome: "found", result_payload }] : [];
    return { rows, rowCount: rows.length };
  }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  return { calls, catalog: new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts }), content: new PostgresPublicStorefrontContentRepository({ pool, role: "celebix_saas_host_resolver", timeouts }) };
}

const selection = { storefront, now: NOW, query: "", filter: "all", order: "featured", limit: 24, offset: 0 } as const;
const surfaces = [
  { name: "catalog page", payload: { items: products, total: 2, nextOffset: null }, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.queryPublicCatalog({ ...selection, categorySlug: null })).items },
  { name: "category", payload: { category: { id: STORE, slug: "urunler", name: "Ürünler" }, items: products }, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.listPublicProductsByCategory({ storefront, now: NOW, slug: "urunler", limit: 24 })).items },
  { name: "collection", payload: { collection: { id: STORE, slug: "urunler", name: "Ürünler" }, items: products, total: 2, nextOffset: null }, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.queryPublicCollection({ ...selection, slug: "urunler" })).items },
  { name: "legacy homepage", payload: products, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.listPublicProducts({ storefront, now: NOW, limit: 24 })).items },
  { name: "campaign rows", payload: { presentation, productRows: [{ key: "latest-0", items: [...products, product] }] }, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.resolveCampaignHome({ storefront, now: NOW })).productRows[0]!.items },
  { name: "related products", payload: products, read: async (f: ReturnType<typeof fixture>) => (await f.catalog.listRelatedPublicProducts({ storefront, now: NOW, productSlug: product.slug, limit: 12 })).items },
  { name: "search", payload: { items: products }, read: async (f: ReturnType<typeof fixture>) => (await f.content.search({ hostname: HOST, now: NOW, query: "ürün", limit: 24 })).items },
  { name: "favorites", payload: { items: products }, read: async (f: ReturnType<typeof fixture>) => f.content.resolveProductIds({ hostname: HOST, now: NOW, productIds: [PRODUCT, OTHER] }) },
];

for (const surface of surfaces) test(`${surface.name} carries approved summaries in one host-authorized batch inside its read snapshot`, async () => {
  const f = fixture(surface.payload);
  const result = await surface.read(f);
  assert.deepEqual(result[0]?.reviewSummary, { averageRating: 3.5, reviewCount: 22 });
  assert.deepEqual(result[1]?.reviewSummary, { averageRating: 0, reviewCount: 0 });
  assert.deepEqual(result.map(item => item.id), surface.name === "campaign rows" ? [PRODUCT, OTHER, PRODUCT] : [PRODUCT, OTHER]);
  assert.equal(Object.isFrozen(result[0]?.reviewSummary), true);
  const reads = f.calls.filter(call => call.text.includes("public_product_review_summaries"));
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0]?.values, [HOST, NOW, [PRODUCT, OTHER]]);
  assert.equal(f.calls.filter(call => call.text.startsWith("BEGIN")).length, 1);
  assert.ok(f.calls.findIndex(call => call.text === "COMMIT") > f.calls.findIndex(call => call.text.includes("public_product_review_summaries")));
});

test("disabled public reviews strip stale summaries on catalog and favorites without inventing empty ratings", async () => {
  const stale = { ...product, reviewSummary: { averageRating: 5, reviewCount: 1 } };
  const f = fixture({ items: [stale], total: 1, nextOffset: null }, { enabled: false, items: [] });
  const page = await f.catalog.queryPublicCatalog({ ...selection, categorySlug: null });
  assert.equal(Object.hasOwn(page.items[0]!, "reviewSummary"), false);
  const favorites = fixture({ items: [stale] }, { enabled: false, items: [] });
  assert.equal(Object.hasOwn((await favorites.content.resolveProductIds({ hostname: HOST, now: NOW, productIds: [PRODUCT] }))[0]!, "reviewSummary"), false);
});

test("review batches reject foreign, duplicate, missing or invalid summary rows and roll back", async () => {
  for (const summaries of [
    { enabled: true, items: [{ productId: STORE, averageRating: 5, reviewCount: 1 }] },
    { enabled: true, items: [summary.items[0], summary.items[0]] }, { enabled: true, items: [] },
    { enabled: false, items: [summary.items[0]] }, { enabled: true, items: [{ ...summary.items[0], averageRating: 6 }] },
    { enabled: true, items: [{ ...summary.items[0], reviewCount: 0 }] },
    { enabled: true, items: [{ ...summary.items[0], reviewerName: "Private" }] },
  ]) {
    const f = fixture({ items: [product], total: 1, nextOffset: null }, summaries);
    await assert.rejects(f.catalog.queryPublicCatalog({ ...selection, categorySlug: null }), error => error instanceof PublicStorefrontRepositoryError && error.code === "unavailable");
    assert.ok(f.calls.some(call => call.text === "ROLLBACK"));
    assert.equal(f.calls.some(call => call.text === "COMMIT"), false);
    const content = fixture({ items: [product] }, summaries);
    await assert.rejects(content.content.resolveProductIds({ hostname: HOST, now: NOW, productIds: [PRODUCT] }), error => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
  }
});

test("an empty product list needs no review lookup", async () => {
  const f = fixture({ items: [], total: 0, nextOffset: null });
  assert.deepEqual(await f.catalog.queryPublicCatalog({ ...selection, categorySlug: null }), { items: [], total: 0, nextOffset: null });
  assert.equal(f.calls.some(call => call.text.includes("public_product_review_summaries")), false);
});

test("fifty independent homepage rows use bounded review batches rather than a lookup per row or product", async () => {
  const sections = Array.from({ length: 50 }, (_, index) => ({ ...presentation.sections[0], sectionId: `home_products_${index + 1}`, key: `home_products_${index + 1}`, limit: 12 }));
  const publicPresentation = { ...presentation, schemaVersion: 4, sections,
    visual: { ...presentation.visual, headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" },
    productDetail: { ...presentation.productDetail, showBreadcrumbs: true, showApprovedReviews: true, showSizeGuide: true, informationSections: ["description"] },
    footer: { tone: "dark", groups: [{ heading: "Mağaza", links: [{ label: "Ürünler", destination: "/products" }] }, { heading: "Hesap", links: [{ label: "Hesabım", destination: "/account" }] }], newsletter: { enabled: false, heading: "Haberler", body: "Yeni ürünler", consentLabel: "Onaylıyorum" }, social: [] },
  };
  const rows = sections.map(({ key }, row) => ({ key, items: Array.from({ length: 12 }, (_, index) => ({ ...product, id: `20000000-0000-4000-8000-${String(row * 12 + index + 1).padStart(12, "0")}` })) }));
  const f = fixture({ presentation: publicPresentation, productRows: rows }, (ids: string[]) => ({ enabled: true, items: ids.map(productId => ({ productId, averageRating: 0, reviewCount: 0 })) }));
  const result = await f.catalog.resolveCampaignHome({ storefront, now: NOW });
  assert.equal(result.productRows.flatMap(row => row.items).length, 600);
  const batches = f.calls.filter(call => call.text.includes("public_product_review_summaries"));
  assert.deepEqual(batches.map(call => (call.values[2] as string[]).length), [500, 100]);
  assert.deepEqual(result.productRows[49]?.items[11]?.reviewSummary, { averageRating: 0, reviewCount: 0 });
});
