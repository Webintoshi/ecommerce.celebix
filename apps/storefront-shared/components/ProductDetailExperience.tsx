import Link from "next/link";
import type { PublicPolicyPage, PublicProduct, PublicStarterThemePresentationV2, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";
import { ProductCard } from "./ProductCard";
import { ProductApprovedReviews } from "./ProductApprovedReviews";
import { ProductGallery } from "./ProductGallery";
import { ProductInformationDisclosures, ProductSizeGuide } from "./ProductInformationDisclosures";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import styles from "./product-detail-experience.module.css";

export function ProductDetailExperience({ product, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector }: Readonly<{ product: PublicProduct; relatedProducts: readonly PublicProduct[]; publishedPolicies: readonly PublicPolicyPage[]; options: StarterProductDetailConfigV2; cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"]; showQuantitySelector: boolean }>) {
  const productCategoryPath = product.categoryPath ?? [];
  const primaryVariant = product.variants.find(({ available }) => available) ?? product.variants[0];
  return <>
    {options.showBreadcrumbs ? <nav className={`${styles.breadcrumb} store-container`} aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span>{productCategoryPath.map((category) => <span key={category.slug}><Link href={`/categories/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span></span>)}<span aria-current="page">{product.title}</span></nav> : null}
    <section className={`${styles.experience} store-container`}>
      <ProductGallery product={product} style={options.galleryStyle} />
      <div className={styles.purchaseColumn}>
        <div className={styles.summaryHeader}>
          <h1>{product.title}</h1>
          {options.showBrand && product.brand ? <Link className={styles.brand} href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
          {options.showSku && primaryVariant?.sku ? <p className={styles.sku}>Ürün Kodu: {primaryVariant.sku}</p> : null}
        </div>
        <div className={styles.price}>{product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div>
        {product.merchandising?.highlights.length ? <ul className={styles.highlights}>{product.merchandising.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
        {options.showSizeGuide && product.merchandising?.sizeGuide ? <ProductSizeGuide heading={product.merchandising.sizeGuide.heading} body={product.merchandising.sizeGuide.body} /> : null}
        <ProductPurchasePanel product={product} mobileSticky={options.mobileStickyPurchase} available={product.available} showQuantitySelector={showQuantitySelector} />
        <ProductInformationDisclosures informationSections={options.informationSections} merchandising={product.merchandising} description={product.description} publishedPolicies={publishedPolicies} />
      </div>
    </section>
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    {options.showRelatedProducts && relatedProducts.length > 0 ? <section className={`${styles.related} store-container`} aria-labelledby="related-products-title"><header><p className={styles.eyebrow}>SİZE ÖZEL SEÇKİ</p><h2 id="related-products-title">Benzer ürünler</h2></header><div className={styles.relatedGrid}>{relatedProducts.map((item) => <ProductCard key={item.id} product={item} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </>;
}
