/**
 * Page (Static Pages) Domain Model - Single Source of Truth
 * 
 * Canonical type definitions for static pages SEO (Home, Contact, About, etc.)
 * 
 * @module types/page
 * @version 1.0.0
 */

import { STORE_RUNTIME } from "@/lib/store-runtime";

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export interface PageFAQ {
  question: string;
  answer: string;
}

export interface PageGEO {
  keyTakeaways: string[];
  entities: string[];
}

// ============================================================================
// DOMAIN ENTITY
// ============================================================================

/**
 * Static Page entity for SEO management
 * Stores metadata for pages like Home, Contact, About, etc.
 */
export interface StaticPage {
  // Core Identity
  id: string;
  name: string;           // Display name (e.g., "Ana Sayfa")
  slug: string;           // URL slug (e.g., "", "iletisim", "hakkimizda")
  
  // Schema & Structure
  schema_type: string;    // WebSite, ContactPage, AboutPage, etc.
  icon?: string;          // Lucide icon name or emoji
  
  // SEO Fields
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  
  // Structured Data
  faq: PageFAQ[] | null;
  geo_data: PageGEO | null;
  
  // Status
  is_active: boolean;
  sort_order: number;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs
// ============================================================================

export interface PageApiResponse {
  success: boolean;
  pages?: StaticPage[];
  page?: StaticPage;
  error?: string;
  code?: string;
}

export type PageInput = Omit<Partial<StaticPage>, 'id' | 'created_at' | 'updated_at'>;

// ============================================================================
// VIEW MODELS
// ============================================================================

export interface PageSEOViewModel extends StaticPage {
  // UI Aliases
  metaTitle: string;
  metaDescription: string;
  geo: PageGEO;
  url: string;
  
  // Computed
  score: number;
  issues: string[];
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isValidPage(value: unknown): value is StaticPage {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as StaticPage;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.slug === 'string' &&
    typeof p.schema_type === 'string'
  );
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

function calculatePageScore(page: StaticPage): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  
  const title = page.seo_title || '';
  const desc = page.seo_description || '';
  
  if (!title) {
    issues.push("Meta başlık eksik");
    score -= 25;
  } else if (title.length < 30 || title.length > 60) {
    issues.push("Meta başlık uzunluğu ideal değil");
    score -= 10;
  }
  
  if (!desc) {
    issues.push("Meta açıklama eksik");
    score -= 25;
  } else if (desc.length < 120 || desc.length > 160) {
    issues.push("Meta açıklama uzunluğu ideal değil");
    score -= 10;
  }
  
  return { score: Math.max(0, score), issues };
}

export function toPageSEOViewModel(page: StaticPage): PageSEOViewModel {
  const defaultTitle = `${page.name} | ${STORE_RUNTIME.name}`;
  const defaultDesc = '';
  const defaultGEO: PageGEO = { keyTakeaways: [], entities: [] };
  const { score, issues } = calculatePageScore(page);
  
  return {
    ...page,
    metaTitle: page.seo_title || defaultTitle,
    metaDescription: page.seo_description || defaultDesc,
    geo: page.geo_data || defaultGEO,
    url: page.slug === '' ? '/' : `/${page.slug}`,
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
  
  // Map from UI aliases
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) input.seo_description = viewModel.metaDescription;
  if (viewModel.seo_keywords !== undefined) input.seo_keywords = viewModel.seo_keywords;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;
  
  return input;
}

// ============================================================================
// DEFAULT PAGES (Seed Data)
// ============================================================================

export const DEFAULT_PAGES: Omit<StaticPage, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: "Ana Sayfa",
    slug: "",
    schema_type: "WebSite",
    icon: "Home",
    seo_title: `${STORE_RUNTIME.name} | ${STORE_RUNTIME.tagline}`,
    seo_description: `${STORE_RUNTIME.name} magazasinin ana sayfasi. Koleksiyonlar, urunler ve icerikler tek noktada sunulur.`,
    seo_keywords: [STORE_RUNTIME.name.toLowerCase(), "e-ticaret", "urunler"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["WebSite", "Organization"] },
    is_active: true,
    sort_order: 1,
  },
  {
    name: "Ürünler",
    slug: "urunler",
    schema_type: "CollectionPage",
    icon: "Package",
    seo_title: `Tum Urunler | ${STORE_RUNTIME.name}`,
    seo_description: `${STORE_RUNTIME.name} katalogundaki tum urunleri kesfedin.`,
    seo_keywords: ["urunler", "katalog", STORE_RUNTIME.name.toLowerCase()],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["CollectionPage"] },
    is_active: true,
    sort_order: 2,
  },
  {
    name: "İletişim",
    slug: "iletisim",
    schema_type: "ContactPage",
    icon: "Mail",
    seo_title: `Iletisim | ${STORE_RUNTIME.name}`,
    seo_description: `${STORE_RUNTIME.name} ile iletisime gecmek icin bu sayfayi kullanin.`,
    seo_keywords: ["iletişim", "müşteri hizmetleri", "destek"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["ContactPage"] },
    is_active: true,
    sort_order: 3,
  },
  {
    name: "Hakkımızda",
    slug: "hakkimizda",
    schema_type: "AboutPage",
    icon: "Info",
    seo_title: `Hakkimizda | ${STORE_RUNTIME.name}`,
    seo_description: `${STORE_RUNTIME.name} markasinin hikayesini ve magazanin temel yaklasimini inceleyin.`,
    seo_keywords: ["hakkimizda", STORE_RUNTIME.name.toLowerCase(), "marka"],
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
    seo_title: `Sikca Sorulan Sorular | ${STORE_RUNTIME.name}`,
    seo_description: `${STORE_RUNTIME.name} urunleri, siparis, kargo ve iade surecleri hakkindaki sik sorular.`,
    seo_keywords: ["sss", "sıkça sorulan sorular", "yardım"],
    faq: [],
    geo_data: { keyTakeaways: [], entities: ["FAQPage"] },
    is_active: true,
    sort_order: 5,
  },
];
