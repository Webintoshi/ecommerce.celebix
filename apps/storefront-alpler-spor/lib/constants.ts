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
  address: "Alpler Spor iletisim ve teslimat bilgileri storefront ayarlarindan guncellenir.",
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
    description: "2-4 is gunu icinde teslimat",
    cost: 29.9,
  },
  {
    id: "express",
    name: "Hizli Kargo",
    description: "1-2 is gunu icinde teslimat",
    cost: 49.9,
  },
];

export const TURKISH_CITIES = [
  "Adana",
  "Adiyaman",
  "Afyonkarahisar",
  "Agri",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydin",
  "Balikesir",
  "Bartin",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingol",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Canakkale",
  "Cankiri",
  "Corum",
  "Denizli",
  "Diyarbakir",
  "Duzce",
  "Edirne",
  "Elazig",
  "Erzincan",
  "Erzurum",
  "Eskisehir",
  "Gaziantep",
  "Giresun",
  "Gumushane",
  "Hakkari",
  "Hatay",
  "Igdir",
  "Isparta",
  "Istanbul",
  "Izmir",
  "Kahramanmaras",
  "Karabuk",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kirikkale",
  "Kirklareli",
  "Kirsehir",
  "Kilis",
  "Kocaeli",
  "Konya",
  "Kutahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Mugla",
  "Mus",
  "Nevsehir",
  "Nigde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Sirnak",
  "Tekirdag",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Sanliurfa",
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
  vegan: { label: "Hafif", color: "bg-primary/10 text-primary" },
  glutenFree: { label: "Dayanikli", color: "bg-primary/10 text-primary" },
  sugarFree: { label: "Nefes Alir", color: "bg-primary/10 text-primary" },
  highProtein: { label: "Performans", color: "bg-primary/10 text-primary" },
  new: { label: "Yeni", color: "bg-primary/10 text-primary" },
  discount: { label: "Indirim", color: "bg-primary/10 text-primary" },
};

export const NAV_LINKS = [
  { name: "Ana Sayfa", href: ROUTES.home },
  { name: "Urunler", href: ROUTES.products },
  { name: "Blog", href: ROUTES.blog },
  { name: "Iletisim", href: ROUTES.contact },
  { name: "SSS", href: "/sss" },
];

export const FOOTER_LINKS = {
  discover: [
    { name: "Tum Urunler", href: ROUTES.products },
    { name: "One Cikanlar", href: `${ROUTES.products}?sort=featured` },
    { name: "Yeni Gelenler", href: `${ROUTES.products}?sort=newest` },
  ],
  company: [
    { name: "Ana Sayfa", href: ROUTES.home },
    { name: "Blog", href: ROUTES.blog },
    { name: "Iletisim", href: ROUTES.contact },
    { name: "SSS", href: "/sss" },
  ],
  policies: [
    { name: "Gizlilik Sozlesmesi", href: "/gizlilik" },
    { name: "Iade Sozlesmesi", href: "/iade" },
    { name: "Hizmet Sartlari", href: "/sartlar" },
    { name: "Kargo Politikasi", href: "/kargo" },
  ],
};

export const TESTIMONIALS = [
  {
    id: "1",
    name: "Koşu Ekibi",
    role: "Nike Air Tn Plus",
    text: "Ayakkabının numara bilgisi netti, siparişten sonra hızlıca kargoya verildi. Ürün fotoğraftaki gibi geldi.",
    rating: 5,
    image: null,
  },
  {
    id: "2",
    name: "Salon Rutini",
    role: "Spor ayakkabı alışverişi",
    text: "Spor ayakkabı seçerken stok ve beden bilgisini hızlı görmek alışverişi kolaylaştırdı.",
    rating: 5,
    image: null,
  },
  {
    id: "3",
    name: "Şehirde Stil",
    role: "Hızlı teslimat",
    text: "Paketleme temizdi, ürün orijinal ve beklediğim kalitedeydi. Kategori düzeni sayesinde aradığım modeli hızlı buldum.",
    rating: 5,
    image: null,
  },
];
