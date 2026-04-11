import type { CmsPage } from "@/types/cms";
import type { PageApiResponse, StaticPage, StaticPageStatus } from "@/types/page";
import { isPolicyPageSlug } from "@celebix/platform-config/src/policy-pages";

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

type FetchCmsPagesOptions = {
  includePolicyPages?: boolean;
};

export async function fetchCmsPages(
  options: FetchCmsPagesOptions = {},
): Promise<CmsPage[]> {
  const response = await fetch("/api/pages?include_inactive=1", {
    cache: "no-store",
  });

  const payload = await response.json() as PageApiResponse;
  if (!response.ok || !payload.success || !Array.isArray(payload.pages)) {
    throw new Error(payload.error || "Sayfalar yuklenemedi");
  }

  const pages = payload.pages.map(mapStaticPageToCmsPage);

  if (options.includePolicyPages) {
    return pages;
  }

  return pages.filter((page) => !isPolicyPageSlug(page.slug));
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

export async function fetchCmsPageBySlug(slug: string): Promise<CmsPage | null> {
  const response = await fetch(
    `/api/pages?slug=${encodeURIComponent(slug)}&include_inactive=1`,
    {
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as PageApiResponse;
  if (response.status === 404) {
    return null;
  }

  if (!response.ok || !payload.success || !payload.page) {
    throw new Error(payload.error || "Sayfa yuklenemedi");
  }

  return mapStaticPageToCmsPage(payload.page);
}
