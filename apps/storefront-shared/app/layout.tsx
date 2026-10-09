import type { Metadata } from "next";
import { headers } from "next/headers";
import { createStorefrontTypographyResources } from "@celebix/storefront-design-ui";

import { StorefrontAnalyticsTracker } from "../components/StorefrontAnalyticsTracker.tsx";
import { StorefrontAnalyticsBridge } from "../components/StorefrontAnalyticsBridge.tsx";
import { resolveStorefrontPage } from "../lib/page-context.ts";
import { StorefrontFrame } from "../components/StorefrontFrame";
import { StorefrontNavigationScroll } from "../components/StorefrontNavigationScroll";
import { ContactWidget } from "../components/ContactWidget";
import { GoogleMarketingConsent } from "../components/GoogleMarketingConsent.tsx";
import { hasGoogleMarketingTags } from "../lib/google-marketing.ts";
import { StoreEngagement } from "../components/StoreEngagement";
import { guzideThemeFor } from "../themes/guzide/theme.ts";
import { lilyumLogoFor } from "../themes/lilyum/logo.ts";
import "./globals.css";
import "../themes/siora/siora.css";
import "../themes/siora/siora-mobile.css";
import "../themes/alpler/alpler.css";
import "../themes/alpler/alpler-mobile.css";
import "../themes/guzide/guzide.css";
import "../themes/guzide/guzide-footer.css";
import "../themes/lilyum/lilyum.css";
import "../themes/lilyum/lilyum-product.css";
import "../components/checkout/checkout.css";
import "../components/google-marketing-consent.css";

export const metadata: Metadata = {
  title: "Celebix Mağaza",
  description: "Celebix ortak mağaza deneyimi",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [page, requestHeaders] = await Promise.all([resolveStorefrontPage(), headers()]);
  const tracker = page.kind === "active" ? page.context.tracker : null;
  const locale = page.kind === "active" ? page.context.storefront.locale : "tr";
  const nonce = requestHeaders.get("x-nonce") ?? "";
  const googleMarketing = page.kind === "active" ? page.context.googleMarketing : null;
  const contactBrand = page.kind === "active" && page.context.contactWidget?.enabled ? {
    logo: lilyumLogoFor(page.context.storefront, page.context.design.publicationVersion > 1
      ? page.context.design.brand.logo ?? page.context.storefront.presentation.logo
      : page.context.storefront.presentation.logo),
    fontFamily: createStorefrontTypographyResources(page.context.design.typography).style["--store-body-font"],
  } : null;
  return (
    <html lang={locale} data-scroll-behavior={page.kind === "active" && guzideThemeFor(page.context.storefront) ? "smooth" : undefined}>
      <head>{googleMarketing?.verificationToken ? <meta name="google-site-verification" content={googleMarketing.verificationToken} /> : null}</head>
      <body>
        {page.kind === "active" && googleMarketing && nonce && hasGoogleMarketingTags(googleMarketing) ? <GoogleMarketingConsent storeId={page.context.storefront.id} hostname={page.context.storefront.primaryHostname} nonce={nonce} projection={googleMarketing} preferencesPlacement={guzideThemeFor(page.context.storefront) ? "footer" : "floating"} /> : null}
        {page.kind === "active" && guzideThemeFor(page.context.storefront)
          ? <StorefrontFrame storefront={page.context.storefront} design={page.context.design} persistentGuzide>{children}</StorefrontFrame>
          : children}
        <StorefrontNavigationScroll />
        {page.kind === "active" ? <StoreEngagement storefrontId={page.context.storefront.id} storefrontName={page.context.storefront.presentation.displayName} brandColor={page.context.design.brand.primaryColor} /> : null}
        {page.kind === "active" && page.context.contactWidget?.enabled && contactBrand ? <ContactWidget config={page.context.contactWidget} storefrontName={page.context.storefront.presentation.displayName} brandColor={page.context.design.brand.primaryColor} hostname={page.context.storefront.primaryHostname} logo={contactBrand.logo} fontFamily={contactBrand.fontFamily} /> : null}
        {tracker && nonce ? <><StorefrontAnalyticsBridge websiteId={tracker.websiteId} hostname={tracker.hostname} /><StorefrontAnalyticsTracker {...tracker} nonce={nonce} /></> : null}
      </body>
    </html>
  );
}
