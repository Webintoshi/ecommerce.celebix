/**
 * Product SEO Domain Model - Single Source of Truth
 * 
 * Canonical type definitions for Product SEO domain.
 * All modules must import from here to ensure type consistency.
 * 
 * @module types/product-seo
 * @version 1.0.0
 */

import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

// ============================================================================
// VALUE OBJECTS
// ============================================================================

/**
 * FAQ item for Product structured data
 * Used in FAQPage schema markup
 */
export interface ProductFAQ {
  question: string;
  answer: string;
}

/**
 * GEO (Generative Engine Optimization) data for LLM/AI visibility
 */
export interface ProductGEO {
  keyTakeaways: string[];
  entities: string[];
}

// ============================================================================
// DOMAIN ENTITY - Database Schema
// ============================================================================

/**
 * Canonical Product entity with SEO fields as stored in database
 * This is the SSOT representation - all transforms derive from this
 */
export interface ProductWithSEO {
  // Core Identity
  id: string;
  name: string;
  slug: string;
  
  // Content
  description: string | null;
  short_description: string | null;
  images: string[];
  
  // Categorization
  category: string;
  subcategory: string | null;
  tags: string[];
  
  // Pricing & Variants
  variants: ProductVariant[];
  
  // Status Flags
  is_active: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new: boolean;
  
  // Product Attributes
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  
  // Ratings
  rating: number;
  review_count: number;
  
  // SEO Fields (from migration 016_add_seo_fields.sql)
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  
  // Structured Data & GEO
  faq: ProductFAQ[] | null;
  geo_data: ProductGEO | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

/**
 * Product Variant - Sub-entity
 */
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

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

/**
 * API Response wrapper for product endpoints
 */
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

/**
 * Create/Update DTO for product mutations
 * Excludes auto-generated fields
 */
export type ProductInput = Omit<Partial<ProductWithSEO>, 'id' | 'created_at' | 'updated_at'>;

// ============================================================================
// VIEW MODELS (For UI Consumption)
// ============================================================================

/**
 * Extended product model for SEO Killer admin panel
 * Includes computed fields and UI-specific aliases
 */
export interface ProductSEOViewModel extends ProductWithSEO {
  // UI Aliases (backward compatibility)
  metaTitle: string;
  metaDescription: string;
  geo: ProductGEO;
  
  // Computed fields for admin panel
  wordCount: number;
  readingTime: number;
  score: number;
  issues: string[];
  schemaType: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isProductFAQ(value: unknown): value is ProductFAQ {
  return (
    typeof value === 'object' &&
    value !== null &&
    'question' in value &&
    'answer' in value &&
    typeof (value as ProductFAQ).question === 'string' &&
    typeof (value as ProductFAQ).answer === 'string'
  );
}

export function isProductGEO(value: unknown): value is ProductGEO {
  return (
    typeof value === 'object' &&
    value !== null &&
    'keyTakeaways' in value &&
    Array.isArray((value as ProductGEO).keyTakeaways) &&
    'entities' in value &&
    Array.isArray((value as ProductGEO).entities)
  );
}

export function isValidProduct(value: unknown): value is ProductWithSEO {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as ProductWithSEO;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.slug === 'string'
  );
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

/**
 * Calculate SEO score based on field completeness
 */
function calculateSEOScore(product: ProductWithSEO): { score: number; issues: string[] } {
  let score = 100;
  const issues: string[] = [];
  
  const title = product.seo_title || '';
  const desc = product.seo_description || '';
  
  if (!title) {
    issues.push("Meta başlık eksik");
    score -= 20;
  } else if (title.length < 30 || title.length > 60) {
    issues.push("Meta başlık uzunluğu ideal değil (30-60 karakter)");
    score -= 10;
  }
  
  if (!desc) {
    issues.push("Meta açıklama eksik");
    score -= 20;
  } else if (desc.length < 120 || desc.length > 160) {
    issues.push("Meta açıklama uzunluğu ideal değil (120-160 karakter)");
    score -= 10;
  }
  
  if (!product.faq || product.faq.length === 0) {
    issues.push("FAQ schema eklenmemiş");
    score -= 5;
  }
  
  return { score: Math.max(0, score), issues };
}

/**
 * Transform raw DB Product to SEO View Model
 * Centralizes all transformation logic
 */
export function toProductSEOViewModel(product: ProductWithSEO): ProductSEOViewModel {
  const description = product.description || '';
  const wordCount = description.split(/\s+/).filter(Boolean).length;
  const { score, issues } = calculateSEOScore(product);
  
  // Default values when null
  const defaultTitle = `${product.name} | ${STOREFRONT_RUNTIME.name}`;
  const defaultDesc = product.short_description || description.slice(0, 160) || '';
  const defaultGEO: ProductGEO = { keyTakeaways: [], entities: [] };
  
  return {
    ...product,
    // UI aliases
    metaTitle: product.seo_title || defaultTitle,
    metaDescription: product.seo_description || defaultDesc,
    geo: product.geo_data || defaultGEO,
    // Computed fields
    wordCount,
    readingTime: Math.max(1, Math.ceil(wordCount / 200)),
    score,
    issues,
    schemaType: 'Product',
  };
}

/**
 * Transform View Model back to DB format for updates
 */
export function toProductInput(viewModel: Partial<ProductSEOViewModel>): ProductInput {
  const input: ProductInput = {};
  
  // Core fields
  if (viewModel.name !== undefined) input.name = viewModel.name;
  if (viewModel.slug !== undefined) input.slug = viewModel.slug;
  if (viewModel.description !== undefined) input.description = viewModel.description;
  if (viewModel.short_description !== undefined) input.short_description = viewModel.short_description;
  if (viewModel.images !== undefined) input.images = viewModel.images;
  if (viewModel.category !== undefined) input.category = viewModel.category;
  if (viewModel.subcategory !== undefined) input.subcategory = viewModel.subcategory;
  if (viewModel.tags !== undefined) input.tags = viewModel.tags;
  
  // Status flags
  if (viewModel.is_active !== undefined) input.is_active = viewModel.is_active;
  if (viewModel.is_featured !== undefined) input.is_featured = viewModel.is_featured;
  if (viewModel.is_bestseller !== undefined) input.is_bestseller = viewModel.is_bestseller;
  if (viewModel.is_new !== undefined) input.is_new = viewModel.is_new;
  
  // Product attributes
  if (viewModel.vegan !== undefined) input.vegan = viewModel.vegan;
  if (viewModel.gluten_free !== undefined) input.gluten_free = viewModel.gluten_free;
  if (viewModel.sugar_free !== undefined) input.sugar_free = viewModel.sugar_free;
  if (viewModel.high_protein !== undefined) input.high_protein = viewModel.high_protein;
  
  // SEO fields - map from UI aliases
  if (viewModel.metaTitle !== undefined) input.seo_title = viewModel.metaTitle;
  if (viewModel.metaDescription !== undefined) input.seo_description = viewModel.metaDescription;
  if (viewModel.faq !== undefined) input.faq = viewModel.faq;
  if (viewModel.geo !== undefined) input.geo_data = viewModel.geo;
  
  return input;
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/** @deprecated Use ProductWithSEO instead */
export type ProductSEO = ProductSEOViewModel;

/** @deprecated Use ProductInput instead */
export type ProductSEOInput = ProductInput;
