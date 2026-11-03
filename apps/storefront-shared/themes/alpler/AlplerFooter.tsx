import type { ReactNode } from "react";
import type { PublicDesignMedia, PublicStarterThemePresentationV3, PublicStarterThemePresentationV4, PublicStorefront } from "@celebix/saas-contracts";
import { RetailFooter } from "../../components/RetailFooter";
import { AlplerCheckoutFooter } from "./AlplerCheckoutChrome";

export function AlplerFooter({ storefront, presentation, groups, logo, checkout = false, signature, renderNewsletter }: Readonly<{
  storefront: PublicStorefront;
  presentation: PublicStarterThemePresentationV3 | PublicStarterThemePresentationV4;
  groups: PublicStarterThemePresentationV3["footer"]["groups"];
  logo?: PublicDesignMedia;
  checkout?: boolean;
  signature?: ReactNode;
  renderNewsletter?: (newsletter: PublicStarterThemePresentationV3["footer"]["newsletter"]) => ReactNode;
  prefetch?: boolean;
}>) {
  if (checkout) return <AlplerCheckoutFooter groups={groups} storefront={storefront} signature={signature} />;
  return <RetailFooter storefront={storefront} presentation={presentation} groups={groups} logo={logo} signature={signature} renderNewsletter={renderNewsletter} />;
}
