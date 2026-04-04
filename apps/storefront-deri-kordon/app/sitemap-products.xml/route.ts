import { getAllProducts } from "@/lib/products";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { SUPPORTED_LOCALES, buildLocalizedPath } from "@/lib/i18n";

function buildUrl(pathname: string, locale: (typeof SUPPORTED_LOCALES)[number]) {
  return new URL(buildLocalizedPath(pathname, locale), STOREFRONT_RUNTIME.siteUrl).toString();
}

export async function GET() {
  const products = await getAllProducts();
  const lastMod = new Date().toISOString();

  const productUrls = SUPPORTED_LOCALES.flatMap((locale) =>
    products.map((product) => ({
      url: buildUrl(`/urunler/${product.slug}`, locale),
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
