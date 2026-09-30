import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { SeoRelatedLinks } from "@/components/SeoRelatedLinks";
import { SeoStructuredData } from "@/components/SeoStructuredData";
import { buildPublicSeoMetadata, effectivePublicSeo, buildBreadcrumbStructuredData, buildArticleStructuredData } from "@/lib/public-seo.ts";
import { loadPublicResourceSeo } from "@/lib/public-seo-read.ts";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { buildPublicBlogPage, publicContentSeo } from "@/lib/blog-page.ts";
import { selectContentLocale } from "@/lib/content-locale.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

export const dynamic = "force-dynamic";

async function article(slug: string, rawLang: unknown) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) notFound();
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getLocales || !runtime.content.getBlogPost) throw new StorefrontUnavailableError();
  try {
    const now = new Date();
    const locales = await runtime.content.getLocales({ hostname: storefront.hostname, now });
    const locale = selectContentLocale(locales, rawLang);
    if (locale === null) throw new StorefrontContentRepositoryError("not_found");
    const source = await runtime.content.getBlogPost({ hostname: storefront.hostname, now, slug, locale });
    const seoSelection = await loadPublicResourceSeo(runtime.seo, storefront.hostname, "blog", source.id);
    return Object.freeze({ seoSelection, storefront, design, page: buildPublicBlogPage(source, slug, locales.defaultLocale) });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
    throw new StorefrontUnavailableError();
  }
}

type Params = Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }>;
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const selected = await article((await params).slug, (await searchParams).lang);
  const seo = publicContentSeo(selected.page, selected.storefront.presentation.displayName);
  return buildPublicSeoMetadata({ storefront: selected.storefront, fallback: { ...seo, path: selected.page.route }, selection: selected.seoSelection });
}

export default async function BlogDetail({ params, searchParams }: Params) {
  const selected = await article((await params).slug, (await searchParams).lang);
  const seo = effectivePublicSeo({ storefront: selected.storefront, fallback: { ...publicContentSeo(selected.page, selected.storefront.presentation.displayName), path: selected.page.route }, selection: selected.seoSelection });
  return (
    <StorefrontFrame storefront={selected.storefront} design={selected.design}>
      <SeoStructuredData value={buildBreadcrumbStructuredData(selected.storefront.canonicalUrl, [{ name: selected.storefront.presentation.displayName, path: "/" }, { name: selected.page.title, path: seo.path }])} />
      <SeoStructuredData value={buildArticleStructuredData(selected.page, seo.canonical, seo.description, selected.seoSelection?.resource.imageUrl ?? null)} />
      <article className="store-section store-container policy-page">
        <h1>{selected.page.title}</h1>
        <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: selected.page.html }} />
      </article>
      <SeoRelatedLinks links={selected.seoSelection?.links ?? []} locale={selected.page.locale} />
    </StorefrontFrame>
  );
}
