import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import "@/app/styles/redesign.scss";
import { CartProvider } from "@/lib/cart-context";
import { WishlistProvider } from "@/lib/wishlist-context";
import { AuthProvider } from "@/lib/auth-context";
import { StoreInfoProvider } from "@/lib/store-info-context";
import { QuickViewProvider } from "@/components/product/QuickViewProvider";
import { LayoutWrapper } from "@/components/layout/LayoutWrapper";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import TrackingProvider from "@/components/TrackingProvider";
import { Toaster } from "sonner";
import PromotionalBannersPreload from "@/components/preload/PromotionalBannersPreload";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "optional",
  preload: true,
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "optional",
  preload: true,
});

const quenda = localFont({
  src: [
    {
      path: "./Quenda-Medium.otf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-quenda",
  display: "optional",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["storefront base", "e-ticaret", "urun vitrini", "kategori", "urun detay"],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
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
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "./",
    languages: {
      "tr-TR": "./",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gtmId = STOREFRONT_RUNTIME.gtmId;

  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
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
        className={`${quenda.variable} ${lora.variable} ${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
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
        <PromotionalBannersPreload />
        <TrackingProvider>
          <StoreInfoProvider>
            <AuthProvider>
              <CartProvider>
                <WishlistProvider>
                  <QuickViewProvider>
                    <LayoutWrapper>
                      {children}
                      <Toaster position="top-right" theme="light" />
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
