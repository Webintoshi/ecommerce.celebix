import { MetadataRoute } from "next";
import { getAllPublishedContentPaths } from "@/lib/seo-content";
import { getRequestOrigin } from "@/lib/request-origin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getRequestOrigin();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: new URL("/", siteUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: new URL("/seo", siteUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: new URL("/blog", siteUrl).toString(),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const contentPaths = await getAllPublishedContentPaths();

  const contentPages: MetadataRoute.Sitemap = contentPaths.map((path) => ({
    url: new URL(path.path, siteUrl).toString(),
    lastModified: new Date(path.lastmod),
    changeFrequency: path.path.includes("/seo/") ? "weekly" : "monthly",
    priority: path.path.split("/").length === 3 ? 0.8 : 0.7,
  }));

  return [...staticPages, ...contentPages];
}
