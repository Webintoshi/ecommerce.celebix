import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { STOREFRONT_RUNTIME, absoluteStorefrontUrl } from "@/lib/storefront-runtime";
import { getHomepageData } from "@/lib/homepage";
import { getRequestLocale } from "@/lib/request-locale";
import {
  buildLocaleAlternates,
  buildLocalizedPath,
  getLocalizedCopy,
} from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const localizedHome = buildLocalizedPath("/", locale);

  return {
    title: copy.homeTitle,
    description: copy.homeDescription,
    keywords: [
      "el yapımı deri kordon",
      "apple watch deri kayış",
      "hakiki deri kordon",
      "premium deri aksesuar",
      "handmade leather strap",
      "deri bileklik",
      "özel tasarım kordon",
    ],
    openGraph: {
      title: copy.homeTitle,
      description: copy.homeDescription,
      type: "website",
      locale,
      siteName: "Deri Kordon",
      url: localizedHome,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.homeTitle,
      description: copy.homeDescription,
    },
    alternates: {
      canonical: localizedHome,
      languages: buildLocaleAlternates("/"),
    },
  };
}

export default async function Home() {
  const locale = await getRequestLocale();
  const homepageData = await getHomepageData();
  const localizedProductsUrl = absoluteStorefrontUrl(buildLocalizedPath("/urunler", locale));

  return (
    <>
      <RedesignHome data={homepageData} />

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
              target: `${localizedProductsUrl}?search={search_term_string}`,
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
              availableLanguage: ["Turkish", "English", "German", "Russian", "Arabic", "Georgian"],
            },
            sameAs: [STOREFRONT_RUNTIME.socialInstagram],
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
