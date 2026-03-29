import { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ornek-magaza.celebix.co";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Genel kurallar - tüm botlar için
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 2,
      },
      
      // OpenAI botları
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
      
      // Anthropic botları
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
      
      // Google AI botları
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
      
      // Common Crawl (birçok AI tarafından kullanılır)
      {
        userAgent: "CCBot",
        allow: ["/", "/urunler/", "/koleksiyon/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
      
      // Diğer AI/Data botları
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
      
      // Arama motorları (daha hızlı tarama)
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
