import {
  type PublicStorefront,
  type PublicStorefrontDesign,
} from "@celebix/saas-contracts";
import { lilyumLogoFor } from "../../themes/lilyum/logo.ts";

export type AccountAuthBranding = Readonly<{
  displayName: string;
  logo: Readonly<{
    url: string;
    altText: string;
    width: number;
    height: number;
  }> | null;
}>;

export function resolveAccountAuthBranding(
  storefront: PublicStorefront,
  design: PublicStorefrontDesign,
): AccountAuthBranding {
  const customized = design.publicationVersion > 1;
  const presentationLogo = storefront.presentation.logo;
  const publishedLogo = customized ? design.brand.logo : null;
  const logo = publishedLogo
    ? Object.freeze({
        url: publishedLogo.url,
        altText: publishedLogo.altText || `${storefront.presentation.displayName} logosu`,
        width: 180,
        height: 48,
      })
    : presentationLogo
      ? Object.freeze({
          url: presentationLogo.url,
          altText: presentationLogo.altText,
          width: presentationLogo.width,
          height: presentationLogo.height,
        })
      : null;
  return Object.freeze({
    displayName: storefront.presentation.displayName,
    logo: lilyumLogoFor(storefront, logo),
  });
}
