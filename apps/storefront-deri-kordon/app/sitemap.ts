import { MetadataRoute } from "next";
import { getAllPublishedContentPaths } from "@/lib/seo-content";
import { SUPPORTED_LOCALES, buildLocalizedPath } from "@/lib/i18n";
import { getRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

function buildUrl(
  pathname: string,
  locale: (typeof SUPPORTED_LOCALES)[number],
  origin: string,
) {
  return new URL(buildLocalizedPath(pathname, locale), origin).toString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestOrigin = await getRequestOrigin();
  const staticRoutes = ["/", "/seo", "/blog", "/urunler", "/iletisim", "/kurumsal-urunler"];

  const staticPages: MetadataRoute.Sitemap = SUPPORTED_LOCALES.flatMap((locale) =>
    staticRoutes.map((route, index) => ({
      url: buildUrl(route, locale, requestOrigin),
      lastModified: new Date(),
      changeFrequency: route === "/" ? "daily" : "weekly",
      priority: index === 0 ? 1 : 0.8,
    })),
  );

  const contentPaths = await getAllPublishedContentPaths();

  const contentPages: MetadataRoute.Sitemap = SUPPORTED_LOCALES.flatMap((locale) =>
    contentPaths.map((path) => ({
      url: buildUrl(path.path, locale, requestOrigin),
      lastModified: new Date(path.lastmod),
      changeFrequency: path.path.includes("/seo/") ? ("weekly" as const) : ("monthly" as const),
      priority: path.path.split("/").length === 3 ? 0.8 : 0.7,
    })),
  );

  return [...staticPages, ...contentPages];
}
