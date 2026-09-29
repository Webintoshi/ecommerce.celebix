import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { blogIndexPath, contentPath, selectContentLocale } from "@/lib/content-locale.ts";
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
    return Object.freeze({ storefront, design, locales, locale, list });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
    throw new StorefrontUnavailableError();
  }
}

type Params = Readonly<{ searchParams: Promise<{ lang?: string | string[]; cursor?: string | string[] }> }>;
export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const query = await searchParams;
  const selected = await listing(query.lang, query.cursor);
  const title = `Blog | ${selected.storefront.presentation.displayName}`;
  return { title: { absolute: title }, description: `${selected.storefront.presentation.displayName} blog yazıları`, robots: { index: selected.storefront.presentation.seo.allowIndex, follow: selected.storefront.presentation.seo.allowIndex }, alternates: { canonical: new URL(blogIndexPath(selected.locale, selected.locales.defaultLocale), selected.storefront.canonicalUrl).toString() } };
}

export default async function BlogIndex({ searchParams }: Params) {
  const query = await searchParams;
  const selected = await listing(query.lang, query.cursor);
  return <StorefrontFrame storefront={selected.storefront} design={selected.design}><section className="store-section store-container policy-page"><h1>Blog</h1>{selected.list.items.length ? <div className="blog-list">{selected.list.items.map((item) => <article key={item.id}><h2><Link href={contentPath("blog_post", item.slug, item.locale, selected.locales.defaultLocale)}>{item.title}</Link></h2>{item.excerpt ? <p>{item.excerpt}</p> : null}</article>)}</div> : <p>Henüz yayınlanmış yazı bulunmuyor.</p>}{selected.list.nextCursor ? <Link href={blogIndexPath(selected.locale, selected.locales.defaultLocale, selected.list.nextCursor)}>Daha fazla yazı</Link> : null}</section></StorefrontFrame>;
}
