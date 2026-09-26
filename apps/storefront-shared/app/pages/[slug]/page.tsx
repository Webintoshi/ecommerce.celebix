import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { buildPublicContentPage, legacyPolicyPageRoute } from "@/lib/content-page.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

async function page(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) notFound();
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getPage) throw new StorefrontUnavailableError();
  try {
    const source = await runtime.content.getPage({ hostname: storefront.hostname, now: new Date(), slug });
    return Object.freeze({ storefront, design, page: buildPublicContentPage(source, slug) });
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

export async function generateMetadata({ params }: Readonly<{ params: Promise<{ slug: string }> }>): Promise<Metadata> {
  const selected = await page((await params).slug);
  return { title: `${selected.page.title} | ${selected.storefront.presentation.displayName}`, robots: { index: selected.storefront.presentation.seo.allowIndex, follow: selected.storefront.presentation.seo.allowIndex }, alternates: { canonical: new URL(selected.page.route, selected.storefront.canonicalUrl).toString() } };
}

export default async function ContentPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const selected = await page((await params).slug);
  return <StorefrontFrame storefront={selected.storefront} design={selected.design}><article className="store-section store-container policy-page"><h1>{selected.page.title}</h1><div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: selected.page.html }} /></article></StorefrontFrame>;
}
