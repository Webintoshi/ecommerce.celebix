/**
 * Category Domain Model - Single Source of Truth
 * 
 * This file contains the canonical type definitions for the Category domain.
 * All other modules must import from here to ensure type consistency.
 * 
 * @module types/category
 * @version 1.0.0
 */

import { STORE_RUNTIME } from "@/lib/store-runtime";

// ============================================================================
// VALUE OBJECTS
// ============================================================================

/**
 * FAQ item for structured data markup
 * Used in FAQPage schema generation
 */
export interface CategoryFAQ {
  question: string;
  answer: string;
}

/**
 * GEO (Generative Engine Optimization) data structure
 * Optimizes content for LLM/AI consumption
 */
export interface CategoryGEO {
  keyTakeaways: string[];
  entities: string[];
}

// ============================================================================
// DOMAIN ENTITY
// ============================================================================

/**
 * Canonical Category entity as stored in database
 * This is the SSOT representation - all transforms must derive from this
 */
export interface Category {
  // Core Identity
  id: string;
  name: string;
  slug: string;
  
  // Content
  description: string | null;
  image: string | null;
  icon: string | null;
  parent_id: string | null;
  
  // Display Order & Status
  sort_order: number;
  is_active: boolean;
  
  // SEO Fields
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  
  // Structured Data & GEO
  faq: CategoryFAQ[] | null;
  geo_data: CategoryGEO | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

/**
 * API Response wrapper for category endpoints
 * Ensures consistent response structure
 */
export interface CategoryApiResponse {
  success: boolean;
  categories?: Category[];
  category?: Category;
  error?: string;
}

/**
 * Create/Update DTO - Partial of Category for mutations
 * Excludes auto-generated fields (id, created_at, updated_at)
 */
export type CategoryInput = Omit<Partial<Category>, 'id' | 'created_at' | 'updated_at'>;

// ============================================================================
// VIEW MODELS (For UI Consumption)
// ============================================================================

/**
 * Extended category model for SEO Killer admin panel
 * Includes computed/derived fields for UI display
 */
export interface CategorySEOViewModel extends Category {
  // Computed fields for admin panel
  wordCount: number;
  readingTime: number;
  clusterCount: number;
  
  // Alias fields for backward compatibility with existing UI
  metaTitle: string;
  metaDescription: string;
  geo: CategoryGEO;
}

// ============================================================================
// BACKWARD COMPATIBILITY ALIASES (Deprecated - use canonical types above)
// ============================================================================

/** @deprecated Use CategoryInput instead */
export type CategoryFormData = CategoryInput;

/** @deprecated Use Category instead */
export type CategoryInfo = Category;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if value is a valid CategoryFAQ
 */
export function isCategoryFAQ(value: unknown): value is CategoryFAQ {
  return (
    typeof value === 'object' &&
    value !== null &&
    'question' in value &&
    'answer' in value &&
    typeof (value as CategoryFAQ).question === 'string' &&
    typeof (value as CategoryFAQ).answer === 'string'
  );
}

/**
 * Type guard to check if value is a valid CategoryGEO
 */
export function isCategoryGEO(value: unknown): value is CategoryGEO {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keyTakeaways' in value &&
    Array.isArray((value as CategoryGEO).keyTakeaways) &&
    'entities' in value &&
    Array.isArray((value as CategoryGEO).entities)
  );
}

/**
 * Type guard to validate Category from API response
 */
export function isValidCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) return false;
  
  const cat = value as Category;
  return (
    typeof cat.id === 'string' &&
    typeof cat.name === 'string' &&
    typeof cat.slug === 'string'
  );
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

/**
 * Transform raw DB Category to SEO View Model
 * Centralizes all transformation logic to prevent drift
 */
export function toCategorySEOViewModel(
  category: Category,
  clusterCount: number = 0
): CategorySEOViewModel {
  const description = category.description || '';
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  
  // Default SEO values when null
  const defaultMetaTitle = `${category.name} | ${STORE_RUNTIME.defaultProductBrand}`;
  const defaultMetaDescription = `${category.name} kategorisindeki urunleri ${STORE_RUNTIME.name} magazasinda inceleyin.`;
  const defaultGEO: CategoryGEO = { keyTakeaways: [], entities: [] };
  
  return {
    ...category,
    // Computed fields
    wordCount,
    readingTime: Math.max(1, Math.ceil(wordCount / 200)), // ~200 WPM reading speed
    clusterCount,
    // Aliases for UI compatibility
    metaTitle: category.seo_title || defaultMetaTitle,
    metaDescription: category.seo_description || defaultMetaDescription,
    geo: category.geo_data || defaultGEO,
  };
}

/**
 * Transform View Model back to DB format for updates
 */
export function toCategoryInput(
  viewModel: Partial<CategorySEOViewModel>
): CategoryInput {
  const input: CategoryInput = {};
  
  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.description !== undefined) input.description = viewModel.description;
  if (viewModel.image !== undefined) input.image = viewModel.image;
  if (viewModel.icon !== undefined) input.icon = viewModel.icon;
  if (viewModel.parent_id !== undefined) input.parent_id = viewModel.parent_id;
  if (viewModel.sort_order !== undefined) input.sort_order = viewModel.sort_order;
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  
  // Map aliased fields back to DB columns
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) input.seo_description = viewModel.metaDescription;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;
  
  return input;
}
