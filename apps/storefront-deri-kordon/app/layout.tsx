import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
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
import TrackingProvider from "@/components/TrackingProvider";
import { Toaster } from "sonner";
import PromotionalBannersPreload from "@/components/preload/PromotionalBannersPreload";

export const dynamic = "force-dynamic";

/* === PREMIUM TYPOGRAPHY === */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700"],
});

/* === SEO & METADATA === */
export const metadata: Metadata = {
  title: {
    default: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    template: `%s | Deri Kordon`,
  },
  description: 
    "Roarcraft kalitesinde, %100 el yapımı hakiki deri kordonlar. Apple Watch kayışları, özel tasarım deri aksesuarlar ve ustaların el işçiliğiyle üretilen premium deri ürünler.",
  keywords: [
    "el yapımı deri kordon",
    "apple watch deri kayış",
    "hakiki deri kordon",
    "premium deri aksesuar",
    "handmade leather strap",
    "deri bileklik",
    "özel tasarım kordon"
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
    description: "Roarcraft kalitesinde, %100 el yapımı hakiki deri kordonlar.",
    siteName: "Deri Kordon",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    description: "Roarcraft kalitesinde, %100 el yapımı hakiki deri kordonlar.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: "./",
    languages: {
      "tr-TR": "./",
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gtmId = STOREFRONT_RUNTIME.gtmId;
  const initialStoreInfo = await getStoreInfo();

  return (
    <html lang="tr" suppressHydrationWarning className="scroll-smooth">
      <head>
        {/* Preconnect for Performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* GTM */}
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
        className={`${playfair.variable} ${inter.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        {/* GTM NoScript */}
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
                            background: '#0F1626',
                            color: '#FFFFFF',
                            border: 'none',
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
