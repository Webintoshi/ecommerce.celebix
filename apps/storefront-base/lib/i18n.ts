import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export const SUPPORTED_LOCALES = ["tr", "en", "de", "ru", "ar", "ka"] as const;
export type StorefrontLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleRoutingMode = "prefixed" | "prefixless";
export type LocaleRoutingConfig = {
  mode: LocaleRoutingMode;
  sourceLocale: StorefrontLocale;
  enabledLocales: StorefrontLocale[];
  availableLocales: StorefrontLocale[];
  showLocaleSwitcher: boolean;
};

export const DEFAULT_LOCALE: StorefrontLocale = "tr";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const LOCALE_LANGUAGE_CODES: Record<StorefrontLocale, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  ru: "ru-RU",
  ar: "ar-SA",
  ka: "ka-GE",
};

export const RTL_LOCALES = new Set<StorefrontLocale>(["ar"]);

export const LOCALE_LABELS: Record<StorefrontLocale, string> = {
  tr: "TR",
  en: "EN",
  de: "DE",
  ru: "RU",
  ar: "AR",
  ka: "KA",
};

type LocaleCopy = {
  siteTitle: string;
  siteDescription: string;
  homeTitle: string;
  homeDescription: string;
  productsTitle: string;
  productsDescription: string;
  contactTitle: string;
  contactDescription: string;
  corporateTitle: string;
  corporateDescription: string;
  missingProductTitle: string;
  missingProductDescription: string;
  missingCategoryTitle: string;
  missingCategoryDescription?: string;
  menuLabel: string;
  searchLabel: string;
  cartLabel: string;
  categoriesHeading: string;
  aboutHeading: string;
  policiesHeading: string;
  footerHome: string;
  footerAbout: string;
  footerStores: string;
  footerCorporate: string;
  footerContact: string;
  footerDistanceSales: string;
  footerReturns: string;
  footerPrivacy: string;
  footerKvkk: string;
  footerRights: string;
  breadcrumbHome: string;
  breadcrumbProducts: string;
  faqHeading: string;
};

function getRuntimeCopyDefaults(locale: StorefrontLocale) {
  const name = STOREFRONT_RUNTIME.name;

  switch (locale) {
    case "en":
      return {
        siteTitle: `${name} | Premium Storefront`,
        siteDescription:
          "A premium storefront that turns admin-managed products, categories, banners, and reviews into a polished brand website.",
        homeTitle: `${name} | Premium Storefront`,
        homeDescription:
          "A premium storefront that turns admin-managed products, categories, banners, and reviews into a polished brand website.",
        productsTitle: `All Products | ${name}`,
        productsDescription:
          "Discover all published products, curated collections, and merchandising blocks managed from your admin panel.",
        contactTitle: `Contact | ${name}`,
        contactDescription:
          "Get in touch for support, wholesale inquiries, and custom project requests.",
        corporateTitle: `Corporate Products | ${name}`,
        corporateDescription:
          "Showcase premium corporate gifting, branded product sets, and admin-managed presentation pages.",
        missingProductTitle: `Product Not Found | ${name}`,
        missingProductDescription: "The product you are looking for could not be found.",
        missingCategoryTitle: `Category Not Found | ${name}`,
        missingCategoryDescription:
          "This collection is not available yet. Published categories will appear here automatically.",
      };
    default:
      return {
        siteTitle: `${name} | Premium Magaza Deneyimi`,
        siteDescription:
          "Adminden yonetilen urunler, kategoriler, bannerlar ve yorumlar ile otomatik olarak premium vitrine donusen modern storefront deneyimi.",
        homeTitle: `${name} | Premium Magaza Deneyimi`,
        homeDescription:
          "Adminden yonetilen urunler, kategoriler, bannerlar ve yorumlar ile otomatik olarak premium vitrine donusen modern storefront deneyimi.",
        productsTitle: `Tum Urunler | ${name}`,
        productsDescription:
          "Yayindaki urunleri, secili koleksiyonlari ve premium vitrin bloklarini tek bir akista kesfedin.",
        contactTitle: `Iletisim | ${name}`,
        contactDescription:
          "Destek, toptan satis ve ozel proje talepleriniz icin bizimle iletisime gecin.",
        corporateTitle: `Kurumsal Urunler | ${name}`,
        corporateDescription:
          "Markanizi premium urunler, ozel hediye setleri ve admin yonetimli kurumsal vitrinle guclendirin.",
        missingProductTitle: `Urun Bulunamadi | ${name}`,
        missingProductDescription: "Aradiginiz urun bulunamadi.",
        missingCategoryTitle: `Kategori Bulunamadi | ${name}`,
        missingCategoryDescription:
          "Istenen koleksiyon henuz hazir degil. Yayinlanan kategoriler otomatik olarak burada listelenecek.",
      };
  }
}

const BASE_LOCALE_COPY: Record<StorefrontLocale, Omit<LocaleCopy, keyof ReturnType<typeof getRuntimeCopyDefaults>>> = {
  tr: {
    menuLabel: "Menu",
    searchLabel: "Ara",
    cartLabel: "Sepeti ac",
    categoriesHeading: "Kategoriler",
    aboutHeading: "Bizi Taniyin",
    policiesHeading: "Politikalar",
    footerHome: "Ana Sayfa",
    footerAbout: "Hakkimizda",
    footerStores: "Magazalarimiz",
    footerCorporate: "Kurumsal Urunler",
    footerContact: "Iletisim",
    footerDistanceSales: "Mesafeli Satis Sozlesmesi",
    footerReturns: "Teslimat ve Iade Politikasi",
    footerPrivacy: "Gizlilik Politikasi",
    footerKvkk: "KVKK",
    footerRights: "Tum haklari saklidir.",
    breadcrumbHome: "Ana Sayfa",
    breadcrumbProducts: "Urunler",
    faqHeading: "Sikca sorulan sorular",
  },
  en: {
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Open cart",
    categoriesHeading: "Categories",
    aboutHeading: "Discover Us",
    policiesHeading: "Policies",
    footerHome: "Home",
    footerAbout: "About",
    footerStores: "Stores",
    footerCorporate: "Corporate Products",
    footerContact: "Contact",
    footerDistanceSales: "Distance Sales Agreement",
    footerReturns: "Delivery and Returns",
    footerPrivacy: "Privacy Policy",
    footerKvkk: "Data Privacy",
    footerRights: "All rights reserved.",
    breadcrumbHome: "Home",
    breadcrumbProducts: "Products",
    faqHeading: "Frequently asked questions",
  },
  de: {
    menuLabel: "Menu",
    searchLabel: "Suche",
    cartLabel: "Warenkorb",
    categoriesHeading: "Kategorien",
    aboutHeading: "Uber Uns",
    policiesHeading: "Richtlinien",
    footerHome: "Startseite",
    footerAbout: "Uber uns",
    footerStores: "Filialen",
    footerCorporate: "Firmenprodukte",
    footerContact: "Kontakt",
    footerDistanceSales: "Fernabsatzvertrag",
    footerReturns: "Lieferung und Ruckgabe",
    footerPrivacy: "Datenschutz",
    footerKvkk: "Datenschutzrecht",
    footerRights: "Alle Rechte vorbehalten.",
    breadcrumbHome: "Startseite",
    breadcrumbProducts: "Produkte",
    faqHeading: "Haufige Fragen",
  },
  ru: {
    menuLabel: "Menu",
    searchLabel: "Poisk",
    cartLabel: "Korzinа",
    categoriesHeading: "Kategorii",
    aboutHeading: "O nas",
    policiesHeading: "Politiki",
    footerHome: "Glavnaya",
    footerAbout: "O nas",
    footerStores: "Magaziny",
    footerCorporate: "Korporativnye tovary",
    footerContact: "Kontakty",
    footerDistanceSales: "Distantsionnaya prodazha",
    footerReturns: "Dostavka i vozvrat",
    footerPrivacy: "Konfidentsialnost",
    footerKvkk: "Zashchita dannykh",
    footerRights: "Vse prava zashchishcheny.",
    breadcrumbHome: "Glavnaya",
    breadcrumbProducts: "Produkty",
    faqHeading: "Chasto zadavaemye voprosy",
  },
  ar: {
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Cart",
    categoriesHeading: "Categories",
    aboutHeading: "About",
    policiesHeading: "Policies",
    footerHome: "Home",
    footerAbout: "About",
    footerStores: "Stores",
    footerCorporate: "Corporate Products",
    footerContact: "Contact",
    footerDistanceSales: "Distance Sales",
    footerReturns: "Returns",
    footerPrivacy: "Privacy",
    footerKvkk: "Data Privacy",
    footerRights: "All rights reserved.",
    breadcrumbHome: "Home",
    breadcrumbProducts: "Products",
    faqHeading: "Frequently asked questions",
  },
  ka: {
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Cart",
    categoriesHeading: "Categories",
    aboutHeading: "About",
    policiesHeading: "Policies",
    footerHome: "Home",
    footerAbout: "About",
    footerStores: "Stores",
    footerCorporate: "Corporate Products",
    footerContact: "Contact",
    footerDistanceSales: "Distance Sales",
    footerReturns: "Returns",
    footerPrivacy: "Privacy",
    footerKvkk: "Data Privacy",
    footerRights: "All rights reserved.",
    breadcrumbHome: "Home",
    breadcrumbProducts: "Products",
    faqHeading: "Frequently asked questions",
  },
};

const CATEGORY_LABELS: Record<string, Partial<Record<StorefrontLocale, string>>> = {};

export function isSupportedLocale(value?: string | null): value is StorefrontLocale {
  return Boolean(value && SUPPORTED_LOCALES.includes(value as StorefrontLocale));
}

export function getLocaleFromPathname(pathname?: string | null): StorefrontLocale | null {
  if (!pathname) {
    return null;
  }

  const [, firstSegment] = pathname.split("/");
  return isSupportedLocale(firstSegment) ? firstSegment : null;
}

export function stripLocaleFromPathname(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);
  if (!locale) {
    return pathname || "/";
  }

  const nextPath = pathname.replace(new RegExp(`^/${locale}`), "") || "/";
  return nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
}

type LocalizedPathOptions = Pick<LocaleRoutingConfig, "mode" | "sourceLocale">;

export function buildLocalizedPath(
  pathname: string,
  locale: StorefrontLocale,
  routing?: LocalizedPathOptions,
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const strippedPath = stripLocaleFromPathname(normalizedPath);
  const mode = routing?.mode ?? "prefixed";

  if (mode === "prefixless") {
    return strippedPath;
  }

  return strippedPath === "/" ? `/${locale}` : `/${locale}${strippedPath}`;
}

export function buildLocaleAlternates(
  pathname: string,
  routing?: LocaleRoutingConfig,
) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (routing?.mode === "prefixless") {
    return undefined;
  }

  const locales = routing?.availableLocales ?? [...SUPPORTED_LOCALES];

  return Object.fromEntries(
    locales.map((locale) => [
      LOCALE_LANGUAGE_CODES[locale],
      buildLocalizedPath(normalizedPath, locale, routing),
    ]),
  );
}

export function getLocalizedCopy(locale: StorefrontLocale): LocaleCopy {
  return {
    ...BASE_LOCALE_COPY[locale],
    ...getRuntimeCopyDefaults(locale),
  };
}

export function getLocalizedCategoryLabel(
  slug: string,
  fallbackLabel: string,
  locale: StorefrontLocale,
) {
  return CATEGORY_LABELS[slug]?.[locale] || fallbackLabel;
}

export function detectPreferredLocale(
  cookieLocale?: string | null,
  acceptLanguage?: string | null,
  allowedLocales: readonly StorefrontLocale[] = SUPPORTED_LOCALES,
  fallbackLocale: StorefrontLocale = DEFAULT_LOCALE,
): StorefrontLocale {
  if (isSupportedLocale(cookieLocale) && allowedLocales.includes(cookieLocale)) {
    return cookieLocale;
  }

  const normalizedAcceptLanguage = (acceptLanguage || "").toLowerCase();
  for (const locale of allowedLocales) {
    if (
      normalizedAcceptLanguage.includes(`${locale.toLowerCase()}-`) ||
      normalizedAcceptLanguage.includes(`${locale.toLowerCase()},`) ||
      normalizedAcceptLanguage.startsWith(locale.toLowerCase())
    ) {
      return locale;
    }
  }

  return fallbackLocale;
}
