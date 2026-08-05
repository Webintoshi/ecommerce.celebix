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
  brandForeground: "#000000" | "#FFFFFF";
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: PublicStorefrontDesign["brand"]["fontFamily"];
  themeClasses: string;
}>;

function foregroundFor(background: string): "#000000" | "#FFFFFF" {
  if (!/^#[0-9a-f]{6}$/iu.test(background)) return "#000000";
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (channels[0] ?? 0) * 0.2126 +
    (channels[1] ?? 0) * 0.7152 +
    (channels[2] ?? 0) * 0.0722;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#FFFFFF";
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
    brandForeground: foregroundFor(design.brand.primaryColor),
    accentColor: design.brand.accentColor,
    backgroundColor: design.brand.backgroundColor,
    textColor: design.brand.textColor,
    fontFamily: design.brand.fontFamily,
    themeClasses: `${tokens.schemeClass} ${tokens.headingClass}`,
  });
}
