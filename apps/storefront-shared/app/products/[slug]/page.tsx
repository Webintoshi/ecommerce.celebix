import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PublicStorefrontRepositoryError } from "@celebix/saas-data";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductDescription } from "@/components/ProductDescription";
import { BuyNowButton, BuyNowProvider } from "@/components/BuyNowButton";
import { StorefrontAnalyticsEvent } from "@/components/StorefrontAnalyticsEvent";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { PRODUCT_VIEW_EVENT } from "@/lib/analytics/events.ts";
import { checkoutRolloutAllowsRequest } from "@/lib/checkout/rollout-gate.ts";
import { formatTry } from "@/lib/format.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

async function product(slug: string) { const { runtime, storefront, tracker } = requireStorefrontPage(await resolveStorefrontPage()); try { return { storefront, tracker, product: await runtime.repository.getPublicProductBySlug({ storefront, now: new Date(), slug }) }; } catch (error) { if (error instanceof PublicStorefrontRepositoryError && error.code === "not_found") notFound(); throw error; } }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const selected = await product((await params).slug); return { title: `${selected.product.title} | ${selected.storefront.name}`, description: selected.product.description ?? `${selected.product.title} ürün ayrıntıları`, alternates: { canonical: new URL(`/products/${selected.product.slug}`, selected.storefront.canonicalUrl).toString() }, openGraph: { title: selected.product.title, type: "website", images: selected.product.media[0]?.url ? [selected.product.media[0].url] : [] } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const [selected, requestHeaders] = await Promise.all([
    product((await params).slug),
    headers(),
  ]);
  const { storefront, product: item } = selected;
  const buyNowAllowed = checkoutRolloutAllowsRequest(requestHeaders);
  const variants = <section className="variant-panel" aria-labelledby="variants-title">
    <h2 id="variants-title">Varyantlar</h2>
    {item.variants.map((variant) => <article key={variant.id}>
      <div><strong>{variant.title}</strong>{variant.sku ? <small>SKU {variant.sku}</small> : null}</div>
      <div>
        <span>{formatTry(variant.priceCents)}</span>
        <em>{variant.available ? (variant.stockTracking ? `${variant.stockQuantity} adet` : "Stokta") : "Tükendi"}</em>
        {buyNowAllowed ? <BuyNowButton variantId={variant.id} available={variant.available} /> : null}
      </div>
    </article>)}
  </section>;
  return <StorefrontFrame storefront={storefront}>
    <StorefrontAnalyticsEvent tracker={selected.tracker} event={PRODUCT_VIEW_EVENT} trigger="mount" />
    <section className="product-detail store-container">
      <ProductGallery product={item} />
      <div className="product-copy">
        <span>ÜRÜN DETAYI</span>
        <h1>{item.title}</h1>
        <div className="detail-price">{item.compareAtCents ? <del>{formatTry(item.compareAtCents)}</del> : null}<strong>{formatTry(item.priceCents)}</strong></div>
        <div className={`stock-callout ${item.available ? "is-available" : ""}`}>
          <b>{item.available ? "Stokta" : "Tükendi"}</b>
          <span>{item.available ? "Siparişe hazır aktif seçenekler mevcut." : "Aktif seçenekler şu anda stokta değil."}</span>
        </div>
        {buyNowAllowed
          ? <BuyNowProvider key={item.id} productId={item.id}>{variants}</BuyNowProvider>
          : variants}
      </div>
    </section>
    <ProductDescription product={item} />
  </StorefrontFrame>;
}
