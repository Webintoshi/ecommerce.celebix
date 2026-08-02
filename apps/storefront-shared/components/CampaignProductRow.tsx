import Link from "next/link";
import type { PublicProduct, PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

import { ProductGrid } from "./ProductGrid";
import styles from "./campaign-home.module.css";

type ProductRowSection = Extract<PublicStarterHomeSection, { kind: "product_row" }>;

export function CampaignProductRow({ section, products, presentation }: Readonly<{ section: ProductRowSection; products: readonly PublicProduct[]; presentation: PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3 }>) {
  if (!products.length) return null;
  const destination = section.source === "category" && section.categorySlug ? `/categories/${section.categorySlug}` : "/products";
  return <section className={styles.productRow} aria-labelledby={`campaign-row-${section.key}`}><div className={styles.sectionHeading}><div><span>{section.source === "sale" ? "FIRSATLAR" : section.source === "category" ? "KOLEKSİYON" : "YENİ GELENLER"}</span><h2 id={`campaign-row-${section.key}`}>{section.heading}</h2></div><Link href={destination}>Tümünü gör <span aria-hidden="true">→</span></Link></div><ProductGrid products={products} cardStyle={presentation.visual.productCardStyle} imageRatio={presentation.visual.productImageRatio} /></section>;
}
