import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Script from "next/script";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import { WishlistProvider } from "@/lib/wishlist-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreInfoProvider } from "@/lib/store-info-context";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { getStoreInfo } from "@/lib/db/settings";
import { getRequestLocale, getRequestPathname } from "@/lib/request-locale";
import {
  RTL_LOCALES,
  buildLocaleAlternates,
  buildLocalizedPath,
  getLocalizedCopy,
} from "@/lib/i18n";
import TrackingProvider from "@/components/TrackingProvider";
import { Toaster } from "sonner";
import {
  buildStoreTypographyCssVariables,
  buildStoreTypographyStylesheetUrl,
} from "@celebix/platform-config/src/typography";

export const dynamic = "force-dynamic";

const metadataTemplate: Metadata = {
  title: {
    default: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    template: `%s | Deri Kordon`,
  },
  description:
    "Roarcraft kalitesinde, yüzde yüz el yapımı hakiki deri kordonlar. Apple Watch kayışları ve premium deri aksesuarlar.",
  keywords: [
    "el yapımı deri kordon",
    "apple watch deri kayış",
    "hakiki deri kordon",
    "premium deri aksesuar",
    "handmade leather strap",
    "deri bileklik",
    "özel tasarım kordon",
  ],
  authors: [{ name: "Deri Kordon" }],
  creator: "Deri Kordon",
  metadataBase: new URL(STOREFRONT_RUNTIME.siteUrl),
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: STOREFRONT_RUNTIME.siteUrl,
    title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    description: "Roarcraft kalitesinde, yüzde yüz el yapımı hakiki deri kordonlar.",
    siteName: "Deri Kordon",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    description: "Roarcraft kalitesinde, yüzde yüz el yapımı hakiki deri kordonlar.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/tr",
    languages: buildLocaleAlternates("/"),
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

function buildFaviconHref(faviconUrl?: string | null) {
  const trimmed = typeof faviconUrl === "string" ? faviconUrl.trim() : "";
  if (!trimmed) {
    return "/favicon.ico";
  }

  return `/favicon.ico?v=${encodeURIComponent(trimmed)}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const pathname = await getRequestPathname();
  const copy = getLocalizedCopy(locale);
  const storeInfo = await getStoreInfo();
  const faviconHref = buildFaviconHref(storeInfo?.faviconUrl);
  const localizedPath = buildLocalizedPath(pathname, locale);

  return {
    ...metadataTemplate,
    title: {
      default: copy.siteTitle,
      template: `%s | Deri Kordon`,
    },
    description: copy.siteDescription,
    icons: {
      icon: faviconHref,
      shortcut: faviconHref,
      apple: faviconHref,
    },
    openGraph: {
      ...metadataTemplate.openGraph,
      title: copy.siteTitle,
      description: copy.siteDescription,
      locale,
      url: localizedPath,
    },
    twitter: {
      ...metadataTemplate.twitter,
      title: copy.siteTitle,
      description: copy.siteDescription,
    },
    alternates: {
      canonical: localizedPath,
      languages: buildLocaleAlternates(pathname),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gtmId = STOREFRONT_RUNTIME.gtmId;
  const locale = await getRequestLocale();
  const initialStoreInfo = await getStoreInfo();
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
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`,
            }}
          />
        ) : null}
      </head>
      <body
        className="font-sans antialiased bg-[#F8F8F8F8]"
        suppressHydrationWarning
        style={{ backgroundColor: "#F8F8F8F8" }}
      >
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

        <TrackingProvider>
          <StoreInfoProvider initialStoreInfo={initialStoreInfo}>
            <AuthProvider>
              <CartProvider>
                <WishlistProvider>
                  <QuickViewProvider>
                    <LayoutWrapper>
                      {children}
                      <Toaster
                        position="top-right"
                        theme="light"
                        toastOptions={{
                          style: {
                            background: "#0F1626",
                            color: "#FFFFFF",
                            border: "none",
                          },
                        }}
                      />
                    </LayoutWrapper>
                  </QuickViewProvider>
                </WishlistProvider>
              </CartProvider>
            </AuthProvider>
          </StoreInfoProvider>
        </TrackingProvider>
      </body>
    </html>
  );
}
