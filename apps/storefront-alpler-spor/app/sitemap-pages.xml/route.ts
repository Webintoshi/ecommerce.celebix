import { getRequestOrigin } from "@/lib/request-origin";

export async function GET() {
  const baseUrl = await getRequestOrigin();
  const lastMod = new Date().toISOString();

  const routes = ["", "/hakkimizda", "/iletisim", "/urunler", "/blog"];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${routes
    .map(
      (route) => `
  <url>
    <loc>${new URL(route || "/", baseUrl).toString()}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === "" ? 1.0 : 0.8}</priority>
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
