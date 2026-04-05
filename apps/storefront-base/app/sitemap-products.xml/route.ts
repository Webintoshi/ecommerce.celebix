import { getAllProducts } from "@/lib/products";
import { getRequestOrigin } from "@/lib/request-origin";

export async function GET() {
  const baseUrl = await getRequestOrigin();
  const products = await getAllProducts();
  const lastMod = new Date().toISOString();

  const productUrls = products.map((product) => ({
    url: new URL(`/urunler/${product.slug}`, baseUrl).toString(),
    lastMod,
  }));

  const categories = ["fistik-ezmesi", "findik-ezmesi", "kuruyemis"];
  const categoryUrls = categories.map((category) => ({
    url: new URL(`/urunler/kategori/${category}`, baseUrl).toString(),
    lastMod,
  }));

  const allUrls = [...categoryUrls, ...productUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allUrls
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
