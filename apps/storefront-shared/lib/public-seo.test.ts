import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicSeoMetadata, buildProductStructuredData, buildArticleStructuredData, buildBreadcrumbStructuredData, serializeStructuredData, effectivePublicSeo, publicSeoPath } from "./public-seo.ts";

const storefront = { hostname: "shop.example.test", primaryHostname: "shop.example.test", canonicalUrl: "https://shop.example.test/", locale: "tr", presentation: { displayName: "Pilot", seo: { allowIndex: true, socialImage: { url: "https://media.example.test/store.webp" } } } };
const settings = { allowIndex: true, eligible: true, socialTitle: null, socialDescription: null, socialImageUrl: null, googleVerification: "google-value", bingVerification: "bing-value" };
const resource = { effectiveTitle: "Saved | Pilot", effectiveDescription: "Saved copy", effectiveCanonicalPath: "/urun/canonical", allowIndex: true, imageUrl: null };
const fallback = { title: "Visible | Pilot", description: "Visible copy", path: "/urun/original", imageUrl: "https://media.example.test/product.webp" };

test("resource overrides drive canonical, indexing and social metadata with one brand suffix", () => {
  const metadata = buildPublicSeoMetadata({ storefront, fallback, selection: { resource, settings, links: [] } });
  assert.deepEqual(metadata.title, { absolute: "Saved | Pilot" });
  assert.equal(metadata.description, "Saved copy");
  assert.deepEqual(metadata.alternates, { canonical: "https://shop.example.test/urun/canonical" });
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  assert.deepEqual(metadata.twitter, { card: "summary_large_image", title: "Saved | Pilot", description: "Saved copy", images: ["https://media.example.test/product.webp"] });
  assert.deepEqual(metadata.verification, { google: "google-value", other: { "msvalidate.01": "bing-value" } });
});

test("global noindex and ineligible or alias hosts cannot be overridden by a resource", () => {
  for (const selected of [{ ...settings, allowIndex: false }, { ...settings, eligible: false }]) {
    assert.equal(effectivePublicSeo({ storefront, fallback, selection: { resource, settings: selected, links: [] } }).allowIndex, false);
  }
  assert.equal(effectivePublicSeo({ storefront: { ...storefront, hostname: "alias.example.test" }, fallback, selection: { resource, settings, links: [] } }).allowIndex, false);
  assert.equal(effectivePublicSeo({ storefront, fallback, selection: { resource: { ...resource, allowIndex: false }, settings, links: [] } }).allowIndex, false);
});

test("social settings are used when no resource image exists and hostile canonicals fail closed", () => {
  const metadata = buildPublicSeoMetadata({ storefront, fallback: { ...fallback, imageUrl: null }, settings: { ...settings, socialTitle: "Social", socialDescription: "Social description", socialImageUrl: "https://media.example.test/social.webp" } });
  assert.deepEqual(metadata.twitter, { card: "summary_large_image", title: "Social", description: "Social description", images: ["https://media.example.test/social.webp"] });
  for (const path of ["//evil.test", "https://evil.test", "/account", "/urun/../account", "/urun/item?token=secret", "/urun/item#x", "/urun/x\\y", "/pages/x%0a"]) {
    assert.throws(() => effectivePublicSeo({ storefront, fallback, selection: { resource: { ...resource, effectiveCanonicalPath: path }, settings, links: [] } }), /public_seo_path_invalid/);
  }
  for (const path of ["/", "/urunler", "/products", "/kategori/takilar", "/categories/rings", "/pages/about?lang=en-US", "/blog/news"]) assert.equal(publicSeoPath(path), path);
});

const product = { id: "product-id", title: "Ring", currency: "TRY", priceCents: 12500, available: true, media: [{ url: "https://media.example.test/ring.webp" }], variants: [{ id: "one", sku: "RING-1", priceCents: 12500, available: true }, { id: "two", priceCents: 15000, available: false }], brand: { name: "Real brand" }, categoryPath: [{ name: "Takılar", slug: "takilar" }] };
test("Product offers expose each persisted variant price and stock without invented reviews", () => {
  const schema = buildProductStructuredData(product, "https://shop.example.test/urun/ring", "Saved copy");
  assert.equal(schema.name, "Ring");
  assert.deepEqual(schema.offers, [{ "@type": "Offer", url: "https://shop.example.test/urun/ring", priceCurrency: "TRY", price: "125.00", availability: "https://schema.org/InStock", sku: "RING-1" }, { "@type": "Offer", url: "https://shop.example.test/urun/ring", priceCurrency: "TRY", price: "150.00", availability: "https://schema.org/OutOfStock" }]);
  assert.equal("aggregateRating" in schema, false);
  assert.equal("review" in schema, false);
  assert.deepEqual(schema.brand, { "@type": "Brand", name: "Real brand" });
});
test("Article and breadcrumb use actual published dates and ordered resource paths", () => {
  const article = buildArticleStructuredData({ title: "News", publishedAt: "2026-09-29T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z" }, "https://shop.example.test/blog/news", "Summary", null);
  assert.equal(article.datePublished, "2026-09-29T12:00:00.000Z");
  assert.equal(article.dateModified, "2026-09-30T12:00:00.000Z");
  assert.equal("author" in article, false);
  assert.deepEqual(buildBreadcrumbStructuredData("https://shop.example.test/", [{ name: "Ana sayfa", path: "/" }, { name: "Takılar", path: "/kategori/takilar" }]).itemListElement, [{ "@type": "ListItem", position: 1, name: "Ana sayfa", item: "https://shop.example.test/" }, { "@type": "ListItem", position: 2, name: "Takılar", item: "https://shop.example.test/kategori/takilar" }]);
});
test("JSON-LD serialization cannot terminate its script element", () => {
  const dangerous = { text: '</script><script>alert("x")</script>&\u2028\u2029' };
  const serialized = serializeStructuredData(dangerous);
  assert.doesNotMatch(serialized, /<|>|&|\u2028|\u2029/);
  assert.deepEqual(JSON.parse(serialized), dangerous);
});

test("registered public reader failures cannot silently restore indexable fallback metadata", async () => {
  const { loadPublicResourceSeo } = await import("./public-seo-read.ts");
  assert.equal(await loadPublicResourceSeo(undefined, "shop.example.test", "product", "id"), null);
  await assert.rejects(loadPublicResourceSeo({ get: async () => { throw new Error("database unreachable"); } } as never, "shop.example.test", "product", "id"), /storefront_public_seo_unavailable/);
});

test("native body fallbacks keep existing Markdown normalization when no manual description exists", () => {
  const selected = effectivePublicSeo({ storefront, fallback: { ...fallback, description: "Soft cotton" }, selection: { resource: { ...resource, description: null, effectiveDescription: "**Soft** cotton" }, settings, links: [] } });
  assert.equal(selected.description, "Soft cotton");
});

test("resource sharing keeps its own SEO and product image when store social defaults exist", () => {
  const socialSettings = { ...settings, socialTitle: "Store sharing title", socialDescription: "Store sharing description", socialImageUrl: "https://media.example.test/social.webp" };
  const metadata = buildPublicSeoMetadata({ storefront, fallback, selection: { resource, settings: socialSettings, links: [] } });
  assert.deepEqual(metadata.twitter, { card: "summary_large_image", title: "Saved | Pilot", description: "Saved copy", images: ["https://media.example.test/product.webp"] });
  assert.deepEqual(metadata.openGraph, { title: "Saved | Pilot", description: "Saved copy", url: "https://shop.example.test/urun/canonical", type: "website", images: ["https://media.example.test/product.webp"] });
  const home = buildPublicSeoMetadata({ storefront, fallback: { title: "Homepage", description: "Homepage copy", path: "/" }, settings: socialSettings, suffixBrand: false });
  assert.deepEqual(home.twitter, { card: "summary_large_image", title: "Store sharing title", description: "Store sharing description", images: ["https://media.example.test/social.webp"] });
  assert.deepEqual(home.openGraph, { title: "Store sharing title", description: "Store sharing description", url: "https://shop.example.test/", type: "website", images: ["https://media.example.test/social.webp"] });
});
