import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicPolicyPage, PublicProduct, PublicStarterThemePresentationV2, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { ProductVariantMediaProvider } from "../../components/ProductVariantMedia";
import { ProductCard } from "../../components/ProductCard";
import { ProductApprovedReviews } from "../../components/ProductApprovedReviews";
import { renderStarterProductDescription } from "@/lib/product-description.ts";
import { availableProductsFirst } from "@/lib/public-product-ordering.ts";
import { categoryPath } from "@/lib/storefront-routes.ts";
import { SioraProductGallery } from "./SioraProductGallery";
import { SioraProductPurchase } from "./SioraProductPurchase";
import { sioraInitialVariant } from "./product-options.ts";
import styles from "./siora-product-detail.module.css";

function RichText({ body, label }: Readonly<{ body?: string; label: string }>) {
  const html = renderStarterProductDescription(body, label);
  return html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

export function SioraProductDetailExperience({ product, storefrontId, locale, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector }: Readonly<{
  product: PublicProduct; storefrontId: string; locale: string; relatedProducts: readonly PublicProduct[];
  publishedPolicies: readonly PublicPolicyPage[]; options: StarterProductDetailConfigV2;
  cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"]; showQuantitySelector: boolean;
}>) {
  const information: { key: string; label: string; content: ReactNode }[] = [];
  for (const section of options.informationSections) {
    if (section === "description" && renderStarterProductDescription(product.description, "Ürün bilgisi")) information.push({ key: section, label: "Ürün bilgisi", content: <RichText body={product.description} label="Ürün bilgisi" /> });
    if (section === "materials_and_care" && renderStarterProductDescription(product.merchandising?.materialsAndCare, "Malzeme ve bakım")) information.push({ key: section, label: "Malzeme ve bakım", content: <RichText body={product.merchandising?.materialsAndCare} label="Malzeme ve bakım" /> });
    if (section === "certifications" && product.merchandising?.certifications.length) information.push({ key: section, label: "Sertifikalar", content: <ul>{product.merchandising.certifications.map((text) => <li key={text}>{text}</li>)}</ul> });
    if (section === "shipping_and_returns" && publishedPolicies.length) information.push({ key: section, label: "Kargo ve iadeler", content: <>{publishedPolicies.map((policy) => <article key={policy.key}><h3>{policy.label}</h3>{policy.html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: policy.html }} /> : null}<Link href={policy.route}>{policy.label} hakkında bilgi</Link></article>)}</> });
  }
  const guide = options.showSizeGuide ? product.merchandising?.sizeGuide : undefined;
  const sizeGuide = guide && renderStarterProductDescription(guide.body, guide.heading) ? <RichText body={guide.body} label={guide.heading} /> : undefined;
  const related = availableProductsFirst(relatedProducts);
  return <div className={styles.experience} data-siora-product-experience>
    <ProductVariantMediaProvider key={product.id} product={product} initialVariantId={sioraInitialVariant(product)?.id}>
      <section className={styles.stage} aria-label="Ürün detayları">
        <SioraProductGallery product={product} />
        <SioraProductPurchase product={product} storefrontId={storefrontId} locale={locale} options={options} showQuantitySelector={showQuantitySelector} sizeGuide={sizeGuide} />
      </section>
    </ProductVariantMediaProvider>
    {options.showBreadcrumbs || information.length || product.merchandising?.highlights.length ? <section className={styles.details} aria-label="Ürün bilgileri">
      {options.showBreadcrumbs ? <nav aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link>{(product.categoryPath ?? []).map(({ name, slug }) => <span key={slug}> / <Link href={categoryPath(locale, slug)}>{name}</Link></span>)}<span>/ {product.title}</span></nav> : null}
      {product.merchandising?.highlights.length ? <ul className={styles.highlights}>{product.merchandising.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
      {information.map(({ key, label, content }) => <details key={key}><summary>{label}</summary><div className={styles.detailBody}>{content}</div></details>)}
    </section> : null}
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    {options.showRelatedProducts && related.length ? <section className={styles.related} aria-labelledby="siora-related-title" data-product-related><h2 id="siora-related-title">Birlikte keşfedin</h2><div className={styles.relatedGrid}>{related.map((item) => <ProductCard key={item.id} product={item} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </div>;
}
