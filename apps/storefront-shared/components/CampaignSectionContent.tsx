import type { ReactNode } from "react";
import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicProduct, PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

import { CampaignHero } from "./CampaignHero";
import { CampaignCategories, CampaignPanels, CampaignStory } from "./CampaignPanels";
import { CampaignTestimonials } from "./CampaignTestimonials";
import { CampaignValuePropositions } from "./CampaignValuePropositions";
import { homepageAvailableProducts } from "./campaign-home-sections";

type CampaignPresentation = PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;
type ProductRow = Extract<PublicStarterHomeSection, { kind: "product_row" }>;

function assertNever(value: never): never {
  throw new TypeError(`campaign_section_unreachable:${String(value)}`);
}

export function CampaignSectionContent({ section, presentation, productRows, locale, renderProductRow, prefetch }: Readonly<{
  section: PublicStarterHomeSection;
  presentation: CampaignPresentation;
  productRows: CampaignHomeProjection["productRows"];
  locale: string;
  prefetch?: boolean;
  renderProductRow: (input: Readonly<{ section: ProductRow; products: readonly PublicProduct[]; presentation: CampaignPresentation; locale: string }>) => ReactNode;
}>) {
  switch (section.kind) {
    case "hero": return section.slides.length ? <CampaignHero section={section} locale={locale} prefetch={prefetch} /> : null;
    case "category_grid": return section.items.length ? <CampaignCategories section={section} locale={locale} prefetch={prefetch} /> : null;
    case "product_row": {
      const products = homepageAvailableProducts(productRows.find((row) => row.key === section.key)?.items);
      return products.length ? renderProductRow({ section, products, presentation, locale }) : null;
    }
    case "split_campaign": return section.panels.length ? <CampaignPanels section={section} locale={locale} prefetch={prefetch} /> : null;
    case "brand_story": return <CampaignStory section={section} locale={locale} prefetch={prefetch} />;
    case "value_propositions": return section.items.length ? <CampaignValuePropositions section={section} /> : null;
    case "testimonials": return section.items.length ? <CampaignTestimonials section={section} /> : null;
    default: return assertNever(section);
  }
}
