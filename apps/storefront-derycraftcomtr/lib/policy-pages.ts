import {
  POLICY_PAGE_DEFINITIONS,
  getPolicyPageDefinition,
  getPolicyPageLabel,
  isPolicyPageSlug,
  type PolicyPageSlug,
} from "@celebix/platform-config";
import type { StorefrontLocale } from "@/lib/i18n";
import { createServerClient } from "@/lib/supabase";
import {
  maybeGetStorefrontPageBySlug,
  maybeListStorefrontPages,
} from "@/lib/db/light-postgres-storefront-read";
import type { PageGEO, StaticPage } from "@/types/page";

export type PolicyFooterLink = {
  slug: PolicyPageSlug;
  href: `/${PolicyPageSlug}`;
  label: string;
};

export type PublishedPolicyPage = {
  id: string;
  slug: PolicyPageSlug;
  name: string;
  content: string;
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

function isPublishedPolicyPage(page: StaticPage): page is StaticPage & { slug: PolicyPageSlug } {
  if (!isPolicyPageSlug(page.slug) || page.is_active !== true) {
    return false;
  }

  const cmsState = extractCmsState(page.geo_data);
  return cmsState.status === "published" && cmsState.content.length > 0;
}

export async function getPublishedPolicyLinks(
  locale: StorefrontLocale,
): Promise<PolicyFooterLink[]> {
  const lightPostgresPages = await maybeListStorefrontPages();
  if (lightPostgresPages !== undefined) {
    const slugs = POLICY_PAGE_DEFINITIONS.map((definition) => definition.slug);
    const published = lightPostgresPages
      .filter((page) => slugs.includes(page.slug as PolicyPageSlug))
      .filter((page) => isPublishedPolicyPage(page as StaticPage)) as Array<StaticPage & { slug: PolicyPageSlug }>;

    return POLICY_PAGE_DEFINITIONS
      .filter((definition) => published.some((page) => page.slug === definition.slug))
      .map((definition) => ({
        slug: definition.slug,
        href: `/${definition.slug}` as const,
        label: getPolicyPageLabel(definition.slug, locale),
      }));
  }

  const supabase = createServerClient();
  const slugs = POLICY_PAGE_DEFINITIONS.map((definition) => definition.slug);
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .in("slug", slugs)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load published policy links:", error);
    return [];
  }

  const pages = Array.isArray(data) ? (data as StaticPage[]) : [];
  const published = pages.filter(isPublishedPolicyPage);

  return POLICY_PAGE_DEFINITIONS
    .filter((definition) => published.some((page) => page.slug === definition.slug))
    .map((definition) => ({
      slug: definition.slug,
      href: `/${definition.slug}` as const,
      label: getPolicyPageLabel(definition.slug, locale),
    }));
}

export async function getPublishedPolicyPage(
  slug: PolicyPageSlug,
): Promise<PublishedPolicyPage | null> {
  const lightPostgresPage = await maybeGetStorefrontPageBySlug(slug);
  if (lightPostgresPage !== undefined) {
    if (!lightPostgresPage) {
      return null;
    }

    const page = lightPostgresPage as StaticPage;
    if (!isPublishedPolicyPage(page)) {
      return null;
    }

    const cmsState = extractCmsState(page.geo_data);
    return {
      id: page.id,
      slug,
      name: getPolicyPageDefinition(slug)?.name || page.name,
      content: cmsState.content,
      seoTitle: page.seo_title,
      seoDescription: page.seo_description,
      updatedAt: page.updated_at,
    };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Failed to load published policy page:", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const page = data as StaticPage;
  if (!isPublishedPolicyPage(page)) {
    return null;
  }

  const cmsState = extractCmsState(page.geo_data);
  return {
    id: page.id,
    slug,
    name: getPolicyPageDefinition(slug)?.name || page.name,
    content: cmsState.content,
    seoTitle: page.seo_title,
    seoDescription: page.seo_description,
    updatedAt: page.updated_at,
  };
}
