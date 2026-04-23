import {
  getManagedContentPageDefinition,
  isManagedContentPageSlug,
  type ManagedContentPageSlug,
} from "@celebix/platform-config";
import {
  extractPlainTextFromProductDescription,
  normalizeProductDescriptionHtml,
} from "@celebix/platform-config/src/product-description-rich-text";
import { createServerClient } from "@/lib/supabase";
import type { PageGEO, StaticPage } from "@/types/page";

export type PublishedManagedContentPage = {
  id: string;
  slug: ManagedContentPageSlug;
  name: string;
  contentHtml: string;
  plainText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
};

function extractCmsState(geoData: PageGEO | null | undefined) {
  const cms = geoData?.cms;
  const content = typeof cms?.content === "string" ? cms.content.trim() : "";
  const status = cms?.status;

  return {
    content,
    status,
  };
}

function isPublishedManagedContentPage(
  page: StaticPage,
): page is StaticPage & { slug: ManagedContentPageSlug } {
  if (!isManagedContentPageSlug(page.slug) || page.is_active !== true) {
    return false;
  }

  const cmsState = extractCmsState(page.geo_data);
  return cmsState.status === "published" && cmsState.content.length > 0;
}

export async function getPublishedManagedContentPage(
  slug: ManagedContentPageSlug,
): Promise<PublishedManagedContentPage | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load managed content page:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const page = data as StaticPage;
  if (!isPublishedManagedContentPage(page)) {
    return null;
  }

  const definition = getManagedContentPageDefinition(slug);
  const cmsState = extractCmsState(page.geo_data);
  const contentHtml = normalizeProductDescriptionHtml(cmsState.content);

  return {
    id: page.id,
    slug,
    name: definition?.name || page.name,
    contentHtml,
    plainText: extractPlainTextFromProductDescription(contentHtml),
    seoTitle: page.seo_title,
    seoDescription: page.seo_description,
    updatedAt: page.updated_at,
  };
}
