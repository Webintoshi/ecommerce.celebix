import type { CampaignHomeProjection } from "@celebix/saas-data";
import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { StorefrontDesignRenderer } from "@celebix/storefront-design-ui";
import Link from "next/link";

import { StorefrontFrame } from "./StorefrontFrame";
import { CampaignProductRow } from "./CampaignProductRow";
import { CampaignSectionContent } from "./CampaignSectionContent";
import {
  campaignHomeSectionKey,
  composeCampaignHomeSections,
} from "./campaign-home-sections";
import { campaignAnnouncement } from "./campaign-ui-model";
import { localizePublicStorefrontDesign, localizeStorefrontPath } from "@/lib/storefront-routes.ts";
import styles from "./campaign-home.module.css";

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
        <CampaignSectionContent
          key={campaignHomeSectionKey(section, index)}
          section={section}
          presentation={presentation}
          productRows={projection.productRows}
          locale={storefront.locale}
          renderProductRow={(input) => <CampaignProductRow {...input} />}
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
