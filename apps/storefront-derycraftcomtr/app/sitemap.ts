import { MetadataRoute } from "next";
import { getAllPublishedContentPaths } from "@/lib/seo-content";
import { getRequestOrigin } from "@/lib/request-origin";
import { maybeListStorefrontProducts } from "@/lib/db/light-postgres-storefront-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildAbsoluteUrl(pathname: string, siteUrl: string) {
  try {
    return new URL(pathname, siteUrl).toString();
  } catch {
    return pathname;
  }
}

async function getProductSlugsForSitemap(): Promise<string[]> {
  try {
    const lightPostgresProducts = await maybeListStorefrontProducts();
    if (lightPostgresProducts !== undefined) {
      return lightPostgresProducts
        .map((product) => product.slug)
        .filter((slug): slug is string => typeof slug === "string" && slug.trim().length > 0);
    }
  } catch (error) {
    console.error("Sitemap light postgres products could not be loaded:", error);
  }

  return [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getRequestOrigin().catch(() => "https://derycraft.com.tr");

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/", siteUrl),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: buildAbsoluteUrl("/seo", siteUrl),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildAbsoluteUrl("/blog", siteUrl),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: buildAbsoluteUrl("/urunler", siteUrl),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.95,
    },
  ];

  let contentPaths: Awaited<ReturnType<typeof getAllPublishedContentPaths>> = [];
  let productSlugs: string[] = [];

  try {
    contentPaths = await getAllPublishedContentPaths();
  } catch (error) {
    console.error("Sitemap content paths could not be loaded:", error);
  }

  try {
    productSlugs = await getProductSlugsForSitemap();
  } catch (error) {
    console.error("Sitemap product slugs could not be loaded:", error);
  }

  const contentPages: MetadataRoute.Sitemap = contentPaths.map((item) => ({
    url: buildAbsoluteUrl(item.path, siteUrl),
    lastModified: new Date(item.lastmod),
    changeFrequency: item.path.includes("/seo/") ? "weekly" : "monthly",
    priority: item.path.split("/").length === 3 ? 0.8 : 0.7,
  }));

  const productPages: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: buildAbsoluteUrl(`/urunler/${slug}`, siteUrl),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  return [...staticPages, ...contentPages, ...productPages];
}
