import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";

import { SeoRelatedLinks } from "@/components/SeoRelatedLinks";
import { SeoStructuredData } from "@/components/SeoStructuredData";
import { buildPublicSeoMetadata, effectivePublicSeo, buildBreadcrumbStructuredData } from "@/lib/public-seo.ts";
import { loadPublicResourceSeo } from "@/lib/public-seo-read.ts";
import { CommercePageEvent } from "@/components/CommercePageEvent";
import { sioraThemeFor } from "../../../themes/siora/theme.ts";
import { alplerThemeFor } from "../../../themes/alpler/theme.ts";
import { guzideThemeFor } from "../../../themes/guzide/theme.ts";
import guzideCatalogStyles from "../../../themes/guzide/guzide-product-explorer.module.css";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductExplorer } from "@/components/ProductExplorer";
import { parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/product-catalog-query.ts";
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
      limit: guzideThemeFor(storefront) ? 1 : 48,
    });
    const seoSelection = await loadPublicResourceSeo(runtime.seo, storefront.hostname, "category", selected.category.id);
    return {
      seoSelection,
      runtime,
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
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>;
  routeVariant: StorefrontRouteVariant;
  searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const selected = await category((await params).slug);
  if (storefrontRouteVariant(selected.storefront.locale) !== routeVariant) {
    permanentRedirect(
      categoryPath(selected.storefront.locale, selected.category.slug),
    );
  }
  const { presentation } = selected.storefront;
  const guzide = guzideThemeFor(selected.storefront);
  const navigation = "navigation" in presentation ? presentation.navigation : {
    items: (presentation.categoryShowcase?.items ?? []).map(({ name, slug }) => ({ name, slug, children: [] })),
  };
  const selection = parseProductCatalogQuery(guzide ? await searchParams : {});
  const catalog = guzide ? await (async () => {
    if (!selected.runtime.repository.queryPublicCatalog) throw new Error("public_catalog_query_unavailable");
    try {
      return await selected.runtime.repository.queryPublicCatalog({
        storefront: selected.storefront,
        now: new Date(),
        categorySlug: selected.category.slug,
        query: selection.query,
        filter: selection.filter,
        order: selection.order,
        offset: selection.offset,
        limit: PRODUCT_CATALOG_PAGE_SIZE,
      });
    } catch (error) {
      if (error instanceof PublicStorefrontRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) notFound();
      throw error;
    }
  })() : null;
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
        className={`product-breadcrumb store-container${guzide ? ` ${guzideCatalogStyles.breadcrumb}` : ""}`}
        aria-label="İçerik yolu"
      >
        <Link href="/">Ana sayfa</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{selected.category.name}</span>
      </nav>
      <section className={`store-section store-container${guzide ? ` ${guzideCatalogStyles.section}` : ""}`}>
        {guzide && catalog ? <ProductExplorer
          visualTheme={guzide}
          products={catalog.items}
          selection={selection}
          total={catalog.total}
          nextOffset={catalog.nextOffset}
          path={categoryPath(selected.storefront.locale, selected.category.slug)}
          catalog={{ title: selected.category.name, slug: selected.category.slug, navigation }}
          locale={selected.storefront.locale}
          cardStyle={presentation.theme.productCardStyle}
          imageRatio={presentation.theme.productImageRatio}
          preserveOrder
        /> : <>
          {(alplerThemeFor(selected.storefront) ?? sioraThemeFor(selected.storefront)) ? <h1 className="siora-page-title">{selected.category.name}</h1> : <h1 className="sr-only">{selected.category.name}</h1>}
          <ProductGrid
            products={selected.products}
            preserveOrder
            locale={selected.storefront.locale}
            cardStyle={presentation.theme.productCardStyle}
            imageRatio={presentation.theme.productImageRatio}
          />
        </>}
      </section>
      <SeoRelatedLinks links={selected.seoSelection?.links ?? []} locale={selected.storefront.locale} />
    </StorefrontFrame>
  );
}
