import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { sioraThemeFor } from "../../themes/siora/theme.ts";
import { alplerThemeFor } from "../../themes/alpler/theme.ts";
import { guzideThemeFor } from "../../themes/guzide/theme.ts";
import guzideCatalogStyles from "../../themes/guzide/guzide-product-explorer.module.css";
import { ProductExplorer } from "@/components/ProductExplorer";
import { parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/product-catalog-query.ts";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { buildPublicSeoMetadata } from "@/lib/public-seo.ts";
import { loadPublicSeoSettings } from "@/lib/public-seo-read.ts";
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
  const { storefront, runtime } = selected.context;
  const settings = await loadPublicSeoSettings(runtime.seo, storefront.hostname);
  return buildPublicSeoMetadata({ storefront, fallback: { title: "Ürünler", description: `${storefront.presentation.displayName} aktif ürün koleksiyonu`, path: productIndexPath(storefront.locale) }, settings });
}

export async function renderProductsPage(routeVariant: StorefrontRouteVariant, searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> = Promise.resolve({})) {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  if (storefrontRouteVariant(storefront.locale) !== routeVariant) {
    permanentRedirect(productIndexPath(storefront.locale));
  }
  const selection = parseProductCatalogQuery(await searchParams);
  const guzide = guzideThemeFor(storefront);
  const presentation = storefront.presentation;
  const navigation = "navigation" in presentation ? presentation.navigation : {
    items: (presentation.categoryShowcase?.items ?? []).map(({ name, slug }) => ({ name, slug, children: [] })),
  };
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
      <section className={`store-section store-container${guzide ? ` ${guzideCatalogStyles.section}` : ""}`}>
        {!guzide ? <h1 className="sr-only">Ürünler</h1> : null}
        <ProductExplorer
          visualTheme={guzide ?? alplerThemeFor(storefront) ?? sioraThemeFor(storefront)}
          catalog={guzide ? { title: "Ürünler", navigation } : undefined}
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
