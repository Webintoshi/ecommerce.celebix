import { starterThemeTokens, type PublicStorefront } from "@celebix/saas-contracts";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { CartStatusProvider } from "./CartStatusProvider";
import { FavoriteStatusProvider } from "./FavoriteStatusProvider";
import { campaignFrameSettings } from "./campaign-ui-model";

export function StorefrontFrame({ storefront, children, hasAnnouncement = false }: { storefront: PublicStorefront; children: React.ReactNode; hasAnnouncement?: boolean }) {
  const tokens = starterThemeTokens(storefront.presentation);
  const campaign = campaignFrameSettings(storefront.presentation);
  return <CartStatusProvider presentation={campaign.cart}><FavoriteStatusProvider><div className={`starter-storefront ${campaign.campaignClass} ${campaign.cornerClass} ${hasAnnouncement ? "has-announcement" : ""} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}><Header storefront={storefront} /><main>{children}</main><Footer storefront={storefront} /></div></FavoriteStatusProvider></CartStatusProvider>;
}
