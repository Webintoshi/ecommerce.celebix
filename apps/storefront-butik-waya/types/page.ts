/**
 * Page (Static Pages) Domain Model - Single Source of Truth
 *
 * Canonical type definitions for static pages SEO (Home, Contact, About, etc.)
 *
 * @module types/page
 * @version 1.0.0
 */

import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export interface PageFAQ {
  question: string;
  answer: string;
}

export interface PageGEO {
  keyTakeaways: string[];
  entities: string[];
}

export interface StaticPage {
  id: string;
  name: string;
  slug: string;
  schema_type: string;
  icon?: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  faq: PageFAQ[] | null;
  geo_data: PageGEO | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PageApiResponse {
  success: boolean;
  pages?: StaticPage[];
  page?: StaticPage;
  error?: string;
  code?: string;
}

export type PageInput = Omit<Partial<StaticPage>, "id" | "created_at" | "updated_at">;

export interface PageSEOViewModel extends StaticPage {
  metaTitle: string;
  metaDescription: string;
  geo: PageGEO;
  url: string;
  score: number;
  issues: string[];
}

export function isValidPage(value: unknown): value is StaticPage {
  if (typeof value !== "object" || value === null) return false;
  const p = value as StaticPage;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.slug === "string" &&
    typeof p.schema_type === "string"
  );
}

function calculatePageScore(page: StaticPage): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];

  const title = page.seo_title || "";
  const desc = page.seo_description || "";

  if (!title) {
    issues.push("Meta baslik eksik");
    score -= 25;
  } else if (title.length < 30 || title.length > 60) {
    issues.push("Meta baslik uzunlugu ideal degil");
    score -= 10;
  }

  if (!desc) {
    issues.push("Meta aciklama eksik");
    score -= 25;
  } else if (desc.length < 120 || desc.length > 160) {
    issues.push("Meta aciklama uzunlugu ideal degil");
    score -= 10;
  }

  return { score: Math.max(0, score), issues };
}

export function toPageSEOViewModel(page: StaticPage): PageSEOViewModel {
  const defaultTitle = `${page.name} | ${STOREFRONT_RUNTIME.name}`;
  const defaultDesc = "";
  const defaultGEO: PageGEO = { keyTakeaways: [], entities: [] };
  const { score, issues } = calculatePageScore(page);

  return {
    ...page,
    metaTitle: page.seo_title || defaultTitle,
    metaDescription: page.seo_description || defaultDesc,
    geo: page.geo_data || defaultGEO,
    url: page.slug === "" ? "/" : `/${page.slug}`,
    score,
    issues,
  };
}

export function toPageInput(viewModel: Partial<PageSEOViewModel>): PageInput {
  const input: PageInput = {};

  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.schema_type !== undefined) input.schema_type = viewModel.schema_type;
  if (viewModel.icon !== undefined) input.icon = viewModel.icon;
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  if (viewModel.sort_order !== undefined) input.sort_order = viewModel.sort_order;
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) input.seo_description = viewModel.metaDescription;
  if (viewModel.seo_keywords !== undefined) input.seo_keywords = viewModel.seo_keywords;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;

  return input;
}

export const DEFAULT_PAGES: Omit<StaticPage, "id" | "created_at" | "updated_at">[] = [
  {
    name: "Ana Sayfa",
    slug: "",
    schema_type: "WebSite",
    icon: "Home",
    seo_title: `${STOREFRONT_RUNTIME.name} | Premium Magaza Deneyimi`,
    seo_description:
      "Adminden yonetilen urunler, kategoriler ve bannerlarla otomatik olarak guncellenen premium storefront deneyimi.",
    seo_keywords: ["premium storefront", "e-ticaret", "urun vitrini", "celebix"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["WebSite", "Organization"] },
    is_active: true,
    sort_order: 1,
  },
  {
    name: "Urunler",
    slug: "urunler",
    schema_type: "CollectionPage",
    icon: "Package",
    seo_title: `Tum Urunler | ${STOREFRONT_RUNTIME.name}`,
    seo_description:
      "Yayindaki urunleri, secili koleksiyonlari ve admin panelinden yonetilen premium vitrin bloklarini kesfedin.",
    seo_keywords: ["tum urunler", "koleksiyonlar", "premium vitrin"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["CollectionPage"] },
    is_active: true,
    sort_order: 2,
  },
  {
    name: "Iletisim",
    slug: "iletisim",
    schema_type: "ContactPage",
    icon: "Mail",
    seo_title: `Iletisim | ${STOREFRONT_RUNTIME.name}`,
    seo_description:
      "Destek, toptan satis ve proje talepleriniz icin markayla ayni gun baglanti kurun.",
    seo_keywords: ["iletisim", "destek", "teklif", "toptan satis"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["ContactPage"] },
    is_active: true,
    sort_order: 3,
  },
  {
    name: "Hakkimizda",
    slug: "hakkimizda",
    schema_type: "AboutPage",
    icon: "Info",
    seo_title: `Hakkimizda | ${STOREFRONT_RUNTIME.name}`,
    seo_description:
      "Marka profili, vitrin mantigi ve kurumsal iletisim detaylari bu sayfada sunulur.",
    seo_keywords: ["hakkimizda", "marka profili", "kurumsal magaza"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["AboutPage"] },
    is_active: true,
    sort_order: 4,
  },
  {
    name: "SSS",
    slug: "sss",
    schema_type: "FAQPage",
    icon: "HelpCircle",
    seo_title: `Sikca Sorulan Sorular | ${STOREFRONT_RUNTIME.name}`,
    seo_description:
      "Siparis, kargo, iade ve kurumsal sureclerle ilgili en cok sorulan sorularin toplandigi yardim merkezi.",
    seo_keywords: ["sss", "yardim merkezi", "siparis", "kargo", "iade"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["FAQPage"] },
    is_active: true,
    sort_order: 5,
  },
];
