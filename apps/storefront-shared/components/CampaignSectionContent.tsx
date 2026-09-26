import type { ReactNode } from "react";
import type { PublicProduct, PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

import { CampaignHero } from "./CampaignHero";
import { CampaignCategories, CampaignPanels, CampaignStory } from "./CampaignPanels";
import { CampaignTestimonials } from "./CampaignTestimonials";
import { CampaignValuePropositions } from "./CampaignValuePropositions";
import { homepageAvailableProducts } from "./campaign-home-sections";
import styles from "./campaign-home.module.css";

type CampaignPresentation = PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;
type ProductRow = Extract<PublicStarterHomeSection, { kind: "product_row" }>;
type CampaignCardProduct = Readonly<{ available: boolean }>;

function assertNever(value: never): never {
  throw new TypeError(`campaign_section_unreachable:${String(value)}`);
}

export function CampaignSectionContent<Product extends CampaignCardProduct = PublicProduct>({ section, presentation, productRows, locale, renderProductRow, prefetch, previewMode }: Readonly<{
  section: PublicStarterHomeSection;
  presentation: CampaignPresentation;
  productRows: readonly Readonly<{ key: string; items: readonly Product[] }>[];
  locale: string;
  prefetch?: boolean;
  previewMode?: "desktop" | "mobile";
  renderProductRow: (input: Readonly<{ section: ProductRow; products: readonly Product[]; presentation: CampaignPresentation; locale: string }>) => ReactNode;
}>) {
  const present = (content: ReactNode) => previewMode === "mobile" && content !== null
    ? <div className={styles.mobilePreview} data-campaign-preview-mode="mobile">{content}</div>
    : content;
  switch (section.kind) {
    case "hero": return present(section.slides.length ? <CampaignHero section={section} locale={locale} prefetch={prefetch} previewMode={previewMode} /> : null);
    case "category_grid": return present(section.items.length ? <CampaignCategories section={section} locale={locale} prefetch={prefetch} /> : null);
    case "product_row": {
      const products = homepageAvailableProducts(productRows.find((row) => row.key === section.key)?.items);
      return present(products.length ? renderProductRow({ section, products, presentation, locale }) : null);
    }
    case "split_campaign": return present(section.panels.length ? <CampaignPanels section={section} locale={locale} prefetch={prefetch} /> : null);
    case "brand_story": return present(<CampaignStory section={section} locale={locale} prefetch={prefetch} />);
    case "value_propositions": return present(section.items.length ? <CampaignValuePropositions section={section} /> : null);
    case "testimonials": return present(section.items.length ? <CampaignTestimonials section={section} /> : null);
    default: return assertNever(section);
  }
}
