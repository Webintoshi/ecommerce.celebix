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
import { Fragment } from "react";

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
import { JewelryCategoryPlaceholders } from "./JewelryCategoryPlaceholders";
import { campaignAnnouncement } from "./campaign-ui-model";
import { deriveJewelryCategoryPlaceholders } from "./jewelry-category-placeholders";
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
}: Readonly<{
  section: PublicStarterHomeSection;
  presentation: CampaignPresentation;
  productRows: CampaignHomeProjection["productRows"];
}>) {
  switch (section.kind) {
    case "hero":
      return section.slides.length ? <CampaignHero section={section} /> : null;
    case "category_grid":
      return section.items.length ? (
        <CampaignCategories section={section} />
      ) : null;
    case "product_row":
      return (
        <CampaignProductRow
          section={section}
          products={
            productRows.find((row) => row.key === section.key)?.items ?? []
          }
          presentation={presentation}
        />
      );
    case "split_campaign":
      return section.panels.length ? (
        <CampaignPanels section={section} />
      ) : null;
    case "brand_story":
      return <CampaignStory section={section} />;
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
  const sections = designHeroActive
    ? presentation.sections.filter((section) => section.kind !== "hero")
    : presentation.sections;
  const categoryPlaceholders = deriveJewelryCategoryPlaceholders(presentation.navigation, sections);
  const supportingStart = sections.findIndex(
    ({ kind }) => kind === "value_propositions" || kind === "testimonials",
  );
  const placeholderIndex =
    supportingStart === -1 ? sections.length : supportingStart;
  const campaignSections = (
    <div className={styles.home}>
      {sections.map((section, index) => (
        <Fragment key={`${section.kind}-${index}`}>
          {index === placeholderIndex ? (
            <JewelryCategoryPlaceholders items={categoryPlaceholders} />
          ) : null}
          <Section
            section={section}
            presentation={presentation}
            productRows={projection.productRows}
          />
        </Fragment>
      ))}
      {placeholderIndex === sections.length ? (
        <JewelryCategoryPlaceholders items={categoryPlaceholders} />
      ) : null}
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
          design={design}
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
                <Link href={announcement.destination}>{announcement.text}</Link>
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
