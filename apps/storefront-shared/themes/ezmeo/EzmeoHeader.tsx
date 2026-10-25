import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";
import { EzmeoHeaderClient } from "./EzmeoHeaderClient";

export function EzmeoHeader({ storefront, design }: Readonly<{
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
}>) {
  const presentation = storefront.presentation;
  const visual = presentation.schemaVersion === 1 ? undefined : presentation.visual;
  return <EzmeoHeaderClient
    displayName={presentation.displayName}
    locale={storefront.locale}
    logo={design.publicationVersion > 1 ? design.brand.logo ?? presentation.logo : presentation.logo}
    navigation={presentation.schemaVersion === 1 ? [] : presentation.navigation.items}
    layout={presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerLayout : "menu_logo_actions"}
    width={presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerWidth : "wide"}
    style={visual?.headerStyle ?? "solid"}
  />;
}
