import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StorefrontContentRepositoryError } from "@celebix/saas-data";

import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import {
  StorefrontUnavailableError,
  requireStorefrontPage,
} from "@/lib/page-resolution.ts";
import {
  buildPublicPolicyPage,
  resolveStorefrontPolicyRoute,
} from "@/lib/policy-page.ts";

async function policy(segment: string) {
  const definition = resolveStorefrontPolicyRoute(segment);
  if (!definition) notFound();
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  try {
    return Object.freeze({
      storefront,
      design,
      page: buildPublicPolicyPage(
        await runtime.content.getPolicy({
          hostname: storefront.hostname,
          now: new Date(),
          key: definition.key,
        }),
      ),
    });
  } catch (error) {
    if (
      error instanceof StorefrontContentRepositoryError &&
      (error.code === "not_found" || error.code === "invalid_input")
    )
      notFound();
    throw new StorefrontUnavailableError();
  }
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ policyKey: string }> }>): Promise<Metadata> {
  const selected = await policy((await params).policyKey);
  return {
    title: `${selected.page.label} | ${selected.storefront.presentation.displayName}`,
    robots: selected.page.published
      ? {
          index: selected.storefront.presentation.seo.allowIndex,
          follow: selected.storefront.presentation.seo.allowIndex,
        }
      : { index: false, follow: false },
    alternates: {
      canonical: new URL(
        selected.page.route,
        selected.storefront.canonicalUrl,
      ).toString(),
    },
  };
}

export default async function PolicyPage({
  params,
}: Readonly<{ params: Promise<{ policyKey: string }> }>) {
  const { storefront, design, page } = await policy((await params).policyKey);
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="listing-hero">
        <div className="store-container">
          <span>MAĞAZA POLİTİKASI</span>
          <h1>{page.label}</h1>
          <p>
            {page.published
              ? "Mağazanın güncel politika metni"
              : "Bu metin mağaza tarafından henüz yayımlanmadı"}
          </p>
        </div>
      </section>
      <article className="store-section store-container policy-page">
        {page.published && page.html ? (
          <div
            className="product-description-rich-text"
            dangerouslySetInnerHTML={{ __html: page.html }}
          />
        ) : (
          <div className="store-empty">
            <span>◇</span>
            <h2>Henüz yayımlanmadı</h2>
            <p>Bu metin mağaza tarafından henüz yayımlanmadı.</p>
          </div>
        )}
      </article>
    </StorefrontFrame>
  );
}
