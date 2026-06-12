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
  id: "default-premium",
  name: "Default Premium",
  palette: {
    sand: "#F6F1EB",
    cream: "#FFF9F2",
    ink: "#140D08",
    coffee: "#8A6847",
    blush: "#C7A985",
    slate: "#0B1120",
  },
  heroEyebrow: "Yeni sezon vitrini",
  heroTitle: "Modern magaza deneyimi hazir",
  heroDescription:
    "Secili urunler, guvenli odeme, hizli teslimat ve marka hikayeniz tek bir premium vitrin deneyiminde bulusur.",
} as const;

export const DEFAULT_TRUST_ITEMS = [
  "Guvenli odeme",
  "Hizli teslimat",
  "Kolay iade",
  "Canli destek",
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
    title: "Signature Urun",
    eyebrow: "Vitrin Secimi",
    description: "Markanizin one cikan urunu icin premium kart alani.",
    priceLabel: "1.250 TL",
    placeholder: "placeholder-07",
  },
  {
    id: "default-daily",
    title: "Gunluk Favori",
    eyebrow: "Yeni Gelen",
    description: "Kategori ve varyantlar eklendikce gercek urunle degisir.",
    priceLabel: "890 TL",
    placeholder: "placeholder-08",
  },
  {
    id: "default-gift",
    title: "Hediye Secimi",
    eyebrow: "Editor Secimi",
    description: "Hediye, set veya kampanya urunleri icin temiz alan.",
    priceLabel: "1.490 TL",
    placeholder: "placeholder-09",
  },
  {
    id: "default-season",
    title: "Sezon Parcasi",
    eyebrow: "Cok Satan",
    description: "Ilk stoklar girilene kadar vitrinin bos gorunmesini engeller.",
    priceLabel: "720 TL",
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
