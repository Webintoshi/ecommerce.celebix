/**
 * Category Domain Model - Single Source of Truth
 *
 * This file contains the canonical type definitions for the Category domain.
 * All other modules must import from here to ensure type consistency.
 *
 * @module types/category
 * @version 1.0.0
 */

import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export interface CategoryFAQ {
  question: string;
  answer: string;
}

export interface CategoryGEO {
  keyTakeaways: string[];
  entities: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  faq: CategoryFAQ[] | null;
  geo_data: CategoryGEO | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryApiResponse {
  success: boolean;
  categories?: Category[];
  category?: Category;
  error?: string;
}

export type CategoryInput = Omit<Partial<Category>, "id" | "created_at" | "updated_at">;

export interface CategorySEOViewModel extends Category {
  wordCount: number;
  readingTime: number;
  clusterCount: number;
  metaTitle: string;
  metaDescription: string;
  geo: CategoryGEO;
}

export type CategoryFormData = CategoryInput;
export type CategoryInfo = Category;

export function isCategoryFAQ(value: unknown): value is CategoryFAQ {
  return (
    typeof value === "object" &&
    value !== null &&
    "question" in value &&
    "answer" in value &&
    typeof (value as CategoryFAQ).question === "string" &&
    typeof (value as CategoryFAQ).answer === "string"
  );
}

export function isCategoryGEO(value: unknown): value is CategoryGEO {
  return (
    typeof value === "object" &&
    value !== null &&
    "keyTakeaways" in value &&
    Array.isArray((value as CategoryGEO).keyTakeaways) &&
    "entities" in value &&
    Array.isArray((value as CategoryGEO).entities)
  );
}

export function isValidCategory(value: unknown): value is Category {
  if (typeof value !== "object" || value === null) return false;

  const cat = value as Category;
  return (
    typeof cat.id === "string" &&
    typeof cat.name === "string" &&
    typeof cat.slug === "string"
  );
}

export function toCategorySEOViewModel(
  category: Category,
  clusterCount: number = 0,
): CategorySEOViewModel {
  const description = category.description || "";
  const wordCount = description.split(/\s+/).filter(Boolean).length;

  const defaultMetaTitle = `${category.name} | ${STOREFRONT_RUNTIME.name}`;
  const defaultMetaDescription =
    `${category.name} kategorisindeki yayindaki urunleri ve premium koleksiyon secimini kesfedin.`;
  const defaultGEO: CategoryGEO = { keyTakeaways: [], entities: [] };

  return {
    ...category,
    wordCount,
    readingTime: Math.max(1, Math.ceil(wordCount / 200)),
    clusterCount,
    metaTitle: category.seo_title || defaultMetaTitle,
    metaDescription: category.seo_description || defaultMetaDescription,
    geo: category.geo_data || defaultGEO,
  };
}

export function toCategoryInput(
  viewModel: Partial<CategorySEOViewModel>,
): CategoryInput {
  const input: CategoryInput = {};

  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.description !== undefined) input.description = viewModel.description;
  if (viewModel.image !== undefined) input.image = viewModel.image;
  if (viewModel.icon !== undefined) input.icon = viewModel.icon;
  if (viewModel.sort_order !== undefined) input.sort_order = viewModel.sort_order;
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) input.seo_description = viewModel.metaDescription;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;

  return input;
}
