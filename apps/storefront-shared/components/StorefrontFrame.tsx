import { starterThemeTokens, type PublicStorefront } from "@celebix/saas-contracts";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { CartStatusProvider } from "./CartStatusProvider";
import { FavoriteStatusProvider } from "./FavoriteStatusProvider";

export function StorefrontFrame({ storefront, children }: { storefront: PublicStorefront; children: React.ReactNode }) {
  const tokens = starterThemeTokens(storefront.presentation);
  const campaignClass = storefront.presentation.schemaVersion === 2 ? " campaign-storefront" : "";
  return <CartStatusProvider><FavoriteStatusProvider><div className={`starter-storefront${campaignClass} ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}><Header storefront={storefront} /><main>{children}</main><Footer storefront={storefront} /></div></FavoriteStatusProvider></CartStatusProvider>;
}
