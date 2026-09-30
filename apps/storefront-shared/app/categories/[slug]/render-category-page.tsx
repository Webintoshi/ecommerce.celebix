import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";

import { SeoRelatedLinks } from "@/components/SeoRelatedLinks";
import { SeoStructuredData } from "@/components/SeoStructuredData";
import { buildPublicSeoMetadata, effectivePublicSeo, buildBreadcrumbStructuredData } from "@/lib/public-seo.ts";
import { loadPublicResourceSeo } from "@/lib/public-seo-read.ts";
import { CommercePageEvent } from "@/components/CommercePageEvent";
import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";
import {
  categoryPath,
  storefrontRouteVariant,
  type StorefrontRouteVariant,
} from "@/lib/storefront-routes.ts";

async function category(slug: string) {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  try {
    const selected = await runtime.repository.listPublicProductsByCategory({
      storefront,
      now: new Date(),
      slug,
      limit: 48,
    });
    const seoSelection = await loadPublicResourceSeo(runtime.seo, storefront.hostname, "category", selected.category.id);
    return {
      seoSelection,
      storefront,
      design,
      category: selected.category,
      products: selected.items,
    };
  } catch (error) {
    if (
      error instanceof PublicStorefrontRepositoryError &&
      (error.code === "not_found" || error.code === "invalid_input")
    )
      notFound();
    throw error;
  }
}

export async function generateCategoryMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const selected = await category((await params).slug);
  return buildPublicSeoMetadata({ storefront: selected.storefront, fallback: { title: selected.category.name, description: `${selected.category.name} kategorisindeki aktif ürünler`, path: categoryPath(selected.storefront.locale, selected.category.slug) }, selection: selected.seoSelection });
}

export async function renderCategoryPage({
  params,
  routeVariant,
}: {
  params: Promise<{ slug: string }>;
  routeVariant: StorefrontRouteVariant;
}) {
  const selected = await category((await params).slug);
  if (storefrontRouteVariant(selected.storefront.locale) !== routeVariant) {
    permanentRedirect(
      categoryPath(selected.storefront.locale, selected.category.slug),
    );
  }
  const { presentation } = selected.storefront;
  const seo = effectivePublicSeo({ storefront: selected.storefront, fallback: { title: selected.category.name, description: `${selected.category.name} kategorisindeki aktif ürünler`, path: categoryPath(selected.storefront.locale, selected.category.slug) }, selection: selected.seoSelection });
  return (
    <StorefrontFrame storefront={selected.storefront} design={selected.design}>
      <SeoStructuredData value={buildBreadcrumbStructuredData(selected.storefront.canonicalUrl, [{ name: presentation.displayName, path: "/" }, { name: selected.category.name, path: seo.path }])} />
      <CommercePageEvent
        event={{
          name: "category_view",
          data: { categoryId: selected.category.id },
        }}
      />
      <nav
        className="product-breadcrumb store-container"
        aria-label="İçerik yolu"
      >
        <Link href="/">Ana sayfa</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{selected.category.name}</span>
      </nav>
      <section className="store-section store-container">
        <h1 className="sr-only">{selected.category.name}</h1>
        <ProductGrid
          products={selected.products}
          preserveOrder
          locale={selected.storefront.locale}
          cardStyle={presentation.theme.productCardStyle}
          imageRatio={presentation.theme.productImageRatio}
        />
      </section>
      <SeoRelatedLinks links={selected.seoSelection?.links ?? []} locale={selected.storefront.locale} />
    </StorefrontFrame>
  );
}
