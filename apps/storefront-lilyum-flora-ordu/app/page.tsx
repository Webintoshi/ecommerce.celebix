import type { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { getStoreInfo } from "@/lib/db/settings";
import { buildLocaleAlternates, buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const HOME_UI_COPY = {
  categoriesEyebrow: "Koleksiyonlar",
  categoriesHeading: "Bugünün çiçek seçimleri",
  viewAllLabel: "Tümünü Gör",
  productGroups: [
    { title: "Çok Sevilenler", subtitle: "Güncel Vitrin" },
    { title: "Premium Aranjmanlar", subtitle: "Editör Seçimi" },
    { title: "Yeni Seçkiler", subtitle: "Sezona Uygun" },
    { title: "Hediye Seçimleri", subtitle: "Kolay Keşif" },
  ],
  storesEyebrow: "Mağaza",
  storesHeading: "Teslimat ve iletişim",
  storesLinkLabel: "İletişime Git",
  testimonialsHeading: "Müşteri Yorumları",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const localizedHome = buildLocalizedPath("/", locale);

  return {
    title: copy.homeTitle,
    description: copy.homeDescription,
    alternates: {
      canonical: localizedHome,
      languages: buildLocaleAlternates("/"),
    },
    openGraph: {
      title: copy.homeTitle,
      description: copy.homeDescription,
      type: "website",
      locale,
      siteName: STOREFRONT_RUNTIME.name,
      url: localizedHome,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.homeTitle,
      description: copy.homeDescription,
    },
  };
}

export default async function Home() {
  const locale = await getRequestLocale();
  const [homepageData, storeInfo, requestOrigin] = await Promise.all([
    getHomepageData(locale),
    getStoreInfo(),
    getRequestOrigin(),
  ]);
  const siteName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const siteDescription = storeInfo?.address
    ? `${siteName} magazasinin adres, iletisim ve urun vitrini tek deneyimde sunulur.`
    : STOREFRONT_RUNTIME.description;
  const localizedHomeUrl = new URL(buildLocalizedPath("/", locale), requestOrigin).toString();
  const localizedProductsUrl = new URL(
    buildLocalizedPath("/urunler", locale),
    requestOrigin,
  ).toString();
  const storesHref = buildLocalizedPath("/iletisim", locale);
  const hasRealLogo = Boolean(storeInfo?.logoUrl?.trim());
  const logoUrl = hasRealLogo
    ? await buildAbsoluteRequestUrl(storeInfo?.logoUrl)
    : "";

  return (
    <>
      <RedesignHome data={homepageData} uiCopy={HOME_UI_COPY} storesHref={storesHref} />

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
              email: storeInfo?.email || STOREFRONT_RUNTIME.supportEmail,
              contactType: "customer service",
              availableLanguage: ["Turkish", "English", "German", "Russian", "Arabic", "Georgian"],
            },
            sameAs: [
              storeInfo?.socialInstagram || STOREFRONT_RUNTIME.socialInstagram,
              STOREFRONT_RUNTIME.socialFacebook,
              STOREFRONT_RUNTIME.socialTwitter,
            ].filter(Boolean),
          }),
        }}
      />
    </>
  );
}
