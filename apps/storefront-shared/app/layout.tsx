import type { Metadata } from "next";
import { headers } from "next/headers";

import { StorefrontAnalyticsTracker } from "../components/StorefrontAnalyticsTracker.tsx";
import { StorefrontAnalyticsBridge } from "../components/StorefrontAnalyticsBridge.tsx";
import { resolveStorefrontPage } from "../lib/page-context.ts";
import { StorefrontFrame } from "../components/StorefrontFrame";
import { ContactWidget } from "../components/ContactWidget";
import { guzideThemeFor } from "../themes/guzide/theme.ts";
import "./globals.css";
import "../themes/siora/siora.css";
import "../themes/siora/siora-mobile.css";
import "../themes/alpler/alpler.css";
import "../themes/alpler/alpler-mobile.css";
import "../themes/guzide/guzide.css";
import "../themes/guzide/guzide-footer.css";
import "../themes/lilyum/lilyum.css";
import "../components/checkout/checkout.css";

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
  return (
    <html lang={locale} data-scroll-behavior={page.kind === "active" && guzideThemeFor(page.context.storefront) ? "smooth" : undefined}>
      <body>
        {page.kind === "active" && guzideThemeFor(page.context.storefront)
          ? <StorefrontFrame storefront={page.context.storefront} design={page.context.design} persistentGuzide>{children}</StorefrontFrame>
          : children}
        {page.kind === "active" && page.context.contactWidget?.enabled ? <ContactWidget config={page.context.contactWidget} storefrontName={page.context.storefront.presentation.displayName} brandColor={page.context.design.brand.primaryColor} hostname={page.context.storefront.primaryHostname} /> : null}
        {tracker && nonce ? <><StorefrontAnalyticsBridge websiteId={tracker.websiteId} hostname={tracker.hostname} /><StorefrontAnalyticsTracker {...tracker} nonce={nonce} /></> : null}
      </body>
    </html>
  );
}
