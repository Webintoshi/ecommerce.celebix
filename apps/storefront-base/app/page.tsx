import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getStoreInfo } from "@/lib/db/settings";
import { buildStoreRootMetadata, getStoreSeoContext } from "@/lib/seo-metadata";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocalizedPath } from "@/lib/i18n";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return buildStoreRootMetadata(locale, "/");
}

export default async function Home() {
  const locale = await getRequestLocale();
  const [storeInfo, seo, requestOrigin] = await Promise.all([
    getStoreInfo(),
    getStoreSeoContext(locale),
    getRequestOrigin(),
  ]);
  const siteName = storeInfo?.name || seo.siteName || STOREFRONT_RUNTIME.name;
  const siteDescription = seo.defaultDescription || STOREFRONT_RUNTIME.description;
  const logoUrl = storeInfo?.logoUrl || STOREFRONT_RUNTIME.logoPath;
  const productsUrl = await buildAbsoluteRequestUrl(buildLocalizedPath("/urunler", locale));
  const resolvedLogoUrl = await buildAbsoluteRequestUrl(logoUrl);

  return (
    <>
      <RedesignHome />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteName,
            url: buildLocalizedPath("/", locale),
            description: siteDescription,
            potentialAction: {
              "@type": "SearchAction",
              target: `${productsUrl}?search={search_term_string}`,
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
            logo: resolvedLogoUrl,
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
