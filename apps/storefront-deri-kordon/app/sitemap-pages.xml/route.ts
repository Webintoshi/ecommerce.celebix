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
  const lastMod = new Date().toISOString();
  const routes = [
    { path: "/", changeFrequency: "daily", priority: 1.0 },
    { path: "/hakkimizda", changeFrequency: "monthly", priority: 0.7 },
    { path: "/magazalarimiz", changeFrequency: "monthly", priority: 0.7 },
    { path: "/iletisim", changeFrequency: "monthly", priority: 0.6 },
    { path: "/kurumsal-urunler", changeFrequency: "monthly", priority: 0.7 },
    { path: "/urunler", changeFrequency: "weekly", priority: 0.9 },
    { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
    { path: "/sss", changeFrequency: "monthly", priority: 0.6 },
  ] as const;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${INDEXABLE_LOCALES.flatMap((locale) =>
    routes.map(
      (route) => `
  <url>
    <loc>${buildUrl(route.path, locale, requestOrigin)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>${route.changeFrequency}</changefreq>
    <priority>${route.priority}</priority>
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
