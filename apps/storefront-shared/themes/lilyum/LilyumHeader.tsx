import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { LilyumHeaderClient } from "./LilyumHeaderClient";
import { lilyumAnnouncement } from "./lilyum-model.ts";
import { lilyumLogoFor } from "./logo.ts";

export function LilyumHeader({ storefront, design }: { storefront: PublicStorefront; design: PublicStorefrontDesign }) {
  const presentation = storefront.presentation;
  return <LilyumHeaderClient displayName={presentation.displayName} locale={storefront.locale}
    logo={lilyumLogoFor(storefront, design.publicationVersion > 1 ? design.brand.logo ?? presentation.logo : presentation.logo)}
    navigation={presentation.schemaVersion === 1 ? [] : presentation.navigation.items}
    announcement={lilyumAnnouncement(presentation, design)} />;
}
