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
import { ezmeoThemeFor } from "../themes/ezmeo/theme.ts";
import { guzideThemeFor } from "../themes/guzide/theme.ts";
import { sioraThemeFor } from "../themes/siora/theme.ts";

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
  if (presentation.schemaVersion !== 2 && presentation.schemaVersion !== 3 && presentation.schemaVersion !== 4)
    return null;
  const effective = Object.freeze({ ...storefront, presentation });
  const customized = design.publicationVersion > 1;
  const designHeroActive = design.publicationVersion > 1
    && design.hero.enabled
    && design.hero.slides.length > 0;
  const hasDesignHeading = customized && presentation.schemaVersion !== 4
    && design.hero.enabled && design.hero.slides.some((slide) => slide.desktopImage !== null);
  const siora = Boolean(sioraThemeFor(storefront));
  const announcement = campaignAnnouncement(presentation);
  const sections = composeCampaignHomeSections(presentation, designHeroActive);
  const hasCampaignHeading = sections.some((section) => section.kind === "hero" && section.slides.length > 0);
  const campaignSections = (
    <div className={styles.home} data-campaign-home aria-label="Mağaza ana sayfası" data-empty-home={sections.length === 0 ? "true" : undefined}>
      {sections.map((section, index) => (
        <CampaignSectionContent
          key={campaignHomeSectionKey(section, index)}
          section={section}
          presentation={presentation}
          productRows={projection.productRows}
          locale={storefront.locale}
          priority={index === 0}
          conciseCategoryCards={siora}
          bannerSwipeNavigation={Boolean(ezmeoThemeFor(storefront))}
          renderProductRow={(input) => <CampaignProductRow {...input} visualTheme={guzideThemeFor(storefront)} />}
        />
      ))}
    </div>
  );
  return (
    <StorefrontFrame
      storefront={effective}
      design={design}
      hasAnnouncement={Boolean(announcement)}
    >
      {siora && !hasDesignHeading && !hasCampaignHeading ? <h1 className="sr-only">{presentation.displayName}</h1> : null}
      {customized ? (
        <StorefrontDesignRenderer
          design={localizePublicStorefrontDesign(design, storefront.locale)}
          storeName={presentation.displayName}
          now={new Date()}
          showHeader={false}
          presentation={presentation}
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
