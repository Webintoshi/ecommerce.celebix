import type { CSSProperties } from "react";
import {
  starterThemeTokens,
  type PublicStorefront,
  type PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { createStorefrontTypographyResources } from "@celebix/storefront-design-ui";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { CartStatusProvider } from "./CartStatusProvider";
import { FavoriteStatusProvider } from "./FavoriteStatusProvider";
import { campaignFrameSettings } from "./campaign-ui-model";
import { guzideThemeFor } from "../themes/guzide/theme.ts";

type DesignStyle = CSSProperties & Record<`--store-${string}`, string>;

export function StorefrontFrame({
  storefront,
  design,
  children,
  hasAnnouncement = false,
}: {
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
  children: React.ReactNode;
  hasAnnouncement?: boolean;
}) {
  const tokens = starterThemeTokens(storefront.presentation);
  const campaign = campaignFrameSettings(storefront.presentation);
  const customized = design.publicationVersion > 1;
  const typography = createStorefrontTypographyResources(design.typography);
  const visualTheme = guzideThemeFor(storefront);
  const style: DesignStyle = {
    ...typography.style,
    "--store-section-spacing": storefront.presentation.schemaVersion !== 3 ? "clamp(64px, 7vw, 112px)" : storefront.presentation.visual.sectionSpacing === "compact" ? "40px" : storefront.presentation.visual.sectionSpacing === "airy" ? "112px" : "clamp(64px, 7vw, 112px)",
    ...(customized ? {
        "--store-primary": design.brand.primaryColor,
        "--store-accent": design.brand.accentColor,
        "--store-background": design.brand.backgroundColor,
        "--store-text": design.brand.textColor,
      } : {}),
  };
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={typography.stylesheetUrl} />
      <CartStatusProvider presentation={campaign.cart} locale={storefront.locale} visualTheme={visualTheme}>
        <FavoriteStatusProvider>
          <div
            className={`starter-storefront ${campaign.campaignClass} ${campaign.cornerClass} ${hasAnnouncement ? "has-announcement" : ""} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}
            data-published-design={customized ? "true" : "false"}
            data-storefront-theme={visualTheme}
            data-font={customized ? design.brand.fontFamily : undefined}
            style={style}
          >
            <Header storefront={storefront} design={design} />
            <main>{children}</main>
            <Footer storefront={storefront} logo={customized ? (design.brand.logo ?? storefront.presentation.logo) : storefront.presentation.logo} />
          </div>
        </FavoriteStatusProvider>
      </CartStatusProvider>
    </>
  );
}
