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
  address: "Alpler Spor ileti?im ve teslimat bilgileri storefront ayarlar?ndan g?ncellenir.",
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
    description: "2-4 i? g?n? i?inde teslimat",
    cost: 29.9,
  },
  {
    id: "express",
    name: "H?zl? Kargo",
    description: "1-2 i? g?n? i?inde teslimat",
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
  glutenFree: { label: "Dayan?kl?", color: "bg-primary/10 text-primary" },
  sugarFree: { label: "Nefes Al?r", color: "bg-primary/10 text-primary" },
  highProtein: { label: "Performans", color: "bg-primary/10 text-primary" },
  new: { label: "Yeni", color: "bg-primary/10 text-primary" },
  discount: { label: "?ndirim", color: "bg-primary/10 text-primary" },
};

export const NAV_LINKS = [
  { name: "Ana Sayfa", href: ROUTES.home },
  { name: "?r?nler", href: ROUTES.products },
  { name: "Blog", href: ROUTES.blog },
  { name: "?leti?im", href: ROUTES.contact },
  { name: "SSS", href: "/sss" },
];

export const FOOTER_LINKS = {
  discover: [
    { name: "T?m ?r?nler", href: ROUTES.products },
    { name: "?ne ??kanlar", href: `${ROUTES.products}?sort=featured` },
    { name: "Yeni Gelenler", href: `${ROUTES.products}?sort=newest` },
  ],
  company: [
    { name: "Ana Sayfa", href: ROUTES.home },
    { name: "Blog", href: ROUTES.blog },
    { name: "?leti?im", href: ROUTES.contact },
    { name: "SSS", href: "/sss" },
  ],
  policies: [
    { name: "Gizlilik S?zle?mesi", href: "/gizlilik" },
    { name: "?ade S?zle?mesi", href: "/iade" },
    { name: "Hizmet ?artlar?", href: "/sartlar" },
    { name: "Kargo Politikas?", href: "/kargo" },
  ],
};

export const TESTIMONIALS = [
  {
    id: "1",
    name: "KoÅŸu Ekibi",
    role: "Nike Air Tn Plus",
    text: "AyakkabÄ±nÄ±n numara bilgisi netti, sipariÅŸten sonra hÄ±zlÄ±ca kargoya verildi. ÃœrÃ¼n fotoÄŸraftaki gibi geldi.",
    rating: 5,
    image: null,
  },
  {
    id: "2",
    name: "Salon Rutini",
    role: "Spor ayakkabÄ± alÄ±ÅŸveriÅŸi",
    text: "Spor ayakkabÄ± seÃ§erken stok ve beden bilgisini hÄ±zlÄ± gÃ¶rmek alÄ±ÅŸveriÅŸi kolaylaÅŸtÄ±rdÄ±.",
    rating: 5,
    image: null,
  },
  {
    id: "3",
    name: "Åehirde Stil",
    role: "HÄ±zlÄ± teslimat",
    text: "Paketleme temizdi, Ã¼rÃ¼n orijinal ve beklediÄŸim kalitedeydi. Kategori dÃ¼zeni sayesinde aradÄ±ÄŸÄ±m modeli hÄ±zlÄ± buldum.",
    rating: 5,
    image: null,
  },
];

