import {
  inferLegacySubcategorySlug,
  readCelebixCategoryHierarchyMetadata,
} from "@celebix/platform-config";
import {
  type GiftFinderFilters,
  OCCASION_CATEGORY_BOOST,
  RECIPIENT_CATEGORY_BOOST,
} from "@/lib/gift-finder-config";
import type { Product } from "@/types/product";

type GiftProductRecord = Product & {
  is_featured?: boolean;
  is_bestseller?: boolean;
  shopify_metadata?: unknown;
};

function normalizeSlug(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getProductDisplayPrice(product: Product) {
  const variantPrice = product.variants?.[0]?.price;
  return typeof variantPrice === "number" && Number.isFinite(variantPrice) ? variantPrice : null;
}

export function getProductCategorySlugs(product: Product) {
  const record = product as GiftProductRecord;
  const metadata = record.shopify_metadata;
  const storedHierarchy = readCelebixCategoryHierarchyMetadata(metadata);
  const pathSlugs = storedHierarchy.path
    .map((segment) => segment.slug)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const category =
    normalizeSlug(record.category) || normalizeSlug(storedHierarchy.categorySlug) || pathSlugs[0] || "";
  const subcategory =
    normalizeSlug(
      inferLegacySubcategorySlug({
        category: category || storedHierarchy.categorySlug,
        subcategory: record.subcategory,
        name: record.name,
        slug: record.slug,
        tags: record.tags,
        metadata,
      }),
    ) ||
    normalizeSlug(record.subcategory) ||
    (pathSlugs.length > 1 ? pathSlugs[pathSlugs.length - 1] || "" : "");

  const slugs = new Set<string>();
  if (category) slugs.add(category);
  if (subcategory) slugs.add(subcategory);
  pathSlugs.forEach((slug) => slugs.add(normalizeSlug(slug)));

  return slugs;
}

function applyCategoryBoost(score: number, categorySlugs: Set<string>, boostedSlugs: string[]) {
  let nextScore = score;

  boostedSlugs.forEach((slug, index) => {
    if (categorySlugs.has(slug)) {
      nextScore += Math.max(1, 5 - index);
    }
  });

  return nextScore;
}

function scoreProduct(product: Product, filters: GiftFinderFilters) {
  const price = getProductDisplayPrice(product);
  const maxBudget = filters.budget ? Number(filters.budget) : Infinity;

  if (price === null || price > maxBudget) {
    return -1;
  }

  const record = product as GiftProductRecord;
  let score = 0;
  const categorySlugs = getProductCategorySlugs(product);

  if (filters.recipient) {
    score = applyCategoryBoost(score, categorySlugs, RECIPIENT_CATEGORY_BOOST[filters.recipient] ?? []);
  }

  if (filters.occasion) {
    score = applyCategoryBoost(score, categorySlugs, OCCASION_CATEGORY_BOOST[filters.occasion] ?? []);
  }

  if (record.featured || record.is_featured) score += 1;
  if (record.isBestseller || record.is_bestseller) score += 1;
  if ((record.rating ?? 0) >= 4.5) score += 1;

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
  const slugs = Array.from(getProductCategorySlugs(product));
  return slugs.length > 1 ? slugs[slugs.length - 1] : slugs[0] || "";
}
