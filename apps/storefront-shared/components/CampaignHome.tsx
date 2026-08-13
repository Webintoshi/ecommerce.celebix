import type { CampaignHomeProjection } from "@celebix/saas-data";
import type {
  PublicStarterHomeSection,
  PublicStarterThemePresentationV2,
  PublicStarterThemePresentationV3,
  PublicStorefront,
  PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { StorefrontDesignRenderer } from "@celebix/storefront-design-ui";
import Link from "next/link";

import { StorefrontFrame } from "./StorefrontFrame";
import { CampaignHero } from "./CampaignHero";
import {
  CampaignCategories,
  CampaignPanels,
  CampaignStory,
} from "./CampaignPanels";
import { CampaignProductRow } from "./CampaignProductRow";
import { CampaignTestimonials } from "./CampaignTestimonials";
import { CampaignValuePropositions } from "./CampaignValuePropositions";
import { campaignHomeSectionKey, composeCampaignHomeSections } from "./campaign-home-sections";
import { campaignAnnouncement } from "./campaign-ui-model";
import { localizePublicStorefrontDesign, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import styles from "./campaign-home.module.css";

function assertNever(value: never): never {
  throw new TypeError(`campaign_section_unreachable:${String(value)}`);
}

type CampaignPresentation =
  | PublicStarterThemePresentationV2
  | PublicStarterThemePresentationV3;

function Section({
  section,
  presentation,
  productRows,
  locale,
}: Readonly<{
  section: PublicStarterHomeSection;
  presentation: CampaignPresentation;
  productRows: CampaignHomeProjection["productRows"];
  locale: string;
}>) {
  switch (section.kind) {
    case "hero":
      return section.slides.length ? <CampaignHero section={section} locale={locale} /> : null;
    case "category_grid":
      return section.items.length ? (
        <CampaignCategories section={section} locale={locale} />
      ) : null;
    case "product_row":
      const products = productRows.find((row) => row.key === section.key)?.items ?? [];
      return products.length ? (
        <CampaignProductRow
          section={section}
          products={products}
          presentation={presentation}
          locale={locale}
        />
      ) : null;
    case "split_campaign":
      return section.panels.length ? (
        <CampaignPanels section={section} locale={locale} />
      ) : null;
    case "brand_story":
      return <CampaignStory section={section} locale={locale} />;
    case "value_propositions":
      return section.items.length ? (
        <CampaignValuePropositions section={section} />
      ) : null;
    case "testimonials":
      return section.items.length ? (
        <CampaignTestimonials section={section} />
      ) : null;
    default:
      return assertNever(section);
  }
}

export function CampaignHome({
  storefront,
  design,
  projection,
}: Readonly<{
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
  projection: CampaignHomeProjection;
}>) {
  const presentation = projection.presentation;
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3)
    return null;
  const effective = Object.freeze({ ...storefront, presentation });
  const customized = design.publicationVersion > 1;
  const designHeroActive = design.publicationVersion > 1
    && design.hero.enabled
    && design.hero.slides.length > 0;
  const announcement = campaignAnnouncement(presentation);
  const sections = composeCampaignHomeSections(presentation, designHeroActive);
  const campaignSections = (
    <div className={styles.home} aria-label="Mağaza ana sayfası" data-empty-home={sections.length === 0 ? "true" : undefined}>
      {sections.map((section, index) => (
        <Section
          key={campaignHomeSectionKey(section, index)}
          section={section}
          presentation={presentation}
          productRows={projection.productRows}
          locale={storefront.locale}
        />
      ))}
    </div>
  );
  return (
    <StorefrontFrame
      storefront={effective}
      design={design}
      hasAnnouncement={customized ? design.announcement.enabled : Boolean(announcement)}
    >
      {customized ? (
        <StorefrontDesignRenderer
          design={localizePublicStorefrontDesign(design, storefront.locale)}
          storeName={presentation.displayName}
          now={new Date()}
          showHeader={false}
        >
          {campaignSections}
        </StorefrontDesignRenderer>
      ) : (
        <>
          {announcement ? (
            <aside className={styles.announcement} aria-label="Mağaza duyuruları">
              {announcement.destination ? (
                <Link href={localizeStorefrontPath(announcement.destination, storefront.locale)}>{announcement.text}</Link>
              ) : (
                announcement.text
              )}
            </aside>
          ) : null}
          {campaignSections}
        </>
      )}
    </StorefrontFrame>
  );
}
