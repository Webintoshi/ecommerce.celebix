import { starterThemeTokens, type PublicStorefront } from "@celebix/saas-contracts";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { CartStatusProvider } from "./CartStatusProvider";
import { FavoriteStatusProvider } from "./FavoriteStatusProvider";

export function StorefrontFrame({ storefront, children }: { storefront: PublicStorefront; children: React.ReactNode }) {
  const tokens = starterThemeTokens(storefront.presentation);
  return <CartStatusProvider><FavoriteStatusProvider><div className={`starter-storefront ${tokens.schemeClass} ${tokens.headingClass} ${tokens.cardClass} ${tokens.imageClass}`}><Header storefront={storefront} /><main>{children}</main><Footer storefront={storefront} /></div></FavoriteStatusProvider></CartStatusProvider>;
}
