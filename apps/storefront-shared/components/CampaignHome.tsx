import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicStarterHomeSection, PublicStorefront } from "@celebix/saas-contracts";
import Link from "next/link";

import { StorefrontFrame } from "./StorefrontFrame";
import { CampaignHero } from "./CampaignHero";
import { CampaignCategories, CampaignPanels, CampaignStory } from "./CampaignPanels";
import { CampaignProductRow } from "./CampaignProductRow";
import { campaignAnnouncement } from "./campaign-ui-model";
import styles from "./campaign-home.module.css";

function assertNever(value: never): never { throw new TypeError(`campaign_section_unreachable:${String(value)}`); }

function Section({ section, projection }: Readonly<{ section: PublicStarterHomeSection; projection: CampaignHomeProjection }>) {
  switch (section.kind) {
    case "hero": return section.slides.length ? <CampaignHero section={section} /> : null;
    case "category_grid": return section.items.length ? <CampaignCategories section={section} /> : null;
    case "product_row": return <CampaignProductRow section={section} products={projection.productRows.find((row) => row.key === section.key)?.items ?? []} presentation={projection.presentation} />;
    case "split_campaign": return section.panels.length ? <CampaignPanels section={section} /> : null;
    case "brand_story": return <CampaignStory section={section} />;
    default: return assertNever(section);
  }
}

export function CampaignHome({ storefront, projection }: Readonly<{ storefront: PublicStorefront; projection: CampaignHomeProjection }>) {
  const effective = Object.freeze({ ...storefront, presentation: projection.presentation });
  const announcement = campaignAnnouncement(projection.presentation);
  return <StorefrontFrame storefront={effective}>{announcement ? <aside className={styles.announcement} aria-label="Mağaza duyuruları">{announcement.destination ? <Link href={announcement.destination}>{announcement.text}</Link> : announcement.text}</aside> : null}<div className={styles.home}>{projection.presentation.sections.map((section, index) => <Section key={`${section.kind}-${index}`} section={section} projection={projection} />)}</div></StorefrontFrame>;
}
