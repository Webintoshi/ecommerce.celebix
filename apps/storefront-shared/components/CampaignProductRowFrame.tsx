import type { ReactNode } from "react";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";
import Link from "next/link";

import { categoryPath, productIndexPath } from "../lib/storefront-routes.ts";
import type { ProductCardContentProduct } from "./ProductCardContent";
import { GuzideRailControls } from "../themes/guzide/GuzideRailControls";
import type { GuzideVisualTheme } from "../themes/guzide/theme.ts";
import styles from "./campaign-home.module.css";

type ProductRowSection = Extract<PublicStarterHomeSection, { kind: "product_row" }>;

export function CampaignProductRowFrame({ section, products, locale, visualTheme, renderProductGrid, prefetch }: Readonly<{
  section: ProductRowSection;
  products: readonly ProductCardContentProduct[];
  locale: string;
  visualTheme?: GuzideVisualTheme;
  prefetch?: boolean;
  renderProductGrid: (products: readonly ProductCardContentProduct[]) => ReactNode;
}>) {
  if (!products.length) return null;
  const destination = section.source === "category" && section.categorySlug
    ? categoryPath(locale, section.categorySlug)
    : productIndexPath(locale);
  const rowId = `guzide-product-row-${section.key}`;
  const allProducts = <Link href={destination} prefetch={prefetch}>Tümünü gör <span aria-hidden="true">→</span></Link>;
  return (
    <section className={styles.productRow} id={visualTheme ? rowId : undefined} data-campaign-product-row aria-labelledby={`campaign-row-${section.key}`}>
      <div className={styles.sectionHeading} data-campaign-section-heading>
        <div><span>{section.source === "sale" ? "FIRSATLAR" : section.source === "category" ? "KOLEKSİYON" : section.source === "manual" ? "SEÇKİ" : "YENİ GELENLER"}</span><h2 id={`campaign-row-${section.key}`}>{section.heading}</h2></div>
        {visualTheme ? <div className="guzide-rail-actions">{allProducts}<GuzideRailControls rowId={rowId} label={section.heading} /></div> : allProducts}
      </div>
      {renderProductGrid(products)}
    </section>
  );
}
