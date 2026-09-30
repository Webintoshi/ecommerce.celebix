import type { PublicProduct, PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";
import Link from "next/link";

import { categoryPath, productIndexPath } from "../lib/storefront-routes.ts";
import { ProductGrid } from "./ProductGrid";
import styles from "./campaign-home.module.css";
import { GuzideRailControls } from "../themes/guzide/GuzideRailControls";
import type { GuzideVisualTheme } from "../themes/guzide/theme.ts";

type ProductRowSection = Extract<PublicStarterHomeSection, { kind: "product_row" }>;

export function CampaignProductRow({ section, products, presentation, locale, visualTheme }: Readonly<{
  section: ProductRowSection;
  products: readonly PublicProduct[];
  presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;
  locale: string;
  visualTheme?: GuzideVisualTheme;
}>) {
  if (!products.length) return null;
  const destination = section.source === "category" && section.categorySlug
    ? categoryPath(locale, section.categorySlug)
    : productIndexPath(locale);
  const rowId = `guzide-product-row-${section.key}`;
  const allProducts = <Link href={destination}>Tümünü gör <span aria-hidden="true">→</span></Link>;
  return (
    <section className={styles.productRow} id={visualTheme ? rowId : undefined} data-campaign-product-row aria-labelledby={`campaign-row-${section.key}`}>
      <div className={styles.sectionHeading} data-campaign-section-heading>
        <div><span>{section.source === "sale" ? "FIRSATLAR" : section.source === "category" ? "KOLEKSİYON" : "YENİ GELENLER"}</span><h2 id={`campaign-row-${section.key}`}>{section.heading}</h2></div>
        {visualTheme ? <div className="guzide-rail-actions">{allProducts}<GuzideRailControls rowId={rowId} label={section.heading} /></div> : allProducts}
      </div>
      <ProductGrid products={products} preserveOrder={section.source === "category"} locale={locale} cardStyle={presentation.visual.productCardStyle} imageRatio={presentation.visual.productImageRatio} />
    </section>
  );
}
