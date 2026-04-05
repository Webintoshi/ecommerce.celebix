import { MetadataRoute } from "next";
import { getRequestOrigin } from "@/lib/request-origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getRequestOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 2,
      },
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
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/urunler/", "/koleksiyon/", "/blog/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 5,
      },
      {
        userAgent: "CCBot",
        allow: ["/", "/urunler/", "/koleksiyon/"],
        disallow: ["/admin/", "/api/", "/giris/", "/kayit/"],
        crawlDelay: 10,
      },
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
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
