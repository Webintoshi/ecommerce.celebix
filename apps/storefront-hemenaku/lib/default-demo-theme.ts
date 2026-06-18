import { ROUTES } from "@/lib/constants";

export type DefaultPlaceholderId =
  | "placeholder-01"
  | "placeholder-02"
  | "placeholder-03"
  | "placeholder-04"
  | "placeholder-05"
  | "placeholder-06"
  | "placeholder-07"
  | "placeholder-08"
  | "placeholder-09"
  | "placeholder-10"
  | "placeholder-11"
  | "placeholder-12";

export type DefaultDemoCategory = {
  id: string;
  name: string;
  slug: string;
  href: string;
  imagePlaceholder: DefaultPlaceholderId;
  productCount?: number;
};

export type DefaultDemoProductCard = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  priceLabel: string;
  placeholder: DefaultPlaceholderId;
};

export const DEFAULT_DEMO_THEME = {
  id: "hemenaku-ready",
  name: "Hemenaku",
  palette: {
    sand: "#F5F7FA",
    cream: "#FFFFFF",
    ink: "#0B1220",
    coffee: "#0F172A",
    blush: "#FACC15",
    slate: "#111827",
  },
  heroEyebrow: "Akü ve araç enerji desteği",
  heroTitle: "Doğru akü seçimi için hazır vitrin",
  heroDescription:
    "Hemenaku, araç uyumluluğu, hızlı destek ve güven veren sipariş deneyimini tek bir teknik vitrinde toplar.",
} as const;

export const DEFAULT_TRUST_ITEMS = [
  "Hızlı teslimat",
  "Güvenilir ürün seçimi",
  "Araç uyumluluğu desteği",
  "Kolay sipariş",
];

export const DEFAULT_DEMO_CATEGORIES: DefaultDemoCategory[] = [
  {
    id: "default-yeni-gelenler",
    name: "Aküler",
    slug: "akuler",
    href: `${ROUTES.products}?sort=newest`,
    imagePlaceholder: "placeholder-03",
  },
  {
    id: "default-cok-satanlar",
    name: "Oto elektrik",
    slug: "oto-elektrik",
    href: `${ROUTES.products}?sort=featured`,
    imagePlaceholder: "placeholder-04",
  },
  {
    id: "default-hediye-fikirleri",
    name: "Şarj ve bakım",
    slug: "sarj-ve-bakim",
    href: ROUTES.products,
    imagePlaceholder: "placeholder-05",
  },
  {
    id: "default-gunluk-seckiler",
    name: "Aksesuarlar",
    slug: "aksesuarlar",
    href: ROUTES.products,
    imagePlaceholder: "placeholder-06",
  },
];

export const DEFAULT_DEMO_PRODUCT_CARDS: DefaultDemoProductCard[] = [
  {
    id: "default-signature",
    title: "Akü seçenekleri",
    eyebrow: "Hazırlanıyor",
    description: "Araç tipine göre okunabilir ürün kartları bu alanda yayınlanacak.",
    priceLabel: "Katalog yakında",
    placeholder: "placeholder-07",
  },
  {
    id: "default-daily",
    title: "Oto elektrik",
    eyebrow: "Hazırlanıyor",
    description: "Elektrik ve bakım ürünleri gerçek stokla birlikte burada görünecek.",
    priceLabel: "Katalog yakında",
    placeholder: "placeholder-08",
  },
  {
    id: "default-gift",
    title: "Şarj ve bakım",
    eyebrow: "Hazırlanıyor",
    description: "Şarj cihazı ve bakım ürünleri için boş vitrin düzeni hazır.",
    priceLabel: "Katalog yakında",
    placeholder: "placeholder-09",
  },
  {
    id: "default-season",
    title: "Araç aksesuarları",
    eyebrow: "Hazırlanıyor",
    description: "Tamamlayıcı ürünler geldiğinde fiyat ve stok bilgisiyle listelenecek.",
    priceLabel: "Katalog yakında",
    placeholder: "placeholder-10",
  },
];

export const DEFAULT_NAV_LINKS = [
  { name: "Ana Sayfa", href: ROUTES.home },
  { name: "Urunler", href: ROUTES.products },
  { name: "Blog", href: ROUTES.blog },
  { name: "Iletisim", href: ROUTES.contact },
];

export function getProductPlaceholder(index = 0): DefaultPlaceholderId {
  return DEFAULT_DEMO_PRODUCT_CARDS[index % DEFAULT_DEMO_PRODUCT_CARDS.length].placeholder;
}

export function getCategoryPlaceholder(index = 0): DefaultPlaceholderId {
  return DEFAULT_DEMO_CATEGORIES[index % DEFAULT_DEMO_CATEGORIES.length].imagePlaceholder;
}
