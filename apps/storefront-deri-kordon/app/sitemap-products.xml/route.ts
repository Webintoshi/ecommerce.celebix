import { getAllProducts } from '@/lib/products';

export async function GET() {
    const baseUrl = 'https://deri-kordon.test';
    const products = await getAllProducts();
    const lastMod = new Date().toISOString();

    const productUrls = products.map((product) => ({
        url: `${baseUrl}/urunler/${product.slug}`,
        lastMod,
    }));

    // Categories could also be here or in pages
    const categories = ['fistik-ezmesi', 'findik-ezmesi', 'kuruyemis'];
    const categoryUrls = categories.map((cat) => ({
        url: `${baseUrl}/urunler/kategori/${cat}`,
        lastMod,
    }));

    const allUrls = [...categoryUrls, ...productUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${allUrls
            .map((item) => {
                return `
  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
            })
            .join('')}
</urlset>`;

    return new Response(xml, {
        headers: {
            'Content-Type': 'application/xml',
        },
    });
}

