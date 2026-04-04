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
    siteTitle: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    siteDescription:
      "Roarcraft kalitesinde, yüzde yüz el yapımı hakiki deri kordonlar, Apple Watch kayışları ve premium deri aksesuarlar.",
    homeTitle: "Deri Kordon | El Yapımı Hakiki Deri Kordonlar",
    homeDescription:
      "Roarcraft kalitesinde, yüzde yüz el yapımı hakiki deri kordonlar, Apple Watch kayışları ve premium deri aksesuarlar.",
    productsTitle: "Tüm Ürünler | Deri Kordon",
    productsDescription:
      "El yapımı hakiki deri kordonlar, Apple Watch kayışları ve premium deri aksesuarları keşfedin.",
    contactTitle: "İletişim | Deri Kordon",
    contactDescription:
      "Sorularınız, önerileriniz ve özel sipariş talepleriniz için bizimle iletişime geçin.",
    corporateTitle: "Kurumsal Ürünler | Deri Kordon",
    corporateDescription:
      "Şirketinize özel deri ürünler ve kişiselleştirilmiş kurumsal hediyeler. Markanıza prestij katın.",
    missingProductTitle: "Ürün Bulunamadı | Deri Kordon",
    missingProductDescription: "Aradığınız ürün bulunamadı.",
    missingCategoryTitle: "Kategori Bulunamadı | Deri Kordon",
    menuLabel: "Menü",
    searchLabel: "Ara",
    cartLabel: "Sepeti aç",
    categoriesHeading: "Kategoriler",
    aboutHeading: "Bizi Tanıyın",
    policiesHeading: "Politikalar",
    footerHome: "Ana Sayfa",
    footerAbout: "Hakkımızda",
    footerStores: "Mağazalarımız",
    footerCorporate: "Kurumsal Ürünler",
    footerContact: "İletişim",
    footerDistanceSales: "Mesafeli Satış Sözleşmesi",
    footerReturns: "Teslimat ve İade Politikası",
    footerPrivacy: "Gizlilik Politikası",
    footerKvkk: "KVKK",
    footerRights: "Tüm hakları saklıdır.",
    breadcrumbHome: "Ana Sayfa",
    breadcrumbProducts: "Ürünler",
    faqHeading: "Sıkça sorulan sorular",
  },
  en: {
    siteTitle: "Deri Kordon | Handmade Genuine Leather Straps",
    siteDescription:
      "Handmade genuine leather straps, Apple Watch bands, and premium leather accessories crafted with refined workmanship.",
    homeTitle: "Deri Kordon | Handmade Genuine Leather Straps",
    homeDescription:
      "Handmade genuine leather straps, Apple Watch bands, and premium leather accessories crafted with refined workmanship.",
    productsTitle: "All Products | Deri Kordon",
    productsDescription:
      "Discover handmade genuine leather straps, Apple Watch bands, and premium leather accessories.",
    contactTitle: "Contact | Deri Kordon",
    contactDescription:
      "Get in touch with us for questions, custom requests, and product support.",
    corporateTitle: "Corporate Products | Deri Kordon",
    corporateDescription:
      "Tailored leather products and personalized corporate gifts for your brand.",
    missingProductTitle: "Product Not Found | Deri Kordon",
    missingProductDescription: "The product you are looking for could not be found.",
    missingCategoryTitle: "Category Not Found | Deri Kordon",
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
    siteTitle: "Deri Kordon | Handgefertigte Echtlederarmbänder",
    siteDescription:
      "Handgefertigte Echtlederarmbänder, Apple Watch Armbänder und hochwertige Lederaccessoires mit feiner Verarbeitung.",
    homeTitle: "Deri Kordon | Handgefertigte Echtlederarmbänder",
    homeDescription:
      "Handgefertigte Echtlederarmbänder, Apple Watch Armbänder und hochwertige Lederaccessoires mit feiner Verarbeitung.",
    productsTitle: "Alle Produkte | Deri Kordon",
    productsDescription:
      "Entdecken Sie handgefertigte Echtlederarmbänder, Apple Watch Armbänder und hochwertige Lederaccessoires.",
    contactTitle: "Kontakt | Deri Kordon",
    contactDescription:
      "Kontaktieren Sie uns für Fragen, Sonderanfertigungen und Produktunterstützung.",
    corporateTitle: "Firmenprodukte | Deri Kordon",
    corporateDescription:
      "Individuelle Lederprodukte und personalisierte Firmengeschenke für Ihre Marke.",
    missingProductTitle: "Produkt nicht gefunden | Deri Kordon",
    missingProductDescription: "Das gesuchte Produkt wurde nicht gefunden.",
    missingCategoryTitle: "Kategorie nicht gefunden | Deri Kordon",
    menuLabel: "Menü",
    searchLabel: "Suche",
    cartLabel: "Warenkorb öffnen",
    categoriesHeading: "Kategorien",
    aboutHeading: "Über uns",
    policiesHeading: "Richtlinien",
    footerHome: "Startseite",
    footerAbout: "Über uns",
    footerStores: "Filialen",
    footerCorporate: "Firmenprodukte",
    footerContact: "Kontakt",
    footerDistanceSales: "Fernabsatzvertrag",
    footerReturns: "Lieferung und Rückgabe",
    footerPrivacy: "Datenschutz",
    footerKvkk: "Datenschutzrecht",
    footerRights: "Alle Rechte vorbehalten.",
    breadcrumbHome: "Startseite",
    breadcrumbProducts: "Produkte",
    faqHeading: "Häufige Fragen",
  },
  ru: {
    siteTitle: "Deri Kordon | Кожаные ремешки ручной работы",
    siteDescription:
      "Кожаные ремешки ручной работы, ремешки для Apple Watch и премиальные кожаные аксессуары.",
    homeTitle: "Deri Kordon | Кожаные ремешки ручной работы",
    homeDescription:
      "Кожаные ремешки ручной работы, ремешки для Apple Watch и премиальные кожаные аксессуары.",
    productsTitle: "Все товары | Deri Kordon",
    productsDescription:
      "Откройте для себя кожаные ремешки ручной работы, ремешки Apple Watch и премиальные аксессуары.",
    contactTitle: "Контакты | Deri Kordon",
    contactDescription:
      "Свяжитесь с нами по вопросам, индивидуальным заказам и поддержке по продуктам.",
    corporateTitle: "Корпоративные товары | Deri Kordon",
    corporateDescription:
      "Индивидуальные кожаные изделия и корпоративные подарки для вашего бренда.",
    missingProductTitle: "Товар не найден | Deri Kordon",
    missingProductDescription: "Запрашиваемый товар не найден.",
    missingCategoryTitle: "Категория не найдена | Deri Kordon",
    menuLabel: "Меню",
    searchLabel: "Поиск",
    cartLabel: "Открыть корзину",
    categoriesHeading: "Категории",
    aboutHeading: "О нас",
    policiesHeading: "Политики",
    footerHome: "Главная",
    footerAbout: "О нас",
    footerStores: "Магазины",
    footerCorporate: "Корпоративные товары",
    footerContact: "Контакты",
    footerDistanceSales: "Договор дистанционной продажи",
    footerReturns: "Доставка и возврат",
    footerPrivacy: "Политика конфиденциальности",
    footerKvkk: "Защита данных",
    footerRights: "Все права защищены.",
    breadcrumbHome: "Главная",
    breadcrumbProducts: "Товары",
    faqHeading: "Часто задаваемые вопросы",
  },
  ar: {
    siteTitle: "Deri Kordon | أحزمة جلدية يدوية فاخرة",
    siteDescription:
      "أحزمة جلدية يدوية، أحزمة Apple Watch، وإكسسوارات جلدية فاخرة مصنوعة بعناية.",
    homeTitle: "Deri Kordon | أحزمة جلدية يدوية فاخرة",
    homeDescription:
      "أحزمة جلدية يدوية، أحزمة Apple Watch، وإكسسوارات جلدية فاخرة مصنوعة بعناية.",
    productsTitle: "كل المنتجات | Deri Kordon",
    productsDescription:
      "اكتشف الأحزمة الجلدية اليدوية وأحزمة Apple Watch والإكسسوارات الجلدية الفاخرة.",
    contactTitle: "تواصل معنا | Deri Kordon",
    contactDescription:
      "تواصل معنا للاستفسارات والطلبات الخاصة ودعم المنتجات.",
    corporateTitle: "منتجات الشركات | Deri Kordon",
    corporateDescription:
      "منتجات جلدية مخصصة وهدايا مؤسسية شخصية تعكس قيمة علامتك التجارية.",
    missingProductTitle: "المنتج غير موجود | Deri Kordon",
    missingProductDescription: "المنتج الذي تبحث عنه غير موجود.",
    missingCategoryTitle: "الفئة غير موجودة | Deri Kordon",
    menuLabel: "القائمة",
    searchLabel: "بحث",
    cartLabel: "فتح السلة",
    categoriesHeading: "الفئات",
    aboutHeading: "تعرف علينا",
    policiesHeading: "السياسات",
    footerHome: "الرئيسية",
    footerAbout: "من نحن",
    footerStores: "متاجرنا",
    footerCorporate: "المنتجات المؤسسية",
    footerContact: "اتصل بنا",
    footerDistanceSales: "اتفاقية البيع عن بعد",
    footerReturns: "الشحن والاسترجاع",
    footerPrivacy: "سياسة الخصوصية",
    footerKvkk: "خصوصية البيانات",
    footerRights: "جميع الحقوق محفوظة.",
    breadcrumbHome: "الرئيسية",
    breadcrumbProducts: "المنتجات",
    faqHeading: "الأسئلة الشائعة",
  },
  ka: {
    siteTitle: "Deri Kordon | ხელნაკეთი ნატურალური ტყავის სამაჯურები",
    siteDescription:
      "ხელნაკეთი ნატურალური ტყავის სამაჯურები, Apple Watch-ის სამაჯურები და პრემიუმ ტყავის აქსესუარები.",
    homeTitle: "Deri Kordon | ხელნაკეთი ნატურალური ტყავის სამაჯურები",
    homeDescription:
      "ხელნაკეთი ნატურალური ტყავის სამაჯურები, Apple Watch-ის სამაჯურები და პრემიუმ ტყავის აქსესუარები.",
    productsTitle: "ყველა პროდუქტი | Deri Kordon",
    productsDescription:
      "აღმოაჩინეთ ხელნაკეთი ტყავის სამაჯურები, Apple Watch-ის სამაჯურები და პრემიუმ აქსესუარები.",
    contactTitle: "კონტაქტი | Deri Kordon",
    contactDescription:
      "დაგვიკავშირდით კითხვებისთვის, სპეციალური შეკვეთებისთვის და პროდუქტის მხარდაჭერისთვის.",
    corporateTitle: "კორპორატიული პროდუქტები | Deri Kordon",
    corporateDescription:
      "ბრენდზე მორგებული ტყავის პროდუქცია და პერსონალიზებული კორპორატიული საჩუქრები.",
    missingProductTitle: "პროდუქტი ვერ მოიძებნა | Deri Kordon",
    missingProductDescription: "მოთხოვნილი პროდუქტი ვერ მოიძებნა.",
    missingCategoryTitle: "კატეგორია ვერ მოიძებნა | Deri Kordon",
    menuLabel: "მენიუ",
    searchLabel: "ძებნა",
    cartLabel: "კალათის გახსნა",
    categoriesHeading: "კატეგორიები",
    aboutHeading: "ჩვენ შესახებ",
    policiesHeading: "პოლიტიკები",
    footerHome: "მთავარი",
    footerAbout: "ჩვენ შესახებ",
    footerStores: "მაღაზიები",
    footerCorporate: "კორპორატიული პროდუქტები",
    footerContact: "კონტაქტი",
    footerDistanceSales: "დისტანციური გაყიდვის შეთანხმება",
    footerReturns: "მიწოდება და დაბრუნება",
    footerPrivacy: "კონფიდენციალურობის პოლიტიკა",
    footerKvkk: "მონაცემთა დაცვა",
    footerRights: "ყველა უფლება დაცულია.",
    breadcrumbHome: "მთავარი",
    breadcrumbProducts: "პროდუქტები",
    faqHeading: "ხშირად დასმული კითხვები",
  },
};

const CATEGORY_LABELS: Record<string, Partial<Record<StorefrontLocale, string>>> = {
  "cuzdan-kartlik": {
    en: "Wallets & Cardholders",
    de: "Geldbörsen & Kartenetuis",
    ru: "Кошельки и картхолдеры",
    ar: "المحافظ وحافظات البطاقات",
    ka: "საფულეები და ბარათების ჩასადებები",
  },
  "apple-watch-saat-kayislari": {
    en: "Apple Watch Straps",
    de: "Apple Watch Armbänder",
    ru: "Ремешки Apple Watch",
    ar: "أحزمة Apple Watch",
    ka: "Apple Watch-ის სამაჯურები",
  },
  "saat-kayislari": {
    en: "Watch Straps",
    de: "Uhrenarmbänder",
    ru: "Ремешки для часов",
    ar: "أحزمة الساعات",
    ka: "საათის სამაჯურები",
  },
  "canta-organizer": {
    en: "Bags & Organizers",
    de: "Taschen & Organizer",
    ru: "Сумки и органайзеры",
    ar: "الحقائب والمنظمات",
    ka: "ჩანთები და ორგანიზერები",
  },
  aksesuar: {
    en: "Accessories",
    de: "Accessoires",
    ru: "Аксессуары",
    ar: "الإكسسوارات",
    ka: "აქსესუარები",
  },
  "gunluk-yasam": {
    en: "Everyday Carry",
    de: "Alltag",
    ru: "Повседневная жизнь",
    ar: "الاستخدام اليومي",
    ka: "ყოველდღიური ცხოვრება",
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
  slug: string,
  fallbackLabel: string,
  locale: StorefrontLocale,
) {
  return CATEGORY_LABELS[slug]?.[locale] || fallbackLabel;
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
