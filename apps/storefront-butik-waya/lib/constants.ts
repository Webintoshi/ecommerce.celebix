import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { CategoryInfo } from "@/types/product";

export const SITE_NAME = STOREFRONT_RUNTIME.name;
export const SITE_TAGLINE = STOREFRONT_RUNTIME.tagline;
export const SITE_DESCRIPTION = STOREFRONT_RUNTIME.description;
export const SITE_LOGO_PATH = STOREFRONT_RUNTIME.logoPath;
export const TOP_BAR_MESSAGE = STOREFRONT_RUNTIME.shippingMessage;

export const CONTACT_INFO = {
  email: STOREFRONT_RUNTIME.supportEmail,
  phone: STOREFRONT_RUNTIME.supportPhone,
  whatsapp: STOREFRONT_RUNTIME.supportPhone,
  address: "Mağaza adresi owner panel veya storefront ayarlarıyla güncellenir.",
};

export const SOCIAL_LINKS = {
  instagram: STOREFRONT_RUNTIME.socialInstagram,
  facebook: STOREFRONT_RUNTIME.socialFacebook,
  twitter: STOREFRONT_RUNTIME.socialTwitter,
  youtube: STOREFRONT_RUNTIME.socialInstagram,
};

export const SHIPPING_THRESHOLD = 500;
export const SHIPPING_COST = 29.9;

export const SHIPPING_METHODS = [
  {
    id: "standard",
    name: "Standart Kargo",
    description: "2-4 iş günü içinde teslimat",
    cost: 29.9,
  },
  {
    id: "express",
    name: "Hızlı Kargo",
    description: "1-2 iş günü içinde teslimat",
    cost: 49.9,
  },
];

export const TURKISH_CITIES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bartın",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Düzce",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Iğdır",
  "Isparta",
  "İstanbul",
  "İzmir",
  "Kahramanmaraş",
  "Karabük",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kırıkkale",
  "Kırklareli",
  "Kırşehir",
  "Kilis",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Şırnak",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Şanlıurfa",
  "Usak",
  "Van",
  "Yalova",
  "Yozgat",
  "Zonguldak",
];

export const CATEGORIES: CategoryInfo[] = [];

export const ROUTES = {
  home: "/",
  allProducts: "/urunler",
  products: "/urunler",
  category: (slug: string) => `/${slug}`,
  product: (slug: string) => `/urunler/${slug}`,
  cart: "/sepet",
  checkout: "/odeme",
  about: "/hakkimizda",
  contact: "/iletisim",
  blog: "/blog",
  wishlist: "/favoriler",
  login: "/giris",
  register: "/kayit",
} as const;

export const PRODUCT_BADGES = {
  vegan: { label: "Vegan", color: "bg-primary/10 text-primary" },
  glutenFree: { label: "Glutensiz", color: "bg-primary/10 text-primary" },
  sugarFree: { label: "Şekersiz", color: "bg-primary/10 text-primary" },
  highProtein: { label: "Yüksek Protein", color: "bg-primary/10 text-primary" },
  new: { label: "Yeni", color: "bg-primary/10 text-primary" },
  discount: { label: "İndirim", color: "bg-primary/10 text-primary" },
};

export const NAV_LINKS = [
  { name: "Ana Sayfa", href: ROUTES.home },
  { name: "Ürünler", href: ROUTES.products },
  { name: "Blog", href: ROUTES.blog },
  { name: "İletişim", href: ROUTES.contact },
  { name: "SSS", href: "/sss" },
];

export const FOOTER_LINKS = {
  discover: [
    { name: "Tüm Ürünler", href: ROUTES.products },
    { name: "Öne Çıkanlar", href: `${ROUTES.products}?sort=featured` },
    { name: "Yeni Gelenler", href: `${ROUTES.products}?sort=newest` },
  ],
  company: [
    { name: "Ana Sayfa", href: ROUTES.home },
    { name: "Blog", href: ROUTES.blog },
    { name: "İletişim", href: ROUTES.contact },
    { name: "SSS", href: "/sss" },
  ],
  policies: [
    { name: "Gizlilik Sözleşmesi", href: "/gizlilik" },
    { name: "İade Sözleşmesi", href: "/iade" },
    { name: "Hizmet Şartları", href: "/sartlar" },
    { name: "Kargo Politikası", href: "/kargo" },
  ],
};

export const TESTIMONIALS = [
  {
    id: "1",
    name: "Mağaza Yorumu",
    role: "Placeholder",
    text: "Bu alan gerçek müşteri yorumlarıyla doldurulmak üzere storefront base içine bırakıldı.",
    rating: 5,
    image: "/placeholder.svg",
  },
  {
    id: "2",
    name: "Editor Notu",
    role: "Placeholder",
    text: "Yeni mağazada ürünler, kategori yapısı ve marka dili netleştikçe bu yorum blokları güncellenebilir.",
    rating: 5,
    image: "/placeholder.svg",
  },
  {
    id: "3",
    name: "Polish Alanı",
    role: "Placeholder",
    text: "Agent veya tasarımcı sadece bu base üstüne marka polish uygulayarak hızlı şekilde canlı storefront üretebilir.",
    rating: 5,
    image: "/placeholder.svg",
  },
];
