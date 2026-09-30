import type { Metadata } from "next";
import { resolveProductSeo } from "./product-seo.ts";

// This projection keeps public V1 product/content contracts unchanged.
export type PublicSeoSettings = Readonly<{ allowIndex: boolean; eligible: boolean; socialTitle: string | null; socialDescription: string | null; socialImageUrl: string | null; googleVerification: string | null; bingVerification: string | null }>;
export type PublicSeoSelection = Readonly<{ resource: Readonly<{ effectiveTitle: string; description?: string | null; effectiveDescription: string; effectiveCanonicalPath: string; allowIndex: boolean; imageUrl: string | null }>; settings: PublicSeoSettings; links: readonly Readonly<{ anchorText: string; path: string }>[] }>;
type StorefrontSeoSource = Readonly<{ hostname: string; primaryHostname: string; canonicalUrl: string; presentation: Readonly<{ displayName: string; seo: Readonly<{ allowIndex: boolean; socialImage?: Readonly<{ url: string }> }> }> }>;
type SeoInput = Readonly<{ storefront: StorefrontSeoSource; fallback: Readonly<{ title: string; description: string; path: string; imageUrl?: string | null }>; selection?: PublicSeoSelection | null; settings?: PublicSeoSettings | null; suffixBrand?: boolean }>;

export function publicSeoPath(path: string): string {
  if (typeof path !== "string" || path.length > 500 || !/^(?:\/|\/(?:urunler|products|blog)|\/(?:pages|blog|urun|products|kategori|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\?lang=[a-z]{2,3}(?:-[A-Z]{2})?)?$/.test(path)) throw new TypeError("public_seo_path_invalid");
  return path;
}
function baseOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new TypeError("public_seo_origin_invalid");
  return url.origin;
}
function imageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
function plain(raw: string | null | undefined): string {
  return resolveProductSeo({ title: raw ?? "", seoDescription: raw ?? "" }, "").title;
}
export function effectivePublicSeo({ storefront, fallback, selection, settings: supplied, suffixBrand = true }: SeoInput) {
  const settings = selection?.settings ?? supplied;
  const resource = selection?.resource;
  const path = publicSeoPath(resource?.effectiveCanonicalPath ?? fallback.path);
  const seo = resolveProductSeo({ title: fallback.title, seoTitle: resource?.effectiveTitle, seoDescription: resource?.description === null ? fallback.description : resource?.effectiveDescription || fallback.description }, suffixBrand ? storefront.presentation.displayName : "");
  const canonical = `${baseOrigin(storefront.canonicalUrl)}${path}`;
  const allowIndex = storefront.hostname === storefront.primaryHostname && (settings ? settings.eligible && settings.allowIndex : storefront.presentation.seo.allowIndex) && (resource?.allowIndex ?? true);
  const image = imageUrl(resource?.imageUrl) ?? imageUrl(fallback.imageUrl) ?? imageUrl(settings?.socialImageUrl) ?? imageUrl(storefront.presentation.seo.socialImage?.url);
  return Object.freeze({ ...seo, path, canonical, allowIndex, image, settings });
}
export function buildPublicSeoMetadata(input: SeoInput): Metadata {
  const seo = effectivePublicSeo(input);
  const images = seo.image ? [seo.image] : [];
  const socialTitle = input.selection ? seo.title : plain(seo.settings?.socialTitle) || seo.title;
  const socialDescription = input.selection ? seo.description : plain(seo.settings?.socialDescription) || seo.description;
  return {
    title: { absolute: seo.title }, description: seo.description,
    robots: { index: seo.allowIndex, follow: seo.allowIndex }, alternates: { canonical: seo.canonical },
    twitter: { card: images.length ? "summary_large_image" : "summary", title: socialTitle, description: socialDescription, images },
    openGraph: { title: socialTitle, description: socialDescription, url: seo.canonical, type: "website", images },
    ...(seo.settings ? { verification: { ...(seo.settings.googleVerification ? { google: seo.settings.googleVerification } : {}), ...(seo.settings.bingVerification ? { other: { "msvalidate.01": seo.settings.bingVerification } } : {}) } } : {}),
  };
}

export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
type SchemaProduct = Readonly<{ title: string; currency: string; priceCents: number; available: boolean; media: readonly Readonly<{ url: string }>[]; variants: readonly Readonly<{ priceCents: number; available: boolean; sku?: string }>[]; brand?: Readonly<{ name: string }> }>;
export function buildProductStructuredData(product: SchemaProduct, canonical: string, description: string) {
  const variants = product.variants.length ? product.variants : [{ priceCents: product.priceCents, available: product.available }];
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": `${canonical}#product`, name: plain(product.title), description: plain(description), url: canonical,
    ...(product.media.length ? { image: product.media.map(({ url }) => imageUrl(url)).filter((url): url is string => url !== null) } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: plain(product.brand.name) } } : {}),
    offers: variants.map((variant) => ({ "@type": "Offer", url: canonical, priceCurrency: product.currency, price: (variant.priceCents / 100).toFixed(2), availability: `https://schema.org/${variant.available ? "InStock" : "OutOfStock"}`, ...(variant.sku ? { sku: variant.sku } : {}) })),
  };
}
export function buildBreadcrumbStructuredData(canonicalUrl: string, entries: readonly Readonly<{ name: string; path: string }>[]) {
  const origin = baseOrigin(canonicalUrl);
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: entries.map((entry, index) => ({ "@type": "ListItem", position: index + 1, name: plain(entry.name), item: `${origin}${publicSeoPath(entry.path)}` })) };
}
export function buildArticleStructuredData(article: Readonly<{ title: string; publishedAt: string | null; updatedAt: string }>, canonical: string, description: string, image: string | null) {
  return { "@context": "https://schema.org", "@type": "Article", "@id": `${canonical}#article`, headline: plain(article.title), description: plain(description), mainEntityOfPage: canonical, ...(article.publishedAt ? { datePublished: article.publishedAt } : {}), dateModified: article.updatedAt, ...(imageUrl(image) ? { image: [imageUrl(image)] } : {}) };
}
