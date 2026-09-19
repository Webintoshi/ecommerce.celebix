import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { ProductExplorer } from "@/components/ProductExplorer";
import { parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/product-catalog-query.ts";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";
import {
  productIndexPath,
  storefrontRouteVariant,
  type StorefrontRouteVariant,
} from "@/lib/storefront-routes.ts";

export async function generateMetadata(): Promise<Metadata> {
  const selected = await resolveStorefrontPage();
  if (selected.kind !== "active")
    return { title: "Ürünler", robots: { index: false, follow: false } };
  const { storefront } = selected.context;
  return {
    title: `Ürünler | ${storefront.presentation.displayName}`,
    description: `${storefront.presentation.displayName} aktif ürün koleksiyonu`,
    robots: {
      index: storefront.presentation.seo.allowIndex,
      follow: storefront.presentation.seo.allowIndex,
    },
    alternates: {
      canonical: new URL(productIndexPath(storefront.locale), storefront.canonicalUrl).toString(),
    },
  };
}

export async function renderProductsPage(routeVariant: StorefrontRouteVariant, searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> = Promise.resolve({})) {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  if (storefrontRouteVariant(storefront.locale) !== routeVariant) {
    permanentRedirect(productIndexPath(storefront.locale));
  }
  const selection = parseProductCatalogQuery(await searchParams);
  if (!runtime.repository.queryPublicCatalog) throw new Error("public_catalog_query_unavailable");
  const products = await runtime.repository.queryPublicCatalog({
    storefront,
    now: new Date(),
    categorySlug: null,
    query: selection.query,
    filter: selection.filter,
    order: selection.order,
    offset: selection.offset,
    limit: PRODUCT_CATALOG_PAGE_SIZE,
  });
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="store-section store-container">
        <h1 className="sr-only">Ürünler</h1>
        <ProductExplorer
          products={products.items}
          selection={selection}
          total={products.total}
          nextOffset={products.nextOffset}
          path={productIndexPath(storefront.locale)}
          locale={storefront.locale}
          cardStyle={storefront.presentation.theme.productCardStyle}
          imageRatio={storefront.presentation.theme.productImageRatio}
        />
      </section>
    </StorefrontFrame>
  );
}

export default function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("legacy",searchParams);
}
