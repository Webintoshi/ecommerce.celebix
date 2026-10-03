import Link from "next/link";
import type { ReactNode } from "react";
import type {
  PublicPolicyPage,
  PublicProduct,
  PublicStarterThemePresentationV2,
  StarterProductDetailConfigV2,
} from "@celebix/saas-contracts";

import { ProductApprovedReviews } from "../../components/ProductApprovedReviews";
import { ProductCard } from "../../components/ProductCard";
import { ProductVariantMediaProvider } from "../../components/ProductVariantMedia";
import { availableProductsFirst } from "@/lib/public-product-ordering.ts";
import { renderStarterProductDescription } from "@/lib/product-description.ts";
import { categoryPath, productIndexPath } from "@/lib/storefront-routes.ts";
import { GuzideProductGallery } from "./GuzideProductGallery";
import { GuzideProductPurchase } from "./GuzideProductPurchase";
import { GuzideProductReturn } from "./GuzideProductReturn";
import styles from "./guzide-product-detail.module.css";

type Props = Readonly<{
  product: PublicProduct;
  locale: string;
  relatedProducts: readonly PublicProduct[];
  publishedPolicies: readonly PublicPolicyPage[];
  options: StarterProductDetailConfigV2;
  cardStyle: PublicStarterThemePresentationV2["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentationV2["theme"]["productImageRatio"];
  showQuantitySelector: boolean;
  supportEmail?: string;
  storefrontId?: string;
}>;

function RichText({ body, label }: Readonly<{ body?: string; label: string }>) {
  const html = renderStarterProductDescription(body, label);
  return html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} /> : null;
}

function Chevron() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="m6 9 6 6 6-6" /></svg>;
}

export function GuzideProductDetailExperience({ product, locale, relatedProducts, publishedPolicies, options, cardStyle, imageRatio, showQuantitySelector, supportEmail, storefrontId = "a828862c-4cc1-475a-89cc-5fbee31eb43f" }: Props) {
  const information: { key: string; label: string; content: ReactNode }[] = [];
  for (const section of options.informationSections) {
    if (section === "description" && renderStarterProductDescription(product.description, "Ürün bilgileri")) {
      information.push({ key: section, label: "Ürün ayrıntıları", content: <RichText body={product.description} label="Ürün bilgileri" /> });
    }
    if (section === "materials_and_care" && renderStarterProductDescription(product.merchandising?.materialsAndCare, "Malzeme ve bakım")) {
      information.push({ key: section, label: "Malzeme ve bakım", content: <RichText body={product.merchandising?.materialsAndCare} label="Malzeme ve bakım" /> });
    }
    if (section === "certifications" && product.merchandising?.certifications.length) {
      information.push({ key: section, label: "Sertifikalar", content: <ul>{product.merchandising.certifications.map(text => <li key={text}>{text}</li>)}</ul> });
    }
    if (section === "shipping_and_returns" && publishedPolicies.length) {
      information.push({ key: section, label: "Teslimat ve iade", content: <div className={styles.policyList}>{publishedPolicies.map(policy => <article key={policy.key}><h3>{policy.label}</h3>{policy.html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: policy.html }} /> : null}<Link href={policy.route}>{policy.label} hakkında bilgi</Link></article>)}</div> });
    }
  }
  const guide = options.showSizeGuide ? product.merchandising?.sizeGuide : undefined;
  const hasGuide = guide && renderStarterProductDescription(guide.body, guide.heading);
  const related = availableProductsFirst(relatedProducts).slice(0, 3);
  const supportHref = supportEmail ? `mailto:${supportEmail}?subject=${encodeURIComponent(product.title)}` : undefined;
  const category = product.categoryPath?.[0];
  const labels: Readonly<Record<string, string>> = { Kolyeler: "Kolyelere dön", Bileklikler: "Bilekliklere dön", Yüzükler: "Yüzüklere dön", Küpeler: "Küpelere dön" };
  const backHref = category ? categoryPath(locale, category.slug) : productIndexPath(locale);
  const backLabel = category ? labels[category.name] ?? `${category.name} kategorisine dön` : "Ürünlere dön";
  return <div className={`${styles.experience} store-container`} data-guzide-product-experience data-mobile-sticky={options.mobileStickyPurchase ? "true" : undefined}>
    <GuzideProductReturn storefrontId={storefrontId} fallbackHref={backHref} fallbackLabel={backLabel} />
    {options.showBreadcrumbs ? <nav className={styles.breadcrumb} aria-label="İçerik yolu"><Link href="/">Ana sayfa</Link><span aria-hidden="true">/</span>{(product.categoryPath ?? []).map(category => <span key={category.slug}><Link href={categoryPath(locale, category.slug)}>{category.name}</Link><span aria-hidden="true">/</span></span>)}<span aria-current="page">{product.title}</span></nav> : null}
    <ProductVariantMediaProvider key={product.id} product={product}>
      <section className={styles.stage} aria-label={`${product.title} ürün ayrıntıları`}>
        <GuzideProductGallery product={product} supportHref={supportHref} />
        <GuzideProductPurchase product={product} options={options} showQuantitySelector={showQuantitySelector}>
          {hasGuide || information.length ? <div className={styles.information} aria-label="Ürün bilgileri">
            {hasGuide ? <details data-guzide-size-guide><summary>{guide.heading}<Chevron /></summary><div className={styles.informationBody}><RichText body={guide.body} label={guide.heading} /></div></details> : null}
            {information.map(({ key, label, content }) => <details key={key}><summary>{label}<Chevron /></summary><div className={styles.informationBody}>{content}</div></details>)}
          </div> : null}
        </GuzideProductPurchase>
      </section>
    </ProductVariantMediaProvider>
    {options.showApprovedReviews && product.reviews?.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
    {options.showRelatedProducts && related.length ? <section className={styles.related} data-product-related aria-labelledby="guzide-related-title"><h2 id="guzide-related-title">Birlikte keşfedin</h2><div className={styles.relatedGrid}>{related.map(item => <ProductCard key={item.id} product={item} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />)}</div></section> : null}
  </div>;
}
