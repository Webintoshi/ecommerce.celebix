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
  return buildStorePageMetadata({
    locale,
    pathname: "/",
    title: copy.homeTitle,
    description: copy.homeDescription,
    keywords: [
      "el yapımı deri cüzdan",
      "apple watch deri kayış",
      "hakiki deri saat kayışı",
      "premium deri aksesuar",
      "handmade leather strap",
      "kişiselleştirilmiş deri aksesuar",
      "DeryCraft deri",
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
              availableLanguage: ["Turkish"],
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
            description: "El yapımı deri kayış, cüzdan ve aksesuar mağazası",
            url: requestOrigin,
            telephone: storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone,
            email: storeInfo?.email || STOREFRONT_RUNTIME.supportEmail,
            priceRange: "$$",
            paymentAccepted: ["Kredi Kartı", "Banka Kartı", "Havale / EFT"],
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
