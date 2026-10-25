import Link from "next/link";
import type { PublicPolicyPage, PublicProduct, PublicStarterThemePresentationV2, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

import { availableProductsFirst } from "@/lib/public-product-ordering.ts";
import { productPath, categoryPath } from "@/lib/storefront-routes.ts";
import { ProductCard } from "./ProductCard";
import { ProductApprovedReviews } from "./ProductApprovedReviews";
import { ProductPageReviewForm } from "./ProductPageReviewForm";
import { ProductGallery } from "./ProductGallery";
import { ProductInformationDisclosures, ProductSizeGuide } from "./ProductInformationDisclosures";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { ProductVariantMediaProvider } from "./ProductVariantMedia";
import { SelectedProductDetailSummary } from "./SelectedProductDetailSummary";
import styles from "./product-detail-experience.module.css";

export function ProductDetailExperience({ product, initialVariantId,locale, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector, showStockQuantity = true }: Readonly<{ product: PublicProduct;initialVariantId?:string; locale: string; relatedProducts: readonly PublicProduct[]; publishedPolicies: readonly PublicPolicyPage[]; options: StarterProductDetailConfigV2; cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"]; showQuantitySelector: boolean; showStockQuantity?: boolean }>) {
  const productCategoryPath = product.categoryPath ?? [];
  const orderedRelatedProducts = availableProductsFirst(relatedProducts);
  return <>
    {options.showBreadcrumbs ? <nav className={`${styles.breadcrumb} store-container`} aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span>{productCategoryPath.map((category) => <span key={category.slug}><Link href={categoryPath(locale, category.slug)}>{category.name}</Link><span aria-hidden="true">/</span></span>)}<span aria-current="page">{product.title}</span></nav> : null}
    <ProductVariantMediaProvider key={`${product.id}:${initialVariantId??''}`} product={product} initialVariantId={initialVariantId}><section className={`${styles.experience} store-container`} data-product-detail-experience>
      <ProductGallery product={product} style={options.galleryStyle} />
      <div className={styles.purchaseColumn} data-product-purchase-column>
        <SelectedProductDetailSummary product={product} options={options} classes={styles} />
        {options.showSizeGuide && product.merchandising?.sizeGuide ? <ProductSizeGuide heading={product.merchandising.sizeGuide.heading} body={product.merchandising.sizeGuide.body} /> : null}
        <ProductPurchasePanel product={product} mobileSticky={options.mobileStickyPurchase} available={product.available} showQuantitySelector={showQuantitySelector} showStockQuantity={showStockQuantity} />
        <ProductInformationDisclosures informationSections={options.informationSections} merchandising={product.merchandising} description={product.description} publishedPolicies={publishedPolicies} />
      </div>
    </section></ProductVariantMediaProvider>
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    <ProductPageReviewForm key={product.id} productId={product.id} returnTo={productPath(locale, product.slug)} />
    {options.showRelatedProducts && orderedRelatedProducts.length > 0 ? <section className={`${styles.related} store-container`} data-product-related aria-labelledby="related-products-title"><header><p className={styles.eyebrow}>SİZE ÖZEL SEÇKİ</p><h2 id="related-products-title">Benzer ürünler</h2></header><div className={styles.relatedGrid}>{orderedRelatedProducts.map((item) => <ProductCard key={item.id} product={item} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </>;
}
