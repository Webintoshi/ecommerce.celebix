import { createServerClient } from "@/lib/supabase";
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
  const supabase = createServerClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, updated_at")
    .eq("is_active", true);

  const collectionUrls =
    SUPPORTED_LOCALES.flatMap((locale) =>
      (categories || []).map(
        (category) => `
  <url>
    <loc>${buildUrl(`/${category.slug}`, locale, requestOrigin)}</loc>
    <lastmod>${new Date(category.updated_at || new Date()).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      ),
    ).join("") || "";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${collectionUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
