import { SUPPORTED_LOCALES, buildLocalizedPath } from "@/lib/i18n";
import { getRequestOrigin } from "@/lib/request-origin";

function buildUrl(
  pathname: string,
  locale: (typeof SUPPORTED_LOCALES)[number],
  origin: string,
) {
  return new URL(buildLocalizedPath(pathname, locale), origin).toString();
}

export async function GET() {
  const requestOrigin = await getRequestOrigin();
  const lastMod = new Date().toISOString();
  const routes = ["", "/hakkimizda", "/iletisim", "/kurumsal-urunler", "/urunler", "/blog"];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${SUPPORTED_LOCALES.flatMap((locale) =>
    routes.map(
      (route) => `
  <url>
    <loc>${buildUrl(route || "/", locale, requestOrigin)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === "" ? 1.0 : 0.8}</priority>
  </url>`,
    ),
  ).join("")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
