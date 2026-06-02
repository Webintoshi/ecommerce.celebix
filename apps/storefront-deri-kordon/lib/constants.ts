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
  address: "Store address is managed from owner panel or storefront settings.",
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
    description: "Delivery within 2-4 business days",
    cost: 29.9,
  },
  {
    id: "express",
    name: "Express Shipping",
    description: "Delivery within 1-2 business days",
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
  vegan: { label: "Vegan", color: "bg-primary/10 text-primary" },
  glutenFree: { label: "Gluten Free", color: "bg-primary/10 text-primary" },
  sugarFree: { label: "Sugar Free", color: "bg-primary/10 text-primary" },
  highProtein: { label: "High Protein", color: "bg-primary/10 text-primary" },
  new: { label: "New", color: "bg-primary/10 text-primary" },
  discount: { label: "Discount", color: "bg-primary/10 text-primary" },
};

export const NAV_LINKS = [
  { name: "Home", href: ROUTES.home },
  { name: "Products", href: ROUTES.products },
  { name: "Blog", href: ROUTES.blog },
  { name: "Contact", href: ROUTES.contact },
  { name: "FAQ", href: "/sss" },
];

export const FOOTER_LINKS = {
  discover: [
    { name: "All Products", href: ROUTES.products },
    { name: "Featured", href: `${ROUTES.products}?sort=featured` },
    { name: "New Arrivals", href: `${ROUTES.products}?sort=newest` },
  ],
  company: [
    { name: "Home", href: ROUTES.home },
    { name: "Blog", href: ROUTES.blog },
    { name: "Contact", href: ROUTES.contact },
    { name: "FAQ", href: "/sss" },
  ],
  policies: [
    { name: "Privacy Policy", href: "/gizlilik" },
    { name: "Return Policy", href: "/iade" },
    { name: "Terms of Service", href: "/sartlar" },
    { name: "Shipping Policy", href: "/kargo" },
  ],
};

export const TESTIMONIALS = [
  {
    id: "1",
    name: "Store Review",
    role: "Placeholder",
    text: "This area is reserved for real customer reviews in the storefront base.",
    rating: 5,
    image: "/placeholder.svg",
  },
  {
    id: "2",
    name: "Editor's Note",
    role: "Placeholder",
    text: "These review blocks can be updated as products, category structure and brand voice become clearer.",
    rating: 5,
    image: "/placeholder.svg",
  },
  {
    id: "3",
    name: "Polish Area",
    role: "Placeholder",
    text: "An agent or designer can quickly turn this base into a live storefront by applying brand polish.",
    rating: 5,
    image: "/placeholder.svg",
  },
];
