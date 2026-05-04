import type { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { getStoreInfo } from "@/lib/db/settings";
import { buildLocaleAlternates, buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const HOME_UI_COPY = {
  categoriesEyebrow: "Koleksiyonlar",
  categoriesHeading: "Spor stiline hizli giris",
  viewAllLabel: "Tumunu Gor",
  productGroups: [
    { title: "One Cikan Urunler", subtitle: "En yeni ve en cok tercih edilen urunlerimiz." },
    { title: "Sneaker ve Ayakkabi", subtitle: "Performans Secimi" },
    { title: "Yeni Sezon", subtitle: "Yeni Gelenler" },
    { title: "Giyim ve Aksesuar", subtitle: "Stili Tamamla" },
  ],
  testimonialsHeading: "Sporcularin Tercihleri",
  testimonialsCountLabel: "Onayli yorumlar geldikce burada urun deneyimi one cikar",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const routing = await getLocaleRoutingConfig();
  const copy = getLocalizedCopy(locale);
  const localizedHome = buildLocalizedPath("/", locale, routing);
  const languageAlternates = buildLocaleAlternates("/", routing);

  return {
    title: copy.homeTitle,
    description: copy.homeDescription,
    alternates: {
      canonical: localizedHome,
      ...(languageAlternates ? { languages: languageAlternates } : {}),
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
  const [homepageData, storeInfo, requestOrigin, routing] = await Promise.all([
    getHomepageData(locale),
    getStoreInfo(),
    getRequestOrigin(),
    getLocaleRoutingConfig(),
  ]);
  const siteName = storeInfo?.name || STOREFRONT_RUNTIME.name;
  const siteDescription = storeInfo?.address
    ? `${siteName} magazasinin spor ekipmani vitrini, iletisim ve teslimat bilgileri tek deneyimde sunulur.`
    : STOREFRONT_RUNTIME.description;
  const localizedHomeUrl = new URL(buildLocalizedPath("/", locale, routing), requestOrigin).toString();
  const localizedProductsUrl = new URL(
    buildLocalizedPath("/urunler", locale, routing),
    requestOrigin,
  ).toString();
  const hasRealLogo = Boolean(storeInfo?.logoUrl?.trim());
  const logoUrl = hasRealLogo
    ? await buildAbsoluteRequestUrl(storeInfo?.logoUrl)
    : "";

  return (
    <>
      <RedesignHome data={homepageData} uiCopy={HOME_UI_COPY} />

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
