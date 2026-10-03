import Link from "next/link";
import type { PublicPolicyPage, PublicProduct, PublicStarterThemePresentationV2, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { ProductGallery } from "../../components/ProductGallery";
import { ProductVariantMediaProvider } from "../../components/ProductVariantMedia";
import { ProductInformationDisclosures, ProductSizeGuide } from "../../components/ProductInformationDisclosures";
import { ProductApprovedReviews } from "../../components/ProductApprovedReviews";
import { ProductCard } from "../../components/ProductCard";
import { availableProductsFirst } from "@/lib/public-product-ordering.ts";
import { categoryPath, productIndexPath } from "@/lib/storefront-routes.ts";
import { LilyumProductPurchase } from "./LilyumProductPurchase";
import { LilyumIcon } from "./LilyumIcon";

export function LilyumProductDetailExperience({ product, locale, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector, supportEmail }: Readonly<{
  product: PublicProduct; locale: string; relatedProducts: readonly PublicProduct[]; publishedPolicies: readonly PublicPolicyPage[];
  options: StarterProductDetailConfigV2; cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"]; showQuantitySelector: boolean; supportEmail?: string;
}>) {
  const related = availableProductsFirst(relatedProducts);
  return <div className="lf-product lf-container" data-lilyum-product data-mobile-sticky={options.mobileStickyPurchase ? "true" : undefined}>
    {options.showBreadcrumbs ? <nav className="lf-product-breadcrumb" aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span>{(product.categoryPath ?? []).map(category => <span key={category.slug}><Link href={categoryPath(locale, category.slug)}>{category.name}</Link><span aria-hidden="true">/</span></span>)}<span aria-current="page">{product.title}</span></nav> : null}
    <Link className="lf-product-back" href={product.categoryPath?.[0] ? categoryPath(locale, product.categoryPath[0].slug) : productIndexPath(locale)}><LilyumIcon name="arrow" />Çiçekleri keşfet</Link>
    <ProductVariantMediaProvider key={product.id} product={product}>
      <section className="lf-product-stage" aria-label={`${product.title} ürün ayrıntıları`}>
        <ProductGallery product={product} style={options.galleryStyle} />
        <div className="lf-product-column">
          <LilyumProductPurchase product={product} options={options} showQuantitySelector={showQuantitySelector}>
            <div className="lf-product-delivery"><LilyumIcon name="truck" /><div><strong>Ordu’da aynı gün teslimat</strong><p>Adres ve güncel teslimat saati için mağazayla iletişime geçebilirsiniz.</p><Link href="/#lilyum-delivery">Teslimat bilgisi<LilyumIcon name="arrow" /></Link></div></div>
            {supportEmail ? <a className="lf-product-contact" href={`mailto:${supportEmail}?subject=${encodeURIComponent(product.title)}`}>Bu çiçek hakkında bilgi al<LilyumIcon name="arrow" /></a> : null}
            <div className="lf-product-information">
              {options.showSizeGuide && product.merchandising?.sizeGuide ? <ProductSizeGuide heading={product.merchandising.sizeGuide.heading} body={product.merchandising.sizeGuide.body} /> : null}
              <ProductInformationDisclosures informationSections={options.informationSections} merchandising={product.merchandising} description={product.description} publishedPolicies={publishedPolicies} />
            </div>
          </LilyumProductPurchase>
        </div>
      </section>
    </ProductVariantMediaProvider>
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    {options.showRelatedProducts && related.length ? <section className="lf-product-related" aria-labelledby="lilyum-related-title"><header><span className="lf-eyebrow">BİRLİKTE KEŞFEDİN</span><h2 id="lilyum-related-title">Bir başka güzel seçim</h2><Link href={productIndexPath(locale)}>Tüm çiçekler<LilyumIcon name="arrow" /></Link></header><div className="lf-product-related-grid">{related.map(item => <ProductCard key={item.id} product={item} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </div>;
}
