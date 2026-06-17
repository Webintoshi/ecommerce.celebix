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
    sand: "#F7FAF9",
    cream: "#FFFFFF",
    ink: "#111827",
    coffee: "#0F766E",
    blush: "#EA580C",
    slate: "#16213E",
  },
  heroEyebrow: "Hizli ve guvenli alisveris",
  heroTitle: "Gunun ihtiyacini kolayca tamamlayin",
  heroDescription:
    "Hemenaku, secili urunleri sade bir vitrin, net teslimat akisi ve guven veren destek deneyimiyle bir araya getirir.",
} as const;

export const DEFAULT_TRUST_ITEMS = [
  "Guvenli odeme akisi",
  "Net teslimat bilgisi",
  "Kolay iade destegi",
  "Siparis sonrasi takip",
];

export const DEFAULT_DEMO_CATEGORIES: DefaultDemoCategory[] = [
  {
    id: "default-yeni-gelenler",
    name: "Yeni Gelenler",
    slug: "yeni-gelenler",
    href: `${ROUTES.products}?sort=newest`,
    imagePlaceholder: "placeholder-03",
    productCount: 12,
  },
  {
    id: "default-cok-satanlar",
    name: "Cok Satanlar",
    slug: "cok-satanlar",
    href: `${ROUTES.products}?sort=featured`,
    imagePlaceholder: "placeholder-04",
    productCount: 8,
  },
  {
    id: "default-hediye-fikirleri",
    name: "Hediye Fikirleri",
    slug: "hediye-fikirleri",
    href: ROUTES.products,
    imagePlaceholder: "placeholder-05",
    productCount: 16,
  },
  {
    id: "default-gunluk-seckiler",
    name: "Gunluk Seckiler",
    slug: "gunluk-seckiler",
    href: ROUTES.products,
    imagePlaceholder: "placeholder-06",
    productCount: 10,
  },
];

export const DEFAULT_DEMO_PRODUCT_CARDS: DefaultDemoProductCard[] = [
  {
    id: "default-signature",
    title: "Gunun Secimi",
    eyebrow: "Vitrin",
    description: "Hemenaku vitrini yeni urunler icin temiz ve okunabilir bir alan sunar.",
    priceLabel: "Yakinda",
    placeholder: "placeholder-07",
  },
  {
    id: "default-daily",
    title: "Pratik Favori",
    eyebrow: "Secili",
    description: "Urunler yayina alindikca bu alan canli fiyat ve stok bilgisiyle dolar.",
    priceLabel: "Yakinda",
    placeholder: "placeholder-08",
  },
  {
    id: "default-gift",
    title: "Hediye Fikri",
    eyebrow: "Koleksiyon",
    description: "Set, kampanya veya ozel secimler icin duzenli bir vitrin alani.",
    priceLabel: "Yakinda",
    placeholder: "placeholder-09",
  },
  {
    id: "default-season",
    title: "Sezon Notu",
    eyebrow: "Yeni",
    description: "Yeni stoklar geldiginde ziyaretciyi dogrudan urun detayina tasir.",
    priceLabel: "Yakinda",
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
