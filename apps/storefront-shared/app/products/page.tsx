import type { Metadata } from "next";

import { ProductExplorer } from "@/components/ProductExplorer";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

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
      canonical: new URL("/products", storefront.canonicalUrl).toString(),
    },
  };
}

export default async function ProductsPage() {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const products = await runtime.repository.listPublicProducts({
    storefront,
    now: new Date(),
    limit: 48,
  });
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="store-section store-container">
        <h1 className="sr-only">Ürünler</h1>
        <ProductExplorer
          products={products.items}
          cardStyle={storefront.presentation.theme.productCardStyle}
          imageRatio={storefront.presentation.theme.productImageRatio}
        />
      </section>
    </StorefrontFrame>
  );
}
