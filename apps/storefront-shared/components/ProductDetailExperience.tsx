import Link from "next/link";
import { FIXED_STOREFRONT_POLICIES, type PublicProduct, type PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";
import { ProductCard } from "./ProductCard";
import { ProductDescription } from "./ProductDescription";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import styles from "./product-detail-experience.module.css";

export const POLICY_LINKS = FIXED_STOREFRONT_POLICIES;

export function ProductDetailExperience({ product, relatedProducts, options, cardStyle, imageRatio }: Readonly<{ product: PublicProduct; relatedProducts: readonly PublicProduct[]; options: PublicStarterThemePresentationV2["productDetail"]; cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"] }>) {
  const productCategoryPath = product.categoryPath ?? [];
  const primaryVariant = product.variants.find(({ available }) => available) ?? product.variants[0];
  return <>
    <nav className={`${styles.breadcrumb} store-container`} aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span>{productCategoryPath.map((category) => <span key={category.slug}><Link href={`/categories/${category.slug}`}>{category.name}</Link><span aria-hidden="true">/</span></span>)}<span aria-current="page">{product.title}</span></nav>
    <section className={`${styles.experience} store-container`}>
      <ProductGallery product={product} style={options.galleryStyle} />
      <div className={styles.purchaseColumn}>
        <p className={styles.eyebrow}>ÜRÜN DETAYI</p>
        {options.showBrand && product.brand ? <Link className={styles.brand} href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
        <h1>{product.title}</h1>
        {options.showSku && primaryVariant?.sku ? <p className={styles.sku}>SKU: {primaryVariant.sku}</p> : null}
        <div className={styles.price}>{product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div>
        <div className={`${styles.stock} ${product.available ? styles.available : ""}`}><b>{product.available ? "Stokta" : "Tükendi"}</b><span>{product.available ? "Siparişe hazır seçenekler mevcut." : "Aktif seçenekler şu anda stokta değil."}</span></div>
        <ProductPurchasePanel product={product} mobileSticky={options.mobileStickyPurchase} />
        <div className={styles.policies}>{POLICY_LINKS.map((policy) => <details key={policy.key}><summary>{policy.label}</summary><p>Mağazanın yayınlanmış koşullarını inceleyin.</p><Link href={policy.route}>Politikayı görüntüle</Link></details>)}</div>
      </div>
    </section>
    <ProductDescription product={product} />
    {options.showRelatedProducts && relatedProducts.length > 0 ? <section className={`${styles.related} store-container`} aria-labelledby="related-products-title"><header><p className={styles.eyebrow}>SİZE ÖZEL SEÇKİ</p><h2 id="related-products-title">Benzer ürünler</h2></header><div className={styles.relatedGrid}>{relatedProducts.map((item) => <ProductCard key={item.id} product={item} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </>;
}
