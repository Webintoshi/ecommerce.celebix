import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";
import { ProductDetailExperience } from "@/components/ProductDetailExperience";
import { StorefrontAnalyticsEvent } from "@/components/StorefrontAnalyticsEvent";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { PRODUCT_VIEW_EVENT } from "@/lib/analytics/events.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

async function product(slug: string) { const { runtime, storefront, campaign, tracker } = requireStorefrontPage(await resolveStorefrontPage()); try { return { runtime, storefront, campaign, tracker, product: await runtime.repository.getPublicProductBySlug({ storefront, now: new Date(), slug }) }; } catch (error) { if (error instanceof PublicStorefrontRepositoryError && error.code === "not_found") notFound(); throw error; } }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const selected = await product((await params).slug); const { presentation } = selected.storefront; return { title: `${selected.product.title} | ${presentation.displayName}`, description: selected.product.description ?? `${selected.product.title} ürün ayrıntıları`, robots: { index: presentation.seo.allowIndex, follow: presentation.seo.allowIndex }, alternates: { canonical: new URL(`/products/${selected.product.slug}`, selected.storefront.canonicalUrl).toString() }, openGraph: { title: selected.product.title, type: "website", images: selected.product.media[0]?.url ? [selected.product.media[0].url] : [] } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const selected = await product((await params).slug);
  const { storefront, product: item } = selected;
  const presentation = selected.campaign?.presentation ?? storefront.presentation;
  const options = presentation.schemaVersion === 2 ? presentation.productDetail : { galleryStyle: "grid" as const, showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true };
  const relatedProducts = options.showRelatedProducts && selected.runtime.repository.listRelatedPublicProducts ? (await selected.runtime.repository.listRelatedPublicProducts({ storefront, now: new Date(), productSlug: item.slug, limit: 4 }).catch(() => ({ items: [] }))).items : [];
  return <StorefrontFrame storefront={storefront}>
    <StorefrontAnalyticsEvent tracker={selected.tracker} event={PRODUCT_VIEW_EVENT} trigger="mount" />
    <ProductDetailExperience product={item} relatedProducts={relatedProducts} options={options} cardStyle={presentation.theme.productCardStyle} imageRatio={presentation.theme.productImageRatio} />
  </StorefrontFrame>;
}
