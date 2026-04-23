import { createServerClient } from "@/lib/supabase";
import { getRequestOrigin } from "@/lib/request-origin";

export async function GET() {
  const baseUrl = await getRequestOrigin();
  const supabase = createServerClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, updated_at")
    .eq("is_active", true);

  const collectionUrls =
    categories
      ?.map(
        (category) => `
  <url>
    <loc>${new URL(`/${category.slug}`, baseUrl).toString()}</loc>
    <lastmod>${new Date(category.updated_at || new Date()).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
      )
      .join("") || "";

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
