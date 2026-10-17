import type { PublicStorefront, PublicStorefrontDesign } from "@celebix/saas-contracts";

import { SioraHeaderContent } from "./SioraHeaderContent";
import { SioraMobileShell } from "./SioraMobileShell";
import { SioraHeaderChrome } from "./SioraHeaderChrome";
import { SioraHeaderActions, SioraHeaderSearch } from "./SioraHeaderActions";

export function SioraHeader({ storefront, design }: Readonly<{ storefront: PublicStorefront; design: PublicStorefrontDesign }>) {
  const { presentation, locale } = storefront;
  const logo = design.publicationVersion > 1 ? (design.brand.logo ?? presentation.logo) : presentation.logo;
  const navigation = presentation.schemaVersion === 1 ? { items: [] } : presentation.navigation;
  const visual = presentation.schemaVersion === 1 ? null : presentation.visual;
  const headerWidth = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerWidth : "wide";
  const headerLayout = presentation.schemaVersion === 3 || presentation.schemaVersion === 4 ? presentation.visual.headerLayout : "menu_logo_actions";

  return <SioraHeaderChrome headerStyle={visual?.headerStyle ?? "solid"} headerWidth={headerWidth} headerLayout={headerLayout}>
    <SioraHeaderContent storefront={storefront} design={design} search={<SioraHeaderSearch />} actions={<SioraHeaderActions />} mobileMenu={<SioraMobileShell storefrontId={storefront.id} locale={locale} displayName={presentation.displayName} navigation={navigation} />} />
  </SioraHeaderChrome>;
}
