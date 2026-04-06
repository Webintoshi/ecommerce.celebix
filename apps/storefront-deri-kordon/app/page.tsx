import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { buildLocaleAlternates, buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { translateSeoStrings, translateUiStrings } from "@/lib/translation";

const HOME_UI_COPY = {
  categoriesEyebrow: "Koleksiyonlar",
  categoriesHeading: "Kategoriler",
  viewAllLabel: "Tümünü Gör",
  storesEyebrow: "Mağazalarımız",
  storesHeading: "Deriye yakından dokunun",
  storesDescription:
    "Giresun ve Ordu mağazalarımızda koleksiyonlarımızı yakından inceleyin, dokusunu hissedin ve size en uygun parçayı yerinde seçin.",
  storesLinkLabel: "Tüm şubeleri gör",
  testimonialsHeading: "Müşteri Yorumları",
  testimonialsCountLabel: "1581 değerlendirmeden",
  groupTitle0: "Çok Satanlar",
  groupSubtitle0: "Seçili Koleksiyon",
  groupTitle1: "Apple Watch Kayışları",
  groupSubtitle1: "Öne Çıkanlar",
  groupTitle2: "Aksesuarlar",
  groupSubtitle2: "Tamamlayıcılar",
  groupTitle3: "Deri Saat Kayışları",
  groupSubtitle3: "Klasik Seçim",
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
  const localizedHome = buildLocalizedPath("/", locale);
  const [title, description] = await translateSeoStrings(
    [copy.homeTitle, copy.homeDescription],
    locale,
    "home-seo",
  );

  return {
    title,
    description,
    keywords: [
      "el yapimi deri kordon",
      "apple watch deri kayis",
      "hakiki deri kordon",
      "premium deri aksesuar",
      "handmade leather strap",
      "deri bileklik",
      "ozel tasarim kordon",
    ],
    openGraph: {
      title,
      description,
      type: "website",
      locale,
      siteName: "Deri Kordon",
      url: localizedHome,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: localizedHome,
      languages: buildLocaleAlternates("/"),
    },
  };
}

export default async function Home() {
  const locale = await getRequestLocale();
  const [homepageData, uiCopy, requestOrigin] = await Promise.all([
    getHomepageData(locale),
    getHomepageUiCopy(locale),
    getRequestOrigin(),
  ]);
  const localizedHomeUrl = new URL(buildLocalizedPath("/", locale), requestOrigin).toString();
  const localizedProductsUrl = new URL(
    buildLocalizedPath("/urunler", locale),
    requestOrigin,
  ).toString();
  const storesHref = buildLocalizedPath("/magazalarimiz", locale);
  const logoUrl = await buildAbsoluteRequestUrl("/logo.png");

  return (
    <>
      <RedesignHome data={homepageData} uiCopy={uiCopy} storesHref={storesHref} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Deri Kordon",
            url: localizedHomeUrl,
            description: "El yapimi hakiki deri kordonlar ve Apple Watch kayislari",
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
            url: requestOrigin,
            logo: logoUrl,
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
            description: "El yapimi deri kordon ve aksesuar magazasi",
            url: requestOrigin,
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
