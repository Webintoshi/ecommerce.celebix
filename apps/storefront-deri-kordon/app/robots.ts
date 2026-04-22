import { MetadataRoute } from "next";
import { getRequestOrigin } from "@/lib/request-origin";

const PRIVATE_DISALLOW_PATHS = [
  "/admin/",
  "/api/",
  "/favoriler/",
  "/giris/",
  "/hesap/",
  "/kayit/",
  "/odeme/",
  "/sans-carki/",
  "/sepet/",
  "/sifre-yenile/",
  "/sifremi-unuttum/",
  "/siparisler/",
] as const;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getRequestOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 2,
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "ClaudeBot",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "anthropic-ai",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "GoogleOther",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/urunler/", "/blog/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "CCBot",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "Diffbot",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "Cohere-ai",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 5,
      },
      {
        userAgent: "ImagesiftBot",
        allow: ["/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "Meta-ExternalAgent",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "FacebookBot",
        allow: ["/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "PetalBot",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "YouBot",
        allow: ["/", "/urunler/"],
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 10,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 1,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: PRIVATE_DISALLOW_PATHS,
        crawlDelay: 1,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
