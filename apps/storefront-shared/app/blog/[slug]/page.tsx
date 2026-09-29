import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
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
    return Object.freeze({ storefront, design, page: buildPublicBlogPage(source, slug, locales.defaultLocale) });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
    throw new StorefrontUnavailableError();
  }
}

type Params = Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string | string[] }> }>;
export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const selected = await article((await params).slug, (await searchParams).lang);
  const seo = publicContentSeo(selected.page, selected.storefront.presentation.displayName);
  return { title: { absolute: seo.title }, description: seo.description, robots: { index: selected.storefront.presentation.seo.allowIndex, follow: selected.storefront.presentation.seo.allowIndex }, alternates: { canonical: new URL(selected.page.route, selected.storefront.canonicalUrl).toString() } };
}

export default async function BlogDetail({ params, searchParams }: Params) {
  const selected = await article((await params).slug, (await searchParams).lang);
  return <StorefrontFrame storefront={selected.storefront} design={selected.design}><article className="store-section store-container policy-page"><h1>{selected.page.title}</h1><div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: selected.page.html }} /></article></StorefrontFrame>;
}
