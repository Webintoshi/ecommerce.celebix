import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { STOREFRONT_RUNTIME, absoluteStorefrontUrl } from "@/lib/storefront-runtime";

export const metadata: Metadata = {
  title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
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
  openGraph: {
    title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    description: "Roarcraft kalitesinde, %100 el yapımı hakiki deri kordonlar.",
    type: "website",
    locale: "tr_TR",
    siteName: "Deri Kordon",
    url: STOREFRONT_RUNTIME.siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    description: "Roarcraft kalitesinde, %100 el yapımı hakiki deri kordonlar.",
  },
  alternates: {
    canonical: absoluteStorefrontUrl("/"),
  },
};

export default async function Home() {
  const homepageData = await getHomepageData().catch((error) => {
    console.error("Failed to load homepage data on the server:", error);
    return null;
  });

  return (
    <>
      <RedesignHome initialData={homepageData} />
      
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Deri Kordon",
            url: STOREFRONT_RUNTIME.siteUrl,
            description: "El yapımı hakiki deri kordonlar ve Apple Watch kayışları",
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
            name: "Deri Kordon",
            url: STOREFRONT_RUNTIME.siteUrl,
            logo: absoluteStorefrontUrl("/logo.png"),
            contactPoint: {
              "@type": "ContactPoint",
              telephone: STOREFRONT_RUNTIME.supportPhone,
              contactType: "customer service",
              availableLanguage: ["Turkish"],
            },
            sameAs: [
              STOREFRONT_RUNTIME.socialInstagram,
            ],
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            name: "Deri Kordon",
            description: "El yapımı deri kordon ve aksesuar mağazası",
            url: STOREFRONT_RUNTIME.siteUrl,
            telephone: STOREFRONT_RUNTIME.supportPhone,
            email: STOREFRONT_RUNTIME.supportEmail,
            priceRange: "$$",
            paymentAccepted: ["Credit Card", "Debit Card", "Cash on Delivery"],
            currenciesAccepted: "TRY",
            openingHoursSpecification: [
              {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                opens: "09:00",
                closes: "18:00",
              },
            ],
          }),
        }}
      />
    </>
  );
}
