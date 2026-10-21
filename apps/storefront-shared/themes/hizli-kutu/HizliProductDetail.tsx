import Link from "next/link";
import type { PublicPolicyPage, PublicProduct, PublicStarterThemePresentationV2, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { ProductGallery } from "../../components/ProductGallery";
import { ProductVariantMediaProvider } from "../../components/ProductVariantMedia";
import { ProductInformationDisclosures, ProductSizeGuide } from "../../components/ProductInformationDisclosures";
import { ProductGrid } from "../../components/ProductGrid";
import { ProductApprovedReviews } from "../../components/ProductApprovedReviews";
import { categoryPath, productIndexPath } from "../../lib/storefront-routes.ts";
import { HizliProductPurchase } from "./HizliProductPurchase";

export function HizliProductDetail({ product, initialVariantId, locale, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector }: {
  product: PublicProduct; initialVariantId?: string; locale: string; relatedProducts: readonly PublicProduct[]; publishedPolicies: readonly PublicPolicyPage[];
  options: StarterProductDetailConfigV2; cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"]; showQuantitySelector: boolean;
}) {
  return <>
    {options.showBreadcrumbs ? <nav className="hk-container hk-breadcrumbs" aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span>/</span>{product.categoryPath?.map(category => <span key={category.slug}><Link href={categoryPath(locale, category.slug)}>{category.name}</Link><span>/</span></span>)}<span aria-current="page">{product.title}</span></nav> : null}
    <ProductVariantMediaProvider key={`${product.id}:${initialVariantId ?? ""}`} product={product} initialVariantId={initialVariantId}><section className="hk-container hk-product" data-product-detail-experience>
      <div className="hk-product-media"><ProductGallery product={product} style={options.galleryStyle} /></div>
      <div className="hk-product-information"><HizliProductPurchase product={product} options={options} showQuantitySelector={showQuantitySelector} />
        {options.showSizeGuide && product.merchandising?.sizeGuide ? <ProductSizeGuide heading={product.merchandising.sizeGuide.heading} body={product.merchandising.sizeGuide.body} /> : null}
        <ProductInformationDisclosures informationSections={options.informationSections} merchandising={product.merchandising} description={product.description} publishedPolicies={publishedPolicies} />
      </div>
    </section></ProductVariantMediaProvider>
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    {options.showRelatedProducts && relatedProducts.length ? <section className="hk-container hk-section"><div className="hk-section-heading"><h2>Birlikte keşfedin</h2><Link href={productIndexPath(locale)}>Tüm ürünler</Link></div><ProductGrid products={relatedProducts} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} /></section> : null}
  </>;
}
