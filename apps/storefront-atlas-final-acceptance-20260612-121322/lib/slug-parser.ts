import { ProductVariant } from "@/types/product";

export interface ParsedSlug {
  baseSlug: string;
  variantWeight?: string;
  variantId?: string;
}

/**
 * Parse a product slug to extract base slug and variant information
 *
 * Examples:
 * - "sekersiz-fistik-ezmesi-450g" -> { baseSlug: "sekersiz-fistik-ezmesi", variantWeight: "450" }
 * - "sekersiz-fistik-ezmesi" -> { baseSlug: "sekersiz-fistik-ezmesi" }
 * - "balli-fistik-ezmesi-900g" -> { baseSlug: "balli-fistik-ezmesi", variantWeight: "900" }
 * - "product-v-abc123" -> { baseSlug: "product", variantId: "abc123" }
 *
 * @param slug - URL slug (e.g., "sekersiz-fistik-ezmesi-450g")
 * @returns ParsedSlug object with base slug and optional variant info
 */
export function parseProductSlug(slug: string): ParsedSlug {
  // Pattern 1: Match weight suffix (e.g., "-450g", "-900g", "-1kg", "-500ml")
  const weightSuffixRegex = /-(\d+(?:g|kg|ml|l))$/i;
  const weightMatch = slug.match(weightSuffixRegex);

  if (weightMatch) {
    const weightValue = weightMatch[1].replace(/[gkml]/gi, ''); // Extract numeric value
    return {
      baseSlug: slug.slice(0, -weightMatch[0].length),
      variantWeight: weightValue,
    };
  }

  // Pattern 2: Match variant ID suffix (e.g., "-v-abc123")
  const variantIdRegex = /-v-([a-f0-9-]+)$/i;
  const variantIdMatch = slug.match(variantIdRegex);

  if (variantIdMatch) {
    return {
      baseSlug: slug.slice(0, -variantIdMatch[0].length),
      variantId: variantIdMatch[1],
    };
  }

  // No variant suffix found - return base slug
  return {
    baseSlug: slug,
  };
}

/**
 * Find variant index based on weight or variant ID
 *
 * @param variants - Product variants array
 * @param parsedSlug - Parsed slug with variant info
 * @returns Index of matching variant, or 0 if no match
 */
export function findVariantIndex(
  variants: ProductVariant[],
  parsedSlug: ParsedSlug
): number {
  if (!variants || variants.length === 0) return 0;

  // Match by weight if available
  if (parsedSlug.variantWeight) {
    const weightNum = parseInt(parsedSlug.variantWeight, 10);
    const index = variants.findIndex((v) => v.weight === weightNum);
    if (index !== -1) return index;
  }

  // Match by variant ID if available
  if (parsedSlug.variantId) {
    const index = variants.findIndex((v) => v.id === parsedSlug.variantId);
    if (index !== -1) return index;
  }

  // Default to first variant
  return 0;
}

/**
 * Build canonical URL for a product
 * Uses base slug to avoid duplicate content
 *
 * @param baseSlug - Product base slug
 * @returns Canonical URL path
 */
export function buildCanonicalUrl(baseSlug: string): string {
  return `/urunler/${baseSlug}`;
}
