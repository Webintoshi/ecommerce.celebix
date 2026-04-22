import { getAllProducts } from "@/lib/products";
import { INDEXABLE_LOCALES, buildLocalizedPath } from "@/lib/i18n";
import { getRequestOrigin } from "@/lib/request-origin";

function buildUrl(
  pathname: string,
  locale: (typeof INDEXABLE_LOCALES)[number],
  origin: string,
) {
  return new URL(buildLocalizedPath(pathname, locale), origin).toString();
}

export async function GET() {
  const requestOrigin = await getRequestOrigin();
  const products = await getAllProducts().catch(() => []);
  const lastMod = new Date().toISOString();

  const productUrls = INDEXABLE_LOCALES.flatMap((locale) =>
    products.map((product) => ({
      url: buildUrl(`/urunler/${product.slug}`, locale, requestOrigin),
      lastMod,
    })),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${productUrls
    .map(
      (item) => `
  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`,
    )
    .join("")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
