import type { CSSProperties } from "react";
import {
  starterThemeTokens,
  type PublicStorefront,
  type PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { CartStatusProvider } from "./CartStatusProvider";
import { FavoriteStatusProvider } from "./FavoriteStatusProvider";
import { campaignFrameSettings } from "./campaign-ui-model";

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
  const style: DesignStyle | undefined = customized
    ? {
        "--store-primary": design.brand.primaryColor,
        "--store-accent": design.brand.accentColor,
        "--store-background": design.brand.backgroundColor,
        "--store-text": design.brand.textColor,
      }
    : undefined;
  return (
    <CartStatusProvider presentation={campaign.cart}>
      <FavoriteStatusProvider>
        <div
          className={`starter-storefront ${campaign.campaignClass} ${campaign.cornerClass} ${hasAnnouncement ? "has-announcement" : ""} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}
          data-published-design={customized ? "true" : "false"}
          data-font={customized ? design.brand.fontFamily : undefined}
          style={style}
        >
          <Header storefront={storefront} design={design} />
          <main>{children}</main>
          <Footer storefront={storefront} />
        </div>
      </FavoriteStatusProvider>
    </CartStatusProvider>
  );
}
