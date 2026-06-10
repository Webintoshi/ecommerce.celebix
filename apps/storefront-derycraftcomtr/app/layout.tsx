import type { Metadata, Viewport } from "next";
import { Fragment, type CSSProperties } from "react";
import Script from "next/script";
import "./globals.css";
import "@/app/styles/redesign.scss";
import { CartProvider } from "@/lib/cart-context";
import { WishlistProvider } from "@/lib/wishlist-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreInfoProvider } from "@/lib/store-info-context";
import { FloatingContactButton } from "@/components/layout/FloatingContactButton";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import CodeIntegrationMarkup from "@/components/integrations/CodeIntegrationMarkup";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { getCodeIntegrationsSettings, getStoreInfo } from "@/lib/db/settings";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getRequestLocale, getRequestPathname } from "@/lib/request-locale";
import { RTL_LOCALES } from "@/lib/i18n";
import { StorefrontRouteProvider } from "@/lib/storefront-route-context";
import { buildStoreRootMetadata } from "@/lib/seo-metadata";
import { getStorefrontNavigationCategories } from "@/lib/storefront-navigation";
import TrackingProvider from "@/components/TrackingProvider";
import { Toaster } from "sonner";
import PromotionalBannersPreload from "@/components/preload/PromotionalBannersPreload";
import {
  buildStoreTypographyCssVariables,
  buildStoreTypographyStylesheetUrl,
} from "@celebix/platform-config/src/typography";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const pathname = await getRequestPathname();
  return buildStoreRootMetadata(locale, pathname);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
  const pathname = await getRequestPathname();
  const [initialStoreInfo, codeIntegrations, localeRouting, navigationCategories] = await Promise.all([
    getStoreInfo(),
    getCodeIntegrationsSettings(),
    getLocaleRoutingConfig(),
    getStorefrontNavigationCategories(locale),
  ]);
  const gtmId = codeIntegrations.googleTagManagerId || STOREFRONT_RUNTIME.gtmId;
  const metaPixelId = codeIntegrations.metaPixelId;
  const umamiHostUrl = process.env.NEXT_PUBLIC_UMAMI_HOST_URL?.trim() || "";
  const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim() || "";
  const shouldLoadUmami = Boolean(umamiHostUrl && umamiWebsiteId);
  const AnalyticsProvider = shouldLoadUmami ? Fragment : TrackingProvider;
  const typographyStyle = buildStoreTypographyCssVariables(initialStoreInfo?.typography) as CSSProperties;
  const typographyStylesheetUrl = buildStoreTypographyStylesheetUrl(initialStoreInfo?.typography);
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className="scroll-smooth" style={typographyStyle}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preload" href={typographyStylesheetUrl} as="style" />
        <link rel="stylesheet" href={typographyStylesheetUrl} />
        {gtmId ? (
          <Script
            id="celebix-gtm"
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
            }}
          />
        ) : null}
        {metaPixelId ? (
          <Script
            id="celebix-meta-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html:
                `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
                `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
                `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);` +
                `t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}` +
                `(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
                `fbq('init', '${metaPixelId}');fbq('track', 'PageView');`,
            }}
          />
        ) : null}
        {shouldLoadUmami ? (
          <Script
            id="celebix-umami"
            src={`${umamiHostUrl.replace(/\/+$/, "")}/script.js`}
            strategy="afterInteractive"
            data-website-id={umamiWebsiteId}
            data-host-url={umamiHostUrl}
            data-domains="derycraft.com.tr,www.derycraft.com.tr"
            data-do-not-track="true"
          />
        ) : null}
        <CodeIntegrationMarkup html={codeIntegrations.customHeadHtml} />
      </head>
      <body className="font-sans antialiased bg-[#F8F8F8F8]" suppressHydrationWarning>
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        {metaPixelId ? (
          <noscript>
            <img
              alt=""
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        ) : null}
        <PromotionalBannersPreload />
        <StorefrontRouteProvider
          initialLocale={locale}
          initialInternalPathname={pathname}
          initialRouting={localeRouting}
        >
          <AnalyticsProvider>
            <StoreInfoProvider initialStoreInfo={initialStoreInfo ?? undefined}>
              <AuthProvider>
                <CartProvider>
                  <WishlistProvider>
                    <QuickViewProvider>
                      <LayoutWrapper navigationCategories={navigationCategories}>
                        {children}
                        <FloatingContactButton />
                        <Toaster position="top-center" theme="light" richColors closeButton />
                      </LayoutWrapper>
                    </QuickViewProvider>
                  </WishlistProvider>
                </CartProvider>
              </AuthProvider>
            </StoreInfoProvider>
          </AnalyticsProvider>
        </StorefrontRouteProvider>
        <CodeIntegrationMarkup html={codeIntegrations.customBodyEndHtml} />
      </body>
    </html>
  );
}
