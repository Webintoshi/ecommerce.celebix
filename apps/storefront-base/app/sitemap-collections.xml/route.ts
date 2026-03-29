import { createServerClient } from "@/lib/supabase";

export async function GET() {
    const baseUrl = 'https://ornek-magaza.celebix.co';

    const supabase = createServerClient();
    
    const { data: categories } = await supabase
        .from("categories")
        .select("slug, updated_at")
        .eq("is_active", true);

    const collectionUrls = categories?.map(cat => `
  <url>
    <loc>${baseUrl}/koleksiyon/${cat.slug}</loc>
    <lastmod>${new Date(cat.updated_at || new Date()).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('') || '';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${collectionUrls}
</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml',
        },
    });
}
