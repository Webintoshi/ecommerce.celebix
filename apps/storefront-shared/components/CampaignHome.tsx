import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicStarterHomeSection, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3, PublicStorefront } from "@celebix/saas-contracts";
import Link from "next/link";

import { StorefrontFrame } from "./StorefrontFrame";
import { CampaignHero } from "./CampaignHero";
import { CampaignCategories, CampaignPanels, CampaignStory } from "./CampaignPanels";
import { CampaignProductRow } from "./CampaignProductRow";
import { CampaignTestimonials } from "./CampaignTestimonials";
import { CampaignValuePropositions } from "./CampaignValuePropositions";
import { campaignAnnouncement } from "./campaign-ui-model";
import styles from "./campaign-home.module.css";

function assertNever(value: never): never { throw new TypeError(`campaign_section_unreachable:${String(value)}`); }

type CampaignPresentation = PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;

function Section({ section, presentation, productRows }: Readonly<{ section: PublicStarterHomeSection; presentation: CampaignPresentation; productRows: CampaignHomeProjection["productRows"] }>) {
  switch (section.kind) {
    case "hero": return section.slides.length ? <CampaignHero section={section} /> : null;
    case "category_grid": return section.items.length ? <CampaignCategories section={section} /> : null;
    case "product_row": return <CampaignProductRow section={section} products={productRows.find((row) => row.key === section.key)?.items ?? []} presentation={presentation} />;
    case "split_campaign": return section.panels.length ? <CampaignPanels section={section} /> : null;
    case "brand_story": return <CampaignStory section={section} />;
    case "value_propositions": return section.items.length ? <CampaignValuePropositions section={section} /> : null;
    case "testimonials": return section.items.length ? <CampaignTestimonials section={section} /> : null;
    default: return assertNever(section);
  }
}

export function CampaignHome({ storefront, projection }: Readonly<{ storefront: PublicStorefront; projection: CampaignHomeProjection }>) {
  const presentation = projection.presentation;
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3) return null;
  const effective = Object.freeze({ ...storefront, presentation });
  const announcement = campaignAnnouncement(presentation);
  return <StorefrontFrame storefront={effective} hasAnnouncement={Boolean(announcement)}>{announcement ? <aside className={styles.announcement} aria-label="Mağaza duyuruları">{announcement.destination ? <Link href={announcement.destination}>{announcement.text}</Link> : announcement.text}</aside> : null}<div className={styles.home}>{presentation.sections.map((section, index) => <Section key={`${section.kind}-${index}`} section={section} presentation={presentation} productRows={projection.productRows} />)}</div></StorefrontFrame>;
}
