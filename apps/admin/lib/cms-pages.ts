import type { CmsPage } from "@/types/cms";
import type { PageApiResponse, StaticPage, StaticPageStatus } from "@/types/page";

function resolveCmsStatus(page: StaticPage): StaticPageStatus {
  const status = page.geo_data?.cms?.status;

  if (status === "published" || status === "draft" || status === "archived") {
    return status;
  }

  return page.is_active ? "published" : "draft";
}

export function mapStaticPageToCmsPage(page: StaticPage): CmsPage {
  const status = resolveCmsStatus(page);

  return {
    id: page.id,
    title: page.name,
    slug: page.slug,
    content: page.geo_data?.cms?.content || "",
    status,
    metaTitle: page.seo_title || "",
    metaDescription: page.seo_description || "",
    updatedAt: new Date(page.updated_at),
    publishedAt: status === "published" ? new Date(page.updated_at) : undefined,
  };
}

export async function fetchCmsPages(): Promise<CmsPage[]> {
  const response = await fetch("/api/pages?include_inactive=1", {
    cache: "no-store",
  });

  const payload = await response.json() as PageApiResponse;
  if (!response.ok || !payload.success || !Array.isArray(payload.pages)) {
    throw new Error(payload.error || "Sayfalar yuklenemedi");
  }

  return payload.pages.map(mapStaticPageToCmsPage);
}

export async function fetchCmsPage(id: string): Promise<CmsPage | null> {
  const response = await fetch(`/api/pages?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  const payload = await response.json() as PageApiResponse;
  if (response.status === 404) {
    return null;
  }

  if (!response.ok || !payload.success || !payload.page) {
    throw new Error(payload.error || "Sayfa yuklenemedi");
  }

  return mapStaticPageToCmsPage(payload.page);
}
