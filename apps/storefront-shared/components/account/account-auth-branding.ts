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

export function accountAuthButtonTextColor(background: string): "#000000" | "#FFFFFF" {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(background.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return luminance >= Math.sqrt(1.05 * 0.05) - 0.05 ? "#000000" : "#FFFFFF";
}

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
