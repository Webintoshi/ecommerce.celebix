import { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deri-kordon.test";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Genel kurallar - tÃ¼m botlar iÃ§in
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 2,
      },
      
      // OpenAI botlarÄ±
      {
        userAgent: "GPTBot",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/", "/sepet/", "/odeme/"],
        crawlDelay: 5,
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/", "/sepet/", "/odeme/"],
        crawlDelay: 5,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      
      // Anthropic botlarÄ±
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/", "/sepet/", "/odeme/"],
        crawlDelay: 5,
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      
      // Google AI botlarÄ±
      {
        userAgent: "Google-Extended",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      {
        userAgent: "GoogleOther",
        allow: ["/", "/urunler/", "/koleksiyon/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      
      // Perplexity
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      
      // Common Crawl (birÃ§ok AI tarafÄ±ndan kullanÄ±lÄ±r)
      {
        userAgent: "CCBot",
        allow: ["/", "/urunler/", "/koleksiyon/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
      
      // DiÄŸer AI/Data botlarÄ±
      {
        userAgent: "Diffbot",
        allow: ["/", "/urunler/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
      {
        userAgent: "Cohere-ai",
        allow: ["/", "/urunler/", "/koleksiyon/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      {
        userAgent: "ImagesiftBot",
        allow: ["/"],
        disallow: ["/admin/", "/api/"],
        crawlDelay: 10,
      },
      {
        userAgent: "Meta-ExternalAgent",
        allow: ["/", "/urunler/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
      {
        userAgent: "FacebookBot",
        allow: ["/"],
        disallow: ["/admin/", "/api/"],
        crawlDelay: 10,
      },
      {
        userAgent: "PetalBot",
        allow: ["/", "/urunler/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
      {
        userAgent: "YouBot",
        allow: ["/", "/urunler/"],
        disallow: ["/admin/", "/api/"],
        crawlDelay: 10,
      },
      
      // Arama motorlarÄ± (daha hÄ±zlÄ± tarama)
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 1,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 1,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

