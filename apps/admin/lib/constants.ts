import { STORE_RUNTIME } from "@/lib/store-runtime";
import type { CategoryInfo } from "@/types/product";

// Site Bilgileri
export const SITE_NAME = STORE_RUNTIME.name;
export const SITE_TAGLINE = STORE_RUNTIME.tagline;
export const SITE_DESCRIPTION =
  `${STORE_RUNTIME.name} magazasinda urunlerinizi, kategorilerinizi ve iceriklerinizi tek panelden yonetin.`;

// İletişim Bilgileri
export const CONTACT_INFO = {
  email: STORE_RUNTIME.supportEmail,
  phone: STORE_RUNTIME.supportPhone,
  whatsapp: STORE_RUNTIME.supportPhone,
  address: "",
};

// Sosyal Medya
export const SOCIAL_LINKS = {
  instagram: STORE_RUNTIME.storefrontUrl,
  facebook: STORE_RUNTIME.storefrontUrl,
  twitter: STORE_RUNTIME.storefrontUrl,
  youtube: STORE_RUNTIME.storefrontUrl,
};

// Kargo Bilgileri
export const SHIPPING_THRESHOLD = 500; // Ücretsiz kargo sınırı (TL)
export const SHIPPING_COST = 29.9; // Standart kargo ücreti (TL)

// Kargo Yöntemleri
export const SHIPPING_METHODS = [
  {
    id: "standard",
    name: "Standart Kargo",
    description: "2-3 iş günü içinde teslimat",
    cost: 29.9,
  },
  {
    id: "express",
    name: "Hızlı Kargo",
    description: "1-2 iş günü içinde teslimat",
    cost: 49.9,
  },
];

// Türkiye İlleri
export const TURKISH_CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", "Ardahan", "Artvin",
  "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur",
  "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan",
  "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul",
  "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kırıkkale", "Kırklareli", "Kırşehir",
  "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Mardin", "Mersin", "Muğla", "Muş",
  "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas",
  "Şırnak", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yalova", "Yozgat",
  "Zonguldak",
];

// Kategoriler - ARTIK STATİK YOK! Database'den çekiliyor.
// Kategorileri lib/categories.ts -> fetchCategories() kullanarak çekin
export const CATEGORIES: CategoryInfo[] = [];

// URL Yolları
export const ROUTES = {
  home: "/",
  allProducts: "/urunler",
  products: "/urunler",
  category: (slug: string) => `/koleksiyon/${slug}`,
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

// Ürün Özellik Rozetleri
export const PRODUCT_BADGES = {
  vegan: { label: "Vegan", color: "bg-primary/10 text-primary" },
  glutenFree: { label: "Glutensiz", color: "bg-primary/10 text-primary" },
  sugarFree: { label: "Şekersiz", color: "bg-primary/10 text-primary" },
  highProtein: { label: "Yüksek Protein", color: "bg-primary/10 text-primary" },
  new: { label: "Yeni", color: "bg-primary/10 text-primary" },
  discount: { label: "İndirim", color: "bg-primary/10 text-primary" },
};

// Nav Linkleri
export const NAV_LINKS = [
  { name: "Ana Sayfa", href: ROUTES.home },
  { name: "Tüm Ürünler", href: ROUTES.allProducts },
  { name: "Fıstık Ezmeleri", href: ROUTES.category("fistik-ezmesi") },
  { name: "Fındık Ezmeleri", href: ROUTES.category("findik-ezmesi") },
  { name: "Kuruyemişler", href: ROUTES.category("kuruyemisler") },
  { name: "SSS", href: "/sss" },
];

// Footer Linkleri
export const FOOTER_LINKS = {
  categories: [
    { name: "Fıstık Ezmeleri", href: ROUTES.category("fistik-ezmesi") },
    { name: "Fındık Ezmeleri", href: ROUTES.category("findik-ezmesi") },
    { name: "Kuruyemişler", href: ROUTES.category("kuruyemisler") },
  ],
  useful: [
    { name: "Ana Sayfa", href: ROUTES.home },
    { name: "Tüm Ürünler", href: ROUTES.allProducts },
    { name: "SSS", href: "/sss" },
  ],
  policies: [
    { name: "Gizlilik Sözleşmesi", href: "/gizlilik" },
    { name: "İade Sözleşmesi", href: "/iade" },
    { name: "Hizmet Şartları", href: "/sartlar" },
    { name: "Kargo Politikası", href: "/kargo" },
  ],
};

// Müşteri Yorumları
export const TESTIMONIALS = [
  {
    id: "1",
    name: "Sadullah",
    role: "Mağaza Değerlendirmesi",
    text: "Ürünler kaliteli ve taze. Kesinlikle tavsiye ediyorum.",
    rating: 5,
    image: "/images/testimonials/sadullah.jpg",
  },
  {
    id: "2",
    name: "Sadullah",
    role: "Ürün Değerlendirmesi",
    text: "Şekersiz Fıstık Ezmesi 450G harika. Lezzeti gerçekten doğal ve taze.",
    rating: 5,
    image: "/images/testimonials/sadullah2.jpg",
  },
  {
    id: "3",
    name: "Cem Devran",
    role: "Ürün Değerlendirmesi",
    text: `Siparisim cok hizli geldi. Tesekkurler ${STORE_RUNTIME.name}!`,
    rating: 5,
    image: "/images/testimonials/cem.jpg",
  },
];
