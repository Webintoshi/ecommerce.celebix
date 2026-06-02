import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { buildLocalizedPath } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { translateSeoStrings, translateUiStrings } from "@/lib/translation";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";

const HOME_SEO_KEYWORDS = [
  "leather strap",
  "apple watch leather band",
  "handmade leather strap",
  "genuine leather strap",
  "leather cardholder",
  "leather wallet",
  "premium leather accessory",
] as const;

async function getHomepageSeo(locale: Awaited<ReturnType<typeof getRequestLocale>>) {
  const [title, description] = await translateSeoStrings(
    [
      "DeryCraft | Handmade Leather Straps and Apple Watch Bands",
      "Discover handmade genuine leather straps, Apple Watch bands, cardholders, wallets and premium leather accessories at DeryCraft. Workshop-made quality with fast shipping support.",
    ],
    locale,
    "home-seo",
  );

  return {
    title,
    description,
    keywords: [...HOME_SEO_KEYWORDS],
  };
}

const HOME_UI_COPY = {
  heroEyebrow: "Atelier Selection",
  heroHeading: "Carry genuine leather into your daily rhythm with refined ease",
  heroDescription:
    "Handmade leather straps, lasting accessories and durable material choices in a quieter, more premium collection.",
  heroPrimaryCta: "Explore Collection",
  heroSecondaryCta: "View Stores",
  heroStatLabel0: "workshop production",
  heroStatLabel1: "premium leather selection",
  heroStatLabel2: "fast shipping support",
  categoriesEyebrow: "Collections",
  categoriesHeading: "Categories",
  categoriesDescription:
    "Sort the selection from watch straps to wallets and accessories by material and use case.",
  viewAllLabel: "View All",
  showcaseDescription:
    "Workshop-selected pieces that gain patina in daily use and make strong gifts.",
  storesEyebrow: "Our Stores",
  storesHeading: "Touch the leather up close",
  storesDescription:
    "Explore our Giresun and Ordu stores to experience the leather collections in person.",
  storesLinkLabel: "View all stores",
  testimonialsHeading: "Customer Reviews",
  testimonialsCountLabel: "from 1581 reviews",
  groupTitle0: "Best Sellers",
  groupSubtitle0: "Selected Collection",
  groupTitle1: "Apple Watch Bands",
  groupSubtitle1: "Featured",
  groupTitle2: "Accessories",
  groupSubtitle2: "Complements",
  groupTitle3: "Leather Watch Straps",
  groupSubtitle3: "Classic Choice",
};

async function getHomepageUiCopy(locale: Awaited<ReturnType<typeof getRequestLocale>>) {
  const translated = await translateUiStrings(HOME_UI_COPY, locale, "homepage-ui");

  return {
    hero: {
      eyebrow: translated.heroEyebrow,
      heading: translated.heroHeading,
      description: translated.heroDescription,
      primaryCta: translated.heroPrimaryCta,
      secondaryCta: translated.heroSecondaryCta,
      stats: [
        { value: "100%", label: translated.heroStatLabel0 },
        { value: "Full-grain", label: translated.heroStatLabel1 },
        { value: "1-3 days", label: translated.heroStatLabel2 },
      ],
    },
    categoriesEyebrow: translated.categoriesEyebrow,
    categoriesHeading: translated.categoriesHeading,
    categoriesDescription: translated.categoriesDescription,
    viewAllLabel: translated.viewAllLabel,
    showcaseDescription: translated.showcaseDescription,
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
  const { title, description, keywords } = await getHomepageSeo(locale);

  return buildStorePageMetadata({
    locale,
    pathname: "/",
    title,
    description,
    keywords,
  });
}

export default async function Home() {
  const locale = await getRequestLocale();
  const [homepageData, uiCopy, requestOrigin, blogRows, seo] = await Promise.all([
    getHomepageData(locale),
    getHomepageUiCopy(locale),
    getRequestOrigin(),
    getPublishedPosts().catch(() => []),
    getHomepageSeo(locale),
  ]);
  const blogPosts = mapBlogRows(blogRows)
    .slice(0, 3)
    .map((post) => ({
      id: post.id,
      title: post.title,
      image: post.coverImage,
      href: buildLocalizedPath(`/blog/${post.slug}`, locale),
    }));
  const blogViewAllHref = buildLocalizedPath("/blog", locale);
  const localizedHomeUrl = new URL(buildLocalizedPath("/", locale), requestOrigin).toString();
  const productsHref = buildLocalizedPath("/urunler", locale);
  const localizedProductsUrl = new URL(productsHref, requestOrigin).toString();
  const storesHref = buildLocalizedPath("/magazalarimiz", locale);
  const logoUrl = await buildAbsoluteRequestUrl("/logo.png");

  return (
    <>
      <RedesignHome
        data={homepageData}
        productsHref={productsHref}
        uiCopy={uiCopy}
        storesHref={storesHref}
        blogPosts={blogPosts}
        blogViewAllHref={blogViewAllHref}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: STOREFRONT_RUNTIME.name,
            url: localizedHomeUrl,
            description: seo.description,
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
            name: STOREFRONT_RUNTIME.name,
            url: requestOrigin,
            logo: logoUrl,
            contactPoint: {
              "@type": "ContactPoint",
              telephone: STOREFRONT_RUNTIME.supportPhone,
              contactType: "customer service",
              availableLanguage: ["English", "Turkish", "German", "Russian", "Arabic", "Georgian"],
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
            name: STOREFRONT_RUNTIME.name,
            description: seo.description,
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
