export const SUPPORTED_LOCALES = ["tr", "en", "de", "ru", "ar", "ka"] as const;
export type StorefrontLocale = (typeof SUPPORTED_LOCALES)[number];

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
  missingCategoryDescription: string;
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

export const LOCALE_COPY: Record<StorefrontLocale, LocaleCopy> = {
  tr: {
    siteTitle: "Premium e-ticaret deneyimi",
    siteDescription:
      "Celebix storefront base, yeni magazalar icin premium ama notr bir baslangic deneyimi sunar.",
    homeTitle: "Premium e-ticaret deneyimi",
    homeDescription:
      "Yeni magazanizi hizli acmak icin premium section yapisi, urun vitrinleri ve mobil uyumlu sayfalar hazir.",
    productsTitle: "Tum Urunler",
    productsDescription: "Koleksiyondaki tum urunleri kesfedin.",
    contactTitle: "Iletisim",
    contactDescription: "Sorulariniz ve ozel talepleriniz icin bizimle iletisime gecin.",
    corporateTitle: "Kurumsal Urunler",
    corporateDescription: "Markaniza ozel kurumsal urun ve hediye seceneklerini inceleyin.",
    missingProductTitle: "Urun bulunamadi",
    missingProductDescription: "Aradiginiz urun bulunamadi.",
    missingCategoryTitle: "Kategori bulunamadi",
    missingCategoryDescription: "Aradiginiz kategori bulunamadi.",
    menuLabel: "Menu",
    searchLabel: "Ara",
    cartLabel: "Sepeti ac",
    categoriesHeading: "Kategoriler",
    aboutHeading: "Bizi taniyin",
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
    siteTitle: "Premium ecommerce experience",
    siteDescription:
      "Celebix storefront base delivers a premium but neutral starting point for new brands.",
    homeTitle: "Premium ecommerce experience",
    homeDescription:
      "Launch new brands faster with a premium layout, curated merchandising blocks, and mobile polish.",
    productsTitle: "All Products",
    productsDescription: "Explore the full catalog.",
    contactTitle: "Contact",
    contactDescription: "Reach out for questions, custom requests, and support.",
    corporateTitle: "Corporate Products",
    corporateDescription: "Discover tailored corporate products and gifting options.",
    missingProductTitle: "Product not found",
    missingProductDescription: "The product you are looking for could not be found.",
    missingCategoryTitle: "Category not found",
    missingCategoryDescription: "The category you are looking for could not be found.",
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Open cart",
    categoriesHeading: "Categories",
    aboutHeading: "About",
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
    siteTitle: "Premium E-Commerce Erlebnis",
    siteDescription:
      "Celebix storefront base bietet einen hochwertigen und neutralen Startpunkt fuer neue Marken.",
    homeTitle: "Premium E-Commerce Erlebnis",
    homeDescription:
      "Starten Sie neue Marken schneller mit hochwertigem Layout und mobil optimierten Seiten.",
    productsTitle: "Alle Produkte",
    productsDescription: "Entdecken Sie den gesamten Katalog.",
    contactTitle: "Kontakt",
    contactDescription: "Kontaktieren Sie uns fuer Fragen und Sonderanfragen.",
    corporateTitle: "Firmenprodukte",
    corporateDescription: "Entdecken Sie individuelle Firmenprodukte und Geschenkoptionen.",
    missingProductTitle: "Produkt nicht gefunden",
    missingProductDescription: "Das gesuchte Produkt wurde nicht gefunden.",
    missingCategoryTitle: "Kategorie nicht gefunden",
    missingCategoryDescription: "Die gesuchte Kategorie wurde nicht gefunden.",
    menuLabel: "Menue",
    searchLabel: "Suche",
    cartLabel: "Warenkorb oeffnen",
    categoriesHeading: "Kategorien",
    aboutHeading: "Ueber uns",
    policiesHeading: "Richtlinien",
    footerHome: "Startseite",
    footerAbout: "Ueber uns",
    footerStores: "Stores",
    footerCorporate: "Firmenprodukte",
    footerContact: "Kontakt",
    footerDistanceSales: "Fernabsatzvertrag",
    footerReturns: "Lieferung und Rueckgabe",
    footerPrivacy: "Datenschutz",
    footerKvkk: "Datenschutzrecht",
    footerRights: "Alle Rechte vorbehalten.",
    breadcrumbHome: "Startseite",
    breadcrumbProducts: "Produkte",
    faqHeading: "Haeufige Fragen",
  },
  ru: {
    siteTitle: "Premium ecommerce opyt",
    siteDescription: "Celebix storefront base daet premium start dlya novyh brendov.",
    homeTitle: "Premium ecommerce opyt",
    homeDescription:
      "Zapuskayte novye brendy bystree s premium strukturou i mobilnoi adaptatsiei.",
    productsTitle: "Vse tovary",
    productsDescription: "Izuchite ves katalog.",
    contactTitle: "Kontakty",
    contactDescription: "Svjazhites s nami po voprosam i individualnym zaprosam.",
    corporateTitle: "Korporativnye tovary",
    corporateDescription: "Izuchite korporativnye podarki i specialnye resheniya.",
    missingProductTitle: "Tovar ne naiden",
    missingProductDescription: "Zaprashivaemyi tovar ne naiden.",
    missingCategoryTitle: "Kategoriya ne naidena",
    missingCategoryDescription: "Zaprashivaemaya kategoriya ne naidena.",
    menuLabel: "Menu",
    searchLabel: "Poisk",
    cartLabel: "Otkryt korzinu",
    categoriesHeading: "Kategorii",
    aboutHeading: "O nas",
    policiesHeading: "Politiki",
    footerHome: "Glavnaya",
    footerAbout: "O nas",
    footerStores: "Magaziny",
    footerCorporate: "Korporativnye tovary",
    footerContact: "Kontakty",
    footerDistanceSales: "Dogovor distantsionnoi prodazhi",
    footerReturns: "Dostavka i vozvrat",
    footerPrivacy: "Politika konfidentsialnosti",
    footerKvkk: "Zashchita dannyh",
    footerRights: "Vse prava zashchishcheny.",
    breadcrumbHome: "Glavnaya",
    breadcrumbProducts: "Tovary",
    faqHeading: "Chasto zadavaemye voprosy",
  },
  ar: {
    siteTitle: "Premium ecommerce experience",
    siteDescription: "Celebix storefront base provides a premium neutral start for new brands.",
    homeTitle: "Premium ecommerce experience",
    homeDescription: "Launch new brands faster with a premium storefront foundation.",
    productsTitle: "All Products",
    productsDescription: "Explore the full catalog.",
    contactTitle: "Contact",
    contactDescription: "Reach us for questions and custom requests.",
    corporateTitle: "Corporate Products",
    corporateDescription: "Explore tailored corporate products and gifts.",
    missingProductTitle: "Product not found",
    missingProductDescription: "The product you are looking for could not be found.",
    missingCategoryTitle: "Category not found",
    missingCategoryDescription: "The category you are looking for could not be found.",
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Open cart",
    categoriesHeading: "Categories",
    aboutHeading: "About",
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
  ka: {
    siteTitle: "Premium ecommerce experience",
    siteDescription: "Celebix storefront base gives new brands a premium neutral starting point.",
    homeTitle: "Premium ecommerce experience",
    homeDescription: "Launch new brands faster with a premium storefront foundation.",
    productsTitle: "All Products",
    productsDescription: "Explore the full catalog.",
    contactTitle: "Contact",
    contactDescription: "Reach out for questions and custom requests.",
    corporateTitle: "Corporate Products",
    corporateDescription: "Discover tailored corporate products and gifts.",
    missingProductTitle: "Product not found",
    missingProductDescription: "The product you are looking for could not be found.",
    missingCategoryTitle: "Category not found",
    missingCategoryDescription: "The category you are looking for could not be found.",
    menuLabel: "Menu",
    searchLabel: "Search",
    cartLabel: "Open cart",
    categoriesHeading: "Categories",
    aboutHeading: "About",
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
};

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

export function buildLocalizedPath(pathname: string, locale: StorefrontLocale): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const strippedPath = stripLocaleFromPathname(normalizedPath);
  return strippedPath === "/" ? `/${locale}` : `/${locale}${strippedPath}`;
}

export function buildLocaleAlternates(pathname: string) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      LOCALE_LANGUAGE_CODES[locale],
      buildLocalizedPath(normalizedPath, locale),
    ]),
  );
}

export function getLocalizedCopy(locale: StorefrontLocale) {
  return LOCALE_COPY[locale] || LOCALE_COPY[DEFAULT_LOCALE];
}

export function getLocalizedCategoryLabel(
  _slug: string,
  fallbackLabel: string,
  _locale: StorefrontLocale,
) {
  return fallbackLabel;
}

export function detectPreferredLocale(
  cookieLocale?: string | null,
  acceptLanguage?: string | null,
): StorefrontLocale {
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  const normalizedAcceptLanguage = (acceptLanguage || "").toLowerCase();
  for (const locale of SUPPORTED_LOCALES) {
    if (
      normalizedAcceptLanguage.includes(`${locale.toLowerCase()}-`) ||
      normalizedAcceptLanguage.includes(`${locale.toLowerCase()},`) ||
      normalizedAcceptLanguage.startsWith(locale.toLowerCase())
    ) {
      return locale;
    }
  }

  return DEFAULT_LOCALE;
}
