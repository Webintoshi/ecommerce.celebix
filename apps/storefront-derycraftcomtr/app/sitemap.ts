import { MetadataRoute } from "next";
import { getAllPublishedContentPaths } from "@/lib/seo-content";
import { getRequestOrigin } from "@/lib/request-origin";

function buildAbsoluteUrl(pathname: string, siteUrl: string) {
  try {
    return new URL(pathname, siteUrl).toString();
  } catch {
    return pathname;
  }
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
  ];

  let contentPaths: Awaited<ReturnType<typeof getAllPublishedContentPaths>> = [];

  try {
    contentPaths = await getAllPublishedContentPaths();
  } catch (error) {
    console.error("Sitemap content paths could not be loaded:", error);
  }

  const contentPages: MetadataRoute.Sitemap = contentPaths.map((item) => ({
    url: buildAbsoluteUrl(item.path, siteUrl),
    lastModified: new Date(item.lastmod),
    changeFrequency: item.path.includes("/seo/") ? "weekly" : "monthly",
    priority: item.path.split("/").length === 3 ? 0.8 : 0.7,
  }));

  return [...staticPages, ...contentPages];
}
