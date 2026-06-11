import {
  type GiftFinderFilters,
  OCCASION_CATEGORY_BOOST,
  RECIPIENT_CATEGORY_BOOST,
} from "@/lib/gift-finder-config";
import type { Product } from "@/types/product";

function normalizeSlug(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getProductDisplayPrice(product: Product) {
  const variantPrice = product.variants?.[0]?.price;
  return typeof variantPrice === "number" && Number.isFinite(variantPrice) ? variantPrice : null;
}

export function getProductCategorySlugs(product: Product) {
  const slugs = new Set<string>();
  const category = normalizeSlug(product.category);
  const subcategory = normalizeSlug(product.subcategory);

  if (category) slugs.add(category);
  if (subcategory) slugs.add(subcategory);

  return slugs;
}

function scoreProduct(product: Product, filters: GiftFinderFilters) {
  const price = getProductDisplayPrice(product);
  const maxBudget = filters.budget ? Number(filters.budget) : Infinity;

  if (price === null || price > maxBudget) {
    return -1;
  }

  let score = 0;
  const categorySlugs = getProductCategorySlugs(product);

  if (filters.recipient) {
    const boosted = RECIPIENT_CATEGORY_BOOST[filters.recipient] ?? [];
    if (boosted.some((slug) => categorySlugs.has(slug))) {
      score += 4;
    }
  }

  if (filters.occasion) {
    const boosted = OCCASION_CATEGORY_BOOST[filters.occasion] ?? [];
    if (boosted.some((slug) => categorySlugs.has(slug))) {
      score += 4;
    }
  }

  if (product.featured) score += 1;
  if (product.isBestseller) score += 1;
  if ((product.rating ?? 0) >= 4.5) score += 1;

  return score;
}

export function findGiftProducts(products: Product[], filters: GiftFinderFilters, limit = 8) {
  return products
    .map((product) => ({ product, score: scoreProduct(product, filters) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftPrice = getProductDisplayPrice(left.product) ?? 0;
      const rightPrice = getProductDisplayPrice(right.product) ?? 0;
      return leftPrice - rightPrice;
    })
    .slice(0, limit)
    .map((entry) => entry.product);
}

export function getPrimaryGiftCategorySlug(product: Product) {
  return normalizeSlug(product.subcategory) || normalizeSlug(product.category);
}
