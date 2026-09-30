import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { SeoRelatedLinks } from "@/components/SeoRelatedLinks";
import { SeoStructuredData } from "@/components/SeoStructuredData";
import { buildPublicSeoMetadata, effectivePublicSeo, buildBreadcrumbStructuredData } from "@/lib/public-seo.ts";
import { loadPublicResourceSeo } from "@/lib/public-seo-read.ts";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { buildPublicContentPageV2, legacyPolicyPageRoute } from "@/lib/content-page.ts";
import { publicContentSeo } from "@/lib/blog-page.ts";
import { selectContentLocale } from "@/lib/content-locale.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

export const dynamic = "force-dynamic";

async function page(slug: string, rawLang: unknown) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) notFound();
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getLocales || !runtime.content.getPageV2) throw new StorefrontUnavailableError();
  try {
    const now = new Date();
    const locales = await runtime.content.getLocales({ hostname: storefront.hostname, now });
    const locale = selectContentLocale(locales, rawLang);
    if (locale === null) throw new StorefrontContentRepositoryError("not_found");
    const source = await runtime.content.getPageV2({ hostname: storefront.hostname, now, slug, locale });
    const seoSelection = await loadPublicResourceSeo(runtime.seo, storefront.hostname, "page", source.id);
    return Object.freeze({ seoSelection, storefront, design, page: buildPublicContentPageV2(source, slug, locales.defaultLocale) });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && error.code === "not_found") {
      const legacy = legacyPolicyPageRoute(slug);
      if (legacy) permanentRedirect(legacy);
      notFound();
    }
    if (error instanceof StorefrontContentRepositoryError && error.code === "invalid_input") notFound();
    throw new StorefrontUnavailableError();
  }
}

export async function generateMetadata({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }>): Promise<Metadata> {
  const selected = await page((await params).slug, (await searchParams).lang);
  const seo = publicContentSeo(selected.page, selected.storefront.presentation.displayName);
  return buildPublicSeoMetadata({ storefront: selected.storefront, fallback: { ...seo, path: selected.page.route }, selection: selected.seoSelection });
}

export default async function ContentPage({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }>) {
  const selected = await page((await params).slug, (await searchParams).lang);
  const seo = effectivePublicSeo({ storefront: selected.storefront, fallback: { ...publicContentSeo(selected.page, selected.storefront.presentation.displayName), path: selected.page.route }, selection: selected.seoSelection });
  return (
    <StorefrontFrame storefront={selected.storefront} design={selected.design}>
      <SeoStructuredData value={buildBreadcrumbStructuredData(selected.storefront.canonicalUrl, [{ name: selected.storefront.presentation.displayName, path: "/" }, { name: selected.page.title, path: seo.path }])} />
      <article className="store-section store-container policy-page">
        <h1>{selected.page.title}</h1>
        <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: selected.page.html }} />
      </article>
      <SeoRelatedLinks links={selected.seoSelection?.links ?? []} locale={selected.page.locale} />
    </StorefrontFrame>
  );
}
