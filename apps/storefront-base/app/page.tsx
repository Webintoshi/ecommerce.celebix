import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { AnnouncementBar } from "@/components/sections/AnnouncementBar";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import { STOREFRONT_RUNTIME, absoluteStorefrontUrl } from "@/lib/storefront-runtime";

export const metadata: Metadata = {
  title: `${SITE_NAME} | Celebix Storefront Base`,
  description: SITE_DESCRIPTION,
  keywords: ["storefront base", "e-ticaret demo", "urun vitrini", "celebix"],
  openGraph: {
    title: `${SITE_NAME} | Celebix Storefront Base`,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "tr_TR",
    siteName: SITE_NAME,
  },
};

export default function Home() {
  return (
    <>
      <AnnouncementBar />
      <RedesignHome />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: STOREFRONT_RUNTIME.siteUrl,
            description: SITE_DESCRIPTION,
            potentialAction: {
              "@type": "SearchAction",
              target: `${absoluteStorefrontUrl("/urunler")}?search={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: SITE_NAME,
            url: STOREFRONT_RUNTIME.siteUrl,
            logo: absoluteStorefrontUrl(STOREFRONT_RUNTIME.logoPath),
            contactPoint: {
              "@type": "ContactPoint",
              telephone: STOREFRONT_RUNTIME.supportPhone,
              contactType: "customer service",
              availableLanguage: ["Turkish"],
            },
            sameAs: [
              STOREFRONT_RUNTIME.socialInstagram,
              STOREFRONT_RUNTIME.socialFacebook,
              STOREFRONT_RUNTIME.socialTwitter,
            ],
          }),
        }}
      />
    </>
  );
}
