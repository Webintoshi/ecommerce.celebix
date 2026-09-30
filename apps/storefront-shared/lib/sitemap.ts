import type { PublicSitemapEntry, PublicSitemapShard } from "@celebix/saas-data";

const PATH = /^(?:\/|\/(?:urunler|products|blog)|\/(?:pages|blog|urun|products|kategori|categories)\/[a-z0-9]+(?:-[a-z0-9]+)*)(?:\?lang=[a-z]{2,3}(?:-[A-Z]{2})?)?$/;
const FREQUENCIES = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function origin(canonicalUrl: string): string {
  const selected = new URL(canonicalUrl);
  if (selected.protocol !== "https:" || selected.username || selected.password || selected.pathname !== "/" || selected.search || selected.hash) throw new TypeError("sitemap_origin_invalid");
  return selected.origin;
}

export function renderSitemapIndex(canonicalUrl: string, shards: readonly PublicSitemapShard[]): string {
  const base = origin(canonicalUrl);
  if (shards.length > 10_000 || new Set(shards.map(({ kind, page }) => `${kind}:${page}`)).size !== shards.length) throw new TypeError("sitemap_index_invalid");
  const entries = shards.map(({ kind, page }) => {
    if (kind !== "products" && kind !== "content" || !Number.isSafeInteger(page) || page < 0 || page >= 10_000) throw new TypeError("sitemap_index_invalid");
    return `<sitemap><loc>${xml(`${base}/sitemaps/${kind}/${page}`)}</loc></sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.join("")}</sitemapindex>`;
}

export function renderSitemapPage(canonicalUrl: string, entries: readonly PublicSitemapEntry[]): string {
  const base = origin(canonicalUrl);
  if (entries.length > 1000 || new Set(entries.map(({ path }) => path)).size !== entries.length) throw new TypeError("sitemap_page_invalid");
  const nodes = entries.map(({ path, updatedAt, changeFrequency }) => {
    if (!PATH.test(path) || !FREQUENCIES.has(changeFrequency) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) || new Date(updatedAt).toISOString() !== updatedAt) throw new TypeError("sitemap_page_invalid");
    return `<url><loc>${xml(`${base}${path}`)}</loc><lastmod>${xml(updatedAt)}</lastmod><changefreq>${xml(changeFrequency)}</changefreq></url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes.join("")}</urlset>`;
}
