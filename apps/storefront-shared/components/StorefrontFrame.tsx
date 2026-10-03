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
import { sioraThemeFor } from "../themes/siora/theme.ts";
import { alplerThemeFor } from "../themes/alpler/theme.ts";
import { lilyumThemeFor } from "../themes/lilyum/theme.ts";
import { lilyumBrandTokens } from "../themes/lilyum/lilyum-model.ts";
import { GuzideClientFrame, GuzidePageBoundary } from "../themes/guzide/GuzideMobileExperience";
import { CheckoutHeader } from "./checkout/CheckoutChrome";

type DesignStyle = CSSProperties & Record<`--store-${string}`, string>;

export function StorefrontFrame({
  storefront,
  design,
  children,
  hasAnnouncement = false,
  checkout = false,
  immersiveProduct = false,
  persistentGuzide = false,
}: {
  storefront: PublicStorefront;
  design: PublicStorefrontDesign;
  children: React.ReactNode;
  hasAnnouncement?: boolean;
  checkout?: boolean;
  immersiveProduct?: boolean;
  persistentGuzide?: boolean;
}) {
  const tokens = starterThemeTokens(storefront.presentation);
  const campaign = campaignFrameSettings(storefront.presentation);
  const customized = design.publicationVersion > 1;
  const typography = createStorefrontTypographyResources(design.typography);
  const guzideTheme = guzideThemeFor(storefront);
  const visualTheme = lilyumThemeFor(storefront) ?? alplerThemeFor(storefront) ?? sioraThemeFor(storefront) ?? guzideTheme;
  const immersiveSiora = immersiveProduct && Boolean(sioraThemeFor(storefront)) && !checkout;
  const logo = customized ? (design.brand.logo ?? storefront.presentation.logo) : storefront.presentation.logo;
  const style: DesignStyle = {
    ...typography.style,
    "--store-section-spacing": (storefront.presentation.schemaVersion !== 3 && storefront.presentation.schemaVersion !== 4) ? "clamp(64px, 7vw, 112px)" : storefront.presentation.visual.sectionSpacing === "compact" ? "40px" : storefront.presentation.visual.sectionSpacing === "airy" ? "112px" : "clamp(64px, 7vw, 112px)",
    ...(customized ? {
        "--store-primary": design.brand.primaryColor,
        "--store-accent": design.brand.accentColor,
        "--store-background": design.brand.backgroundColor,
        "--store-text": design.brand.textColor,
      } : {}),
    ...(lilyumThemeFor(storefront) ? lilyumBrandTokens(design) : {}),
  };
  const typographyLinks = <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    <link rel="stylesheet" href={typography.stylesheetUrl} />
  </>;
  const legacyContent = (
          <div
            className={`starter-storefront ${campaign.campaignClass} ${campaign.cornerClass} ${hasAnnouncement ? "has-announcement" : ""} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}
            data-published-design={customized ? "true" : "false"}
            data-storefront-theme={visualTheme}
            data-storefront-checkout={checkout ? "true" : undefined}
            data-siora-product={immersiveSiora ? "true" : undefined}
            data-font={customized ? design.brand.fontFamily : undefined}
            style={style}
          >
            {checkout ? <CheckoutHeader storefront={storefront} logo={logo} /> : <Header storefront={storefront} design={design} />}
            <main>{children}</main>
            <Footer storefront={storefront} logo={logo} checkout={checkout} />
          </div>
  );
  const legacy = <>{typographyLinks}
    <CartStatusProvider presentation={campaign.cart} locale={storefront.locale} visualTheme={visualTheme} storefrontId={storefront.id}>
      <FavoriteStatusProvider>{legacyContent}</FavoriteStatusProvider>
    </CartStatusProvider>
  </>;
  if (guzideTheme && persistentGuzide) return <>
    {typographyLinks}
    <CartStatusProvider presentation={campaign.cart} locale={storefront.locale} visualTheme={visualTheme} storefrontId={storefront.id}>
      <FavoriteStatusProvider>
        <GuzideClientFrame storefrontId={storefront.id} locale={storefront.locale}
          className={`starter-storefront ${campaign.campaignClass} ${campaign.cornerClass} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}
          style={style} publishedDesign={customized ? "true" : "false"} font={customized ? design.brand.fontFamily : undefined}
          header={<Header storefront={storefront} design={design} />} checkoutHeader={<CheckoutHeader storefront={storefront} logo={logo} />}
          footer={<Footer storefront={storefront} logo={logo} />} checkoutFooter={<Footer storefront={storefront} logo={logo} checkout />}>
          {children}
        </GuzideClientFrame>
      </FavoriteStatusProvider>
    </CartStatusProvider>
  </>;
  return guzideTheme ? <GuzidePageBoundary fallback={legacy} standaloneFrame={<>{typographyLinks}{legacyContent}</>}>{children}</GuzidePageBoundary> : legacy;
}
