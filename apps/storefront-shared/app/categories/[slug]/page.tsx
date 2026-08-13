import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";

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
    return {
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const selected = await category((await params).slug);
  const title = `${selected.category.name} | ${selected.storefront.presentation.displayName}`;
  const description = `${selected.category.name} kategorisindeki aktif ürünler`;
  return {
    title,
    description,
    robots: {
      index: selected.storefront.presentation.seo.allowIndex,
      follow: selected.storefront.presentation.seo.allowIndex,
    },
    alternates: {
      canonical: new URL(categoryPath(selected.storefront.locale, selected.category.slug), selected.storefront.canonicalUrl).toString(),
    },
  };
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
    permanentRedirect(categoryPath(selected.storefront.locale, selected.category.slug));
  }
  const { presentation } = selected.storefront;
  return (
    <StorefrontFrame storefront={selected.storefront} design={selected.design}>
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
          locale={selected.storefront.locale}
          cardStyle={presentation.theme.productCardStyle}
          imageRatio={presentation.theme.productImageRatio}
        />
      </section>
    </StorefrontFrame>
  );
}

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderCategoryPage({ params, routeVariant: "legacy" });
}
