import {
  starterThemeTokens,
  type PublicStorefront,
  type PublicStorefrontDesign,
} from "@celebix/saas-contracts";

export type AccountAuthBranding = Readonly<{
  displayName: string;
  logo: Readonly<{
    url: string;
    altText: string;
    width: number;
    height: number;
  }> | null;
  publicationVersion: number;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: PublicStorefrontDesign["brand"]["fontFamily"];
  themeClasses: string;
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
  const tokens = starterThemeTokens(storefront.presentation);

  return Object.freeze({
    displayName: storefront.presentation.displayName,
    logo,
    publicationVersion: design.publicationVersion,
    primaryColor: design.brand.primaryColor,
    accentColor: design.brand.accentColor,
    backgroundColor: design.brand.backgroundColor,
    textColor: design.brand.textColor,
    fontFamily: design.brand.fontFamily,
    themeClasses: `${tokens.schemeClass} ${tokens.headingClass}`,
  });
}
