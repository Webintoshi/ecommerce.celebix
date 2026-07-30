import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";

import { ProductGrid } from "@/components/ProductGrid";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

async function category(slug: string) {
  const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage());
  try {
    const selected = await runtime.repository.listPublicProductsByCategory({ storefront, now: new Date(), slug, limit: 48 });
    return { storefront, category: selected.category, products: selected.items };
  } catch (error) {
    if (error instanceof PublicStorefrontRepositoryError && error.code === "not_found") notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const selected = await category((await params).slug);
  const title = `${selected.category.name} | ${selected.storefront.presentation.displayName}`;
  const description = `${selected.category.name} kategorisindeki aktif ürünler`;
  return {
    title, description,
    robots: { index: selected.storefront.presentation.seo.allowIndex, follow: selected.storefront.presentation.seo.allowIndex },
    alternates: { canonical: new URL(`/categories/${selected.category.slug}`, selected.storefront.canonicalUrl).toString() },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const selected = await category((await params).slug);
  const { presentation } = selected.storefront;
  return <StorefrontFrame storefront={selected.storefront}>
    <nav className="product-breadcrumb store-container" aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span><span aria-current="page">{selected.category.name}</span></nav>
    <section className="listing-hero"><div className="store-container"><span>KATEGORİ</span><h1>{selected.category.name}</h1><p>{selected.products.length} aktif ürün</p></div></section>
    <section className="store-section store-container"><ProductGrid products={selected.products} cardStyle={presentation.theme.productCardStyle} imageRatio={presentation.theme.productImageRatio} /></section>
  </StorefrontFrame>;
}
