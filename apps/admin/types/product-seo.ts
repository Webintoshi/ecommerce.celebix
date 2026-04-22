import {
  assessProductSeo,
  generateProductSeoSuggestion,
  isValidProductRobots,
  type ProductSeoAssessment,
  type ProductSeoFamily,
  type ProductSeoRobots,
  type ProductSeoSuggestion,
} from "@/lib/product-seo-generator";

export interface ProductFAQ {
  question: string;
  answer: string;
}

export interface ProductGEO {
  keyTakeaways: string[];
  entities: string[];
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
  seo_robots: string | null;
  og_image: string | null;
  faq: ProductFAQ[] | null;
  geo_data: ProductGEO | null;
  created_at: string;
  updated_at: string;
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

export type ProductInput = Omit<Partial<ProductWithSEO>, "id" | "created_at" | "updated_at">;

export interface ProductSEOViewModel extends ProductWithSEO {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  focusKeyword: string;
  canonicalUrl: string;
  robots: ProductSeoRobots;
  ogImage: string;
  geo: ProductGEO;
  family: ProductSeoFamily;
  recommendation: ProductSeoSuggestion;
  wordCount: number;
  readingTime: number;
  score: number;
  issues: string[];
  hasTitle: boolean;
  hasDescription: boolean;
  hasFocusKeyword: boolean;
  hasKeywords: boolean;
  hasCanonicalOverride: boolean;
  hasValidRobots: boolean;
  hasOgImage: boolean;
  schemaType: "Product";
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    : [];
}

function normalizeGeo(value: ProductGEO | null | undefined): ProductGEO {
  if (!value || typeof value !== "object") {
    return { keyTakeaways: [], entities: [] };
  }

  return {
    keyTakeaways: Array.isArray(value.keyTakeaways)
      ? value.keyTakeaways.filter((item): item is string => typeof item === "string")
      : [],
    entities: Array.isArray(value.entities)
      ? value.entities.filter((item): item is string => typeof item === "string")
      : [],
  };
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
  return typeof product.id === "string" && typeof product.name === "string" && typeof product.slug === "string";
}

function normalizeAssessment(
  assessment: ProductSeoAssessment,
  hasCanonicalOverride: boolean,
): ProductSeoAssessment & { hasCanonicalOverride: boolean } {
  return {
    ...assessment,
    hasCanonicalOverride,
  };
}

export function toProductSEOViewModel(product: ProductWithSEO): ProductSEOViewModel {
  const recommendation = generateProductSeoSuggestion(product);
  const canonicalOverride = toNullableString(product.canonical_url);
  const assessment = normalizeAssessment(assessProductSeo(product), Boolean(canonicalOverride));
  const descriptionSource = product.description || product.short_description || "";
  const wordCount = descriptionSource.split(/\s+/).filter(Boolean).length;
  const keywords = toStringArray(product.seo_keywords);

  return {
    ...product,
    metaTitle: toNullableString(product.seo_title) || recommendation.title,
    metaDescription: toNullableString(product.seo_description) || recommendation.description,
    keywords: keywords.length > 0 ? keywords : recommendation.keywords,
    focusKeyword: toNullableString(product.seo_focus_keyword) || recommendation.focusKeyword,
    canonicalUrl: canonicalOverride || "",
    robots: isValidProductRobots(product.seo_robots) ? product.seo_robots : recommendation.robots,
    ogImage: toNullableString(product.og_image) || recommendation.ogImage || "",
    geo: normalizeGeo(product.geo_data),
    family: recommendation.family,
    recommendation,
    wordCount,
    readingTime: Math.max(1, Math.ceil(wordCount / 200)),
    score: assessment.score,
    issues: assessment.issues,
    hasTitle: assessment.hasTitle,
    hasDescription: assessment.hasDescription,
    hasFocusKeyword: assessment.hasFocusKeyword,
    hasKeywords: assessment.hasKeywords,
    hasCanonicalOverride: assessment.hasCanonicalOverride,
    hasValidRobots: assessment.hasValidRobots,
    hasOgImage: assessment.hasOgImage,
    schemaType: "Product",
  };
}

export function toProductInput(viewModel: Partial<ProductSEOViewModel>): ProductInput {
  const input: ProductInput = {};

  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.description !== undefined) input.description = viewModel.description;
  if (viewModel.short_description !== undefined) input.short_description = viewModel.short_description;
  if (viewModel.images !== undefined) input.images = viewModel.images;
  if (viewModel.category !== undefined) input.category = viewModel.category;
  if (viewModel.subcategory !== undefined) input.subcategory = viewModel.subcategory;
  if (viewModel.tags !== undefined) input.tags = viewModel.tags;
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  if (viewModel.is_featured !== undefined) input.is_featured = viewModel.is_featured;
  if (viewModel.is_bestseller !== undefined) input.is_bestseller = viewModel.is_bestseller;
  if (viewModel.is_new !== undefined) input.is_new = viewModel.is_new;
  if (viewModel.vegan !== undefined) input.vegan = viewModel.vegan;
  if (viewModel.gluten_free !== undefined) input.gluten_free = viewModel.gluten_free;
  if (viewModel.sugar_free !== undefined) input.sugar_free = viewModel.sugar_free;
  if (viewModel.high_protein !== undefined) input.high_protein = viewModel.high_protein;

  if (viewModel.metaTitle !== undefined) input.seo_title = toNullableString(viewModel.metaTitle);
  if (viewModel.metaDescription !== undefined) input.seo_description = toNullableString(viewModel.metaDescription);
  if (viewModel.keywords !== undefined) input.seo_keywords = toStringArray(viewModel.keywords);
  if (viewModel.focusKeyword !== undefined) input.seo_focus_keyword = toNullableString(viewModel.focusKeyword);
  if (viewModel.canonicalUrl !== undefined) input.canonical_url = toNullableString(viewModel.canonicalUrl);
  if (viewModel.robots !== undefined) input.seo_robots = viewModel.robots;
  if (viewModel.ogImage !== undefined) input.og_image = toNullableString(viewModel.ogImage);
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;

  return input;
}

export type ProductSEO = ProductSEOViewModel;
export type ProductSEOInput = ProductInput;
