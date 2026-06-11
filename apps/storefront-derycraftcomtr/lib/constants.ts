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
  address: "Store address is managed from storefront settings.",
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
    name: "Standard Shipping",
    description: "2-4 is gunu icinde teslimat",
    cost: 29.9,
  },
  {
    id: "express",
    name: "Express Shipping",
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
  giftFinder: "/hediye-bulucu",
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
  { name: "Hediye Bulucu", href: ROUTES.giftFinder },
  { name: "Blog", href: ROUTES.blog },
  { name: "İletişim", href: ROUTES.contact },
  { name: "SSS", href: "/sss" },
];

export const FOOTER_LINKS = {
  discover: [
    { name: "Tüm Ürünler", href: ROUTES.products },
    { name: "Hediye Bulucu", href: ROUTES.giftFinder },
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
    { name: "Gizlilik Politikası", href: "/gizlilik" },
    { name: "İade Politikası", href: "/iade" },
    { name: "Kullanım Şartları", href: "/sartlar" },
    { name: "Kargo Politikası", href: "/kargo" },
  ],
};

export const TESTIMONIALS = [
  {
    id: "1",
    name: "Caner T.",
    role: "Doğrulanmış Alıcı",
    title: "Kesinlikle tavsiye ederim",
    text: "Tütün kesesi aldım, kalite ve işçilik gerçekten çok iyi. Ürün fotoğrafındaki gibi geldi.",
    rating: 5,
    proofImages: [
      "https://images.celebix.co/image/https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-31-at-14.43.14.avif?width=96",
    ],
  },
  {
    id: "2",
    name: "Aslı B.",
    role: "Doğrulanmış Alıcı",
    title: "Muazzam işçilik",
    text: "Şahane işçilikle mükemmel bir ürün çıkmış. Kullandıkça güzelleşiyor, el yapımı olduğu hemen belli oluyor.",
    rating: 5,
    proofImages: [
      "https://images.celebix.co/image/https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.41adasd-scaled.webp?width=96",
    ],
  },
  {
    id: "3",
    name: "Melis G.",
    role: "Doğrulanmış Alıcı",
    title: "Sade ve şık",
    text: "Ürün dayanıklı, kullanışlı ve gerçekten güzel görünüyor. Paketleme de çok özenliydi.",
    rating: 5,
    proofImages: [
      "https://images.celebix.co/image/https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.37.jpg?width=96",
    ],
  },
  {
    id: "4",
    name: "Ertan Z.",
    role: "Doğrulanmış Alıcı",
    title: "Saatime çok yakıştı",
    text: "Deri saat kayışım geldi, sanki saatimi yeniden almış gibi oldum. Renk ve dikiş kalitesi harika.",
    rating: 5,
    proofImages: [
      "https://images.celebix.co/image/https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/asdasdasdas.avif?width=96",
    ],
  },
  {
    id: "5",
    name: "Nihat C.",
    role: "Doğrulanmış Alıcı",
    title: "Kalite standartların üstünde",
    text: "İşçilikten memnun kaldım. Deri dokusu, dikiş detayı ve teslimat süreci beklentimin üzerindeydi.",
    rating: 5,
    proofImages: [
      "https://images.celebix.co/image/https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Yorumlar/WhatsApp-Image-2025-01-30-at-21.35.37-1.avif?width=96",
    ],
  },
];
