import type { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { getStoreInfo } from "@/lib/db/settings";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { translateUiStrings } from "@/lib/translation";

const HOME_UI_COPY = {
  categoriesEyebrow: "Collections",
  categoriesHeading: "Categories",
  viewAllLabel: "View All",
  storesEyebrow: "Our Stores",
  storesHeading: "Experience leather in person",
  storesDescription:
    "Visit our Giresun and Ordu stores to explore DeryCraft leather collections up close.",
  storesLinkLabel: "View all stores",
  testimonialsHeading: "Customer Reviews",
  testimonialsCountLabel: "from 1,581 reviews",
  groupTitle0: "Best Sellers",
  groupSubtitle0: "Selected Collection",
  groupTitle1: "Apple Watch Bands",
  groupSubtitle1: "Featured Picks",
  groupTitle2: "Accessories",
  groupSubtitle2: "Finishing Touches",
  groupTitle3: "Leather Watch Straps",
  groupSubtitle3: "Classic Selection",
};

async function getHomepageUiCopy(locale: Awaited<ReturnType<typeof getRequestLocale>>) {
  const translated = await translateUiStrings(HOME_UI_COPY, locale, "homepage-ui");

  return {
    categoriesEyebrow: translated.categoriesEyebrow,
    categoriesHeading: translated.categoriesHeading,
    viewAllLabel: translated.viewAllLabel,
    storesEyebrow: translated.storesEyebrow,
    storesHeading: translated.storesHeading,
    storesDescription: translated.storesDescription,
    storesLinkLabel: translated.storesLinkLabel,
    testimonialsHeading: translated.testimonialsHeading,
    testimonialsCountLabel: translated.testimonialsCountLabel,
    productGroups: [
      { title: translated.groupTitle0, subtitle: translated.groupSubtitle0 },
      { title: translated.groupTitle1, subtitle: translated.groupSubtitle1 },
      { title: translated.groupTitle2, subtitle: translated.groupSubtitle2 },
      { title: translated.groupTitle3, subtitle: translated.groupSubtitle3 },
    ],
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  return buildStorePageMetadata({
    locale,
    pathname: "/",
    title: copy.homeTitle,
    description: copy.homeDescription,
    keywords: [
      "handmade leather wallet",
      "apple watch leather band",
      "genuine leather watch strap",
      "premium leather accessories",
      "handmade leather strap",
      "personalized leather accessories",
      "DeryCraft leather",
    ],
  });
}

export default async function Home() {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const [homepageData, uiCopy, storeInfo, requestOrigin, routing] = await Promise.all([
    getHomepageData(locale),
    getHomepageUiCopy(locale),
    getStoreInfo(),
    getRequestOrigin(),
    getLocaleRoutingConfig(),
  ]);
  const siteName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const siteDescription = copy.homeDescription;
  const localizedHomeUrl = new URL(buildLocalizedPath("/", locale, routing), requestOrigin).toString();
  const localizedProductsUrl = new URL(
    buildLocalizedPath("/urunler", locale, routing),
    requestOrigin,
  ).toString();
  const storesHref = buildLocalizedPath("/magazalarimiz", locale, routing);
  const logoAssetPath = storeInfo?.logoUrl || STOREFRONT_RUNTIME.logoPath || "";
  const logoUrl = logoAssetPath ? await buildAbsoluteRequestUrl(logoAssetPath) : "";

  return (
    <>
      <RedesignHome data={homepageData} uiCopy={uiCopy} storesHref={storesHref} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteName,
            url: localizedHomeUrl,
            description: siteDescription,
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
            name: siteName,
            url: requestOrigin,
            ...(logoUrl ? { logo: logoUrl } : {}),
            contactPoint: {
              "@type": "ContactPoint",
              telephone: storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone,
              contactType: "customer service",
              availableLanguage: ["English", "Turkish", "German", "Russian", "Arabic", "Georgian"],
            },
            sameAs: [storeInfo?.socialInstagram || STOREFRONT_RUNTIME.socialInstagram].filter(Boolean),
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            name: siteName,
            description: "Handmade leather straps, wallets and accessories store",
            url: requestOrigin,
            telephone: storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone,
            email: storeInfo?.email || STOREFRONT_RUNTIME.supportEmail,
            priceRange: "$$",
            paymentAccepted: ["Credit Card", "Debit Card", "Bank Transfer"],
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
