import {
  auditProductSEO,
  buildProductSEOSuggestion,
  normalizeProductSEOFields,
  type ProductSEOAudit,
  type ProductSEOFamily,
  type ProductSEOIssue,
  type ProductSEORobots,
  type ProductSEOSuggestion,
} from "@/lib/product-seo";
import { extractPlainTextFromProductDescription } from "@celebix/platform-config/src/product-description-rich-text";

export interface ProductFAQ {
  question: string;
  answer: string;
}

export interface ProductGEO {
  keyTakeaways: string[];
  entities: string[];
}

export interface ProductWithSEO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[];
  category: string;
  subcategory: string | null;
  tags: string[];
  variants: ProductVariant[];
  is_active: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new: boolean;
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  rating: number;
  review_count: number;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  seo_focus_keyword: string | null;
  canonical_url: string | null;
  seo_robots: ProductSEORobots | null;
  og_image: string | null;
  faq: ProductFAQ[] | null;
  geo_data: ProductGEO | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
}

export interface ProductApiResponse {
  success: boolean;
  products?: ProductWithSEO[];
  product?: ProductWithSEO;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
  code?: string;
}

export type ProductInput = Omit<
  Partial<ProductWithSEO>,
  "id" | "created_at" | "updated_at"
>;

export interface ProductSEOViewModel extends ProductWithSEO {
  metaTitle: string;
  metaDescription: string;
  seoKeywords: string[];
  seoFocusKeyword: string;
  canonicalUrl: string | null;
  seoRobots: ProductSEORobots;
  ogImage: string | null;
  effectiveMetaTitle: string;
  effectiveMetaDescription: string;
  effectiveCanonicalUrl: string;
  effectiveOgImage: string | null;
  seoAudit: ProductSEOAudit;
  seoSuggestion: ProductSEOSuggestion;
  family: ProductSEOFamily;
  wordCount: number;
  readingTime: number;
  score: number;
  issues: ProductSEOIssue[];
  schemaType: string;
}

export function isProductFAQ(value: unknown): value is ProductFAQ {
  return (
    typeof value === "object" &&
    value !== null &&
    "question" in value &&
    "answer" in value &&
    typeof (value as ProductFAQ).question === "string" &&
    typeof (value as ProductFAQ).answer === "string"
  );
}

export function isProductGEO(value: unknown): value is ProductGEO {
  return (
    typeof value === "object" &&
    value !== null &&
    "keyTakeaways" in value &&
    Array.isArray((value as ProductGEO).keyTakeaways) &&
    "entities" in value &&
    Array.isArray((value as ProductGEO).entities)
  );
}

export function isValidProduct(value: unknown): value is ProductWithSEO {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const product = value as ProductWithSEO;
  return (
    typeof product.id === "string" &&
    typeof product.name === "string" &&
    typeof product.slug === "string"
  );
}

export function toProductSEOViewModel(
  product: ProductWithSEO,
): ProductSEOViewModel {
  const normalizedSEO = normalizeProductSEOFields(product);
  const seoSuggestion = buildProductSEOSuggestion(product);
  const seoAudit = auditProductSEO(product);
  const plainDescription = extractPlainTextFromProductDescription(
    product.description || "",
  );
  const fallbackDescription = product.short_description || plainDescription;
  const wordCount = plainDescription.split(/\s+/).filter(Boolean).length;

  return {
    ...product,
    metaTitle: normalizedSEO.metaTitle,
    metaDescription: normalizedSEO.metaDescription,
    seoKeywords: normalizedSEO.keywords,
    seoFocusKeyword: normalizedSEO.focusKeyword,
    canonicalUrl: normalizedSEO.canonicalUrl,
    seoRobots: normalizedSEO.robots,
    ogImage: normalizedSEO.ogImage,
    effectiveMetaTitle: normalizedSEO.metaTitle || seoSuggestion.metaTitle,
    effectiveMetaDescription:
      normalizedSEO.metaDescription ||
      seoSuggestion.metaDescription ||
      fallbackDescription,
    effectiveCanonicalUrl: seoAudit.effectiveCanonicalUrl,
    effectiveOgImage: normalizedSEO.ogImage || seoSuggestion.ogImage,
    seoAudit,
    seoSuggestion,
    family: seoAudit.family,
    wordCount,
    readingTime: Math.max(1, Math.ceil(wordCount / 200)),
    score: seoAudit.score,
    issues: seoAudit.issues,
    schemaType: "Product",
  };
}

export function toProductInput(
  viewModel: Partial<ProductSEOViewModel>,
): ProductInput {
  const input: ProductInput = {};

  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.description !== undefined) input.description = viewModel.description;
  if (viewModel.short_description !== undefined) {
    input.short_description = viewModel.short_description;
  }
  if (viewModel.images !== undefined) input.images = viewModel.images;
  if (viewModel.category !== undefined) input.category = viewModel.category;
  if (viewModel.subcategory !== undefined) {
    input.subcategory = viewModel.subcategory;
  }
  if (viewModel.tags !== undefined) input.tags = viewModel.tags;
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  if (viewModel.is_featured !== undefined) {
    input.is_featured = viewModel.is_featured;
  }
  if (viewModel.is_bestseller !== undefined) {
    input.is_bestseller = viewModel.is_bestseller;
  }
  if (viewModel.is_new !== undefined) input.is_new = viewModel.is_new;
  if (viewModel.vegan !== undefined) input.vegan = viewModel.vegan;
  if (viewModel.gluten_free !== undefined) {
    input.gluten_free = viewModel.gluten_free;
  }
  if (viewModel.sugar_free !== undefined) {
    input.sugar_free = viewModel.sugar_free;
  }
  if (viewModel.high_protein !== undefined) {
    input.high_protein = viewModel.high_protein;
  }
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) {
    input.seo_description = viewModel.metaDescription;
  }
  if (viewModel.seoKeywords !== undefined) {
    input.seo_keywords = viewModel.seoKeywords;
  }
  if (viewModel.seoFocusKeyword !== undefined) {
    input.seo_focus_keyword = viewModel.seoFocusKeyword || null;
  }
  if (viewModel.canonicalUrl !== undefined) {
    input.canonical_url = viewModel.canonicalUrl;
  }
  if (viewModel.seoRobots !== undefined) {
    input.seo_robots = viewModel.seoRobots;
  }
  if (viewModel.ogImage !== undefined) input.og_image = viewModel.ogImage;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo_data !== undefined) input.geo_data = viewModel.geo_data;

  return input;
}

export type ProductSEO = ProductSEOViewModel;
export type ProductSEOInput = ProductInput;
