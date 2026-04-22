import { Metadata } from "next";
import RedesignHome from "@/components/sections/redesign/RedesignHome";
import { getHomepageData } from "@/lib/homepage";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildAbsoluteRequestUrl, getRequestOrigin } from "@/lib/request-origin";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { translateSeoStrings, translateUiStrings } from "@/lib/translation";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";

const HOME_UI_COPY = {
  heroEyebrow: "Atolye Seckisi",
  heroHeading: "Hakiki deriyi gunluk ritminize rafine bir bicimde tasiyin",
  heroDescription:
    "El yapimi deri kordonlar, cizgisini koruyan aksesuarlar ve omurlu malzeme secimleriyle kurulan daha sessiz, daha premium bir koleksiyon.",
  heroPrimaryCta: "Koleksiyonu Kesfet",
  heroSecondaryCta: "Magazalari Gor",
  heroStatLabel0: "atolye uretimi",
  heroStatLabel1: "premium deri secimi",
  heroStatLabel2: "hizli kargo destegi",
  categoriesEyebrow: "Koleksiyonlar",
  categoriesHeading: "Kategoriler",
  categoriesDescription:
    "Saat kordonlarindan cuzdan ve aksesuarlara uzanan seckiyi, malzeme ve kullanim amacina gore hizlica ayirin.",
  viewAllLabel: "Tumunu Gor",
  showcaseDescription:
    "Gunluk kullanimda patina kazanan, hediye olarak da guclu duran atolyeden secilen parcalar.",
  storesEyebrow: "Magazalarimiz",
  storesHeading: "Deriye yakindan dokunun",
  storesDescription:
    "Giresun ve Ordu magazalarimizda koleksiyonlarimizi yakindan inceleyin, dokusunu hissedin ve size en uygun parcayi yerinde secin.",
  storesLinkLabel: "Tum subeleri gor",
  testimonialsHeading: "Musteri Yorumlari",
  testimonialsCountLabel: "1581 degerlendirmeden",
  groupTitle0: "Cok Satanlar",
  groupSubtitle0: "Secili Koleksiyon",
  groupTitle1: "Apple Watch Kayislari",
  groupSubtitle1: "One Cikanlar",
  groupTitle2: "Aksesuarlar",
  groupSubtitle2: "Tamamlayicilar",
  groupTitle3: "Deri Saat Kayislari",
  groupSubtitle3: "Klasik Secim",
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
        { value: "1-3 gun", label: translated.heroStatLabel2 },
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
  const copy = getLocalizedCopy(locale);
  const [title, description] = await translateSeoStrings(
    [copy.homeTitle, copy.homeDescription],
    locale,
    "home-seo",
  );

  return buildStorePageMetadata({
    locale,
    pathname: "/",
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
  });
}

export default async function Home() {
  const locale = await getRequestLocale();
  const [homepageData, uiCopy, requestOrigin, blogRows] = await Promise.all([
    getHomepageData(locale),
    getHomepageUiCopy(locale),
    getRequestOrigin(),
    getPublishedPosts().catch(() => []),
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
