import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { blogIndexPath, contentPath, selectContentLocale } from "@/lib/content-locale.ts";
import { buildPublicBlogLanding, publicContentSeo } from "@/lib/blog-page.ts";
import { buildPublicSeoMetadata } from "@/lib/public-seo.ts";
import { loadPublicResourceSeo, loadPublicSeoSettings } from "@/lib/public-seo-read.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

export const dynamic = "force-dynamic";

async function listing(rawLang: unknown, rawCursor: unknown) {
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getLocales || !runtime.content.listBlogPosts) throw new StorefrontUnavailableError();
  try {
    const now = new Date();
    const locales = await runtime.content.getLocales({ hostname: storefront.hostname, now });
    const locale = selectContentLocale(locales, rawLang);
    if (locale === null || rawCursor !== undefined && typeof rawCursor !== "string") throw new StorefrontContentRepositoryError("not_found");
    const list = await runtime.content.listBlogPosts({ hostname: storefront.hostname, now, locale, limit: 20, ...(rawCursor ? { cursor: rawCursor } : {}) });
    let landing: ReturnType<typeof buildPublicBlogLanding> | null = null;
    if (runtime.content.getRequiredPage) {
      try {
        const source = await runtime.content.getRequiredPage({ hostname: storefront.hostname, now, key: "blog", locale });
        if (source.kind !== "page" || source.requiredPageKey !== "blog" || source.locale !== locale) throw new StorefrontUnavailableError();
        if (source.publishedAt !== null) landing = buildPublicBlogLanding(source, locales.defaultLocale);
      } catch (error) {
        if (!(error instanceof StorefrontContentRepositoryError && error.code === "not_found")) throw error;
      }
    }
    const seoSelection = landing ? await loadPublicResourceSeo(runtime.seo, storefront.hostname, "page", landing.id) : null;
    const seoSettings = seoSelection?.settings ?? await loadPublicSeoSettings(runtime.seo, storefront.hostname);
    return Object.freeze({ storefront, design, locales, locale, list, landing, seoSelection, seoSettings });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
    throw new StorefrontUnavailableError();
  }
}

type Params = Readonly<{ searchParams: Promise<{ lang?: string | string[]; cursor?: string | string[] }> }>;
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const query = await searchParams;
  const selected = await listing(query.lang, query.cursor);
  const brand = selected.storefront.presentation.displayName;
  const seo = selected.landing ? publicContentSeo(selected.landing, brand) : { title: `Blog | ${brand}`, description: `${brand} blog yazıları` };
  return buildPublicSeoMetadata({ storefront: selected.storefront, fallback: { ...seo, path: blogIndexPath(selected.locale, selected.locales.defaultLocale) }, selection: selected.seoSelection, settings: selected.seoSettings });
}

export default async function BlogIndex({ searchParams }: Params) {
  const query = await searchParams;
  const selected = await listing(query.lang, query.cursor);
  return <StorefrontFrame storefront={selected.storefront} design={selected.design}><section className="store-section store-container policy-page"><h1>{selected.landing?.title ?? "Blog"}</h1>{selected.landing?.html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: selected.landing.html }} /> : null}{selected.list.items.length ? <div className="blog-list">{selected.list.items.map((item) => <article key={item.id}><h2><Link href={contentPath("blog_post", item.slug, item.locale, selected.locales.defaultLocale)}>{item.title}</Link></h2>{item.excerpt ? <p>{item.excerpt}</p> : null}</article>)}</div> : <p>Henüz yayınlanmış yazı bulunmuyor.</p>}{selected.list.nextCursor ? <Link href={blogIndexPath(selected.locale, selected.locales.defaultLocale, selected.list.nextCursor)}>Daha fazla yazı</Link> : null}</section></StorefrontFrame>;
}
