import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Script from "next/script";
import { Manrope, Newsreader } from "next/font/google";
import "./globals.css";
import "@/app/styles/redesign.scss";
import { CartProvider } from "@/lib/cart-context";
import { WishlistProvider } from "@/lib/wishlist-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreInfoProvider } from "@/lib/store-info-context";
import { FloatingContactButton } from "@/components/layout/FloatingContactButton";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { getStoreInfo } from "@/lib/db/settings";
import { getRequestLocale, getRequestPathname } from "@/lib/request-locale";
import { RTL_LOCALES } from "@/lib/i18n";
import { StorefrontRouteProvider } from "@/lib/storefront-route-context";
import { buildStoreRootMetadata } from "@/lib/seo-metadata";
import TrackingProvider from "@/components/TrackingProvider";
import { Toaster } from "sonner";
import PromotionalBannersPreload from "@/components/preload/PromotionalBannersPreload";
import {
  buildStoreTypographyCssVariables,
  buildStoreTypographyStylesheetUrl,
} from "@celebix/platform-config/src/typography";

export const dynamic = "force-dynamic";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--ezmeo-font-body",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const displayFont = Newsreader({
  subsets: ["latin"],
  variable: "--ezmeo-font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

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
  const gtmId = STOREFRONT_RUNTIME.gtmId;
  const locale = await getRequestLocale();
  const pathname = await getRequestPathname();
  const initialStoreInfo = await getStoreInfo();
  const typographyStyle = buildStoreTypographyCssVariables(initialStoreInfo?.typography) as CSSProperties;
  const typographyStylesheetUrl = buildStoreTypographyStylesheetUrl(initialStoreInfo?.typography);
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";
  const providerStoreInfo = initialStoreInfo
    ? {
        ...initialStoreInfo,
        timezone: initialStoreInfo.timezone || "Europe/Istanbul",
      }
    : null;
  const themeTypographyStyle = {
    ...typographyStyle,
    "--store-font-heading": "var(--ezmeo-font-display)",
    "--store-font-body": "var(--ezmeo-font-body)",
    "--store-font-menu": "var(--ezmeo-font-body)",
    "--store-font-product-title": "var(--ezmeo-font-body)",
  } as CSSProperties;

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${bodyFont.variable} ${displayFont.variable} scroll-smooth`}
      style={themeTypographyStyle}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {typographyStylesheetUrl ? <link rel="preload" href={typographyStylesheetUrl} as="style" /> : null}
        {typographyStylesheetUrl ? <link rel="stylesheet" href={typographyStylesheetUrl} /> : null}
        {gtmId ? (
          <Script
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
            }}
          />
        ) : null}
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
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
        <PromotionalBannersPreload />
        <StorefrontRouteProvider initialLocale={locale} initialInternalPathname={pathname}>
          <TrackingProvider>
            <StoreInfoProvider initialStoreInfo={providerStoreInfo}>
              <AuthProvider>
                <CartProvider>
                  <WishlistProvider>
                    <QuickViewProvider>
                      <LayoutWrapper>
                        {children}
                        <FloatingContactButton />
                        <Toaster position="top-right" theme="light" />
                      </LayoutWrapper>
                    </QuickViewProvider>
                  </WishlistProvider>
                </CartProvider>
              </AuthProvider>
            </StoreInfoProvider>
          </TrackingProvider>
        </StorefrontRouteProvider>
      </body>
    </html>
  );
}
