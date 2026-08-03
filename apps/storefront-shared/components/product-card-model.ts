import type { PublicProduct } from "@celebix/saas-contracts";

export function productBadge(product: PublicProduct): "sale" | "unavailable" | null {
  if (!product.available) return "unavailable";
  return product.compareAtCents !== undefined && product.compareAtCents > product.priceCents ? "sale" : null;
}

export function cardAction(product: PublicProduct): "quick_add" | "choose_options" | "unavailable" {
  if (!product.available) return "unavailable";
  const available = product.variants.filter((variant) => variant.available);
  return available.length === 1 ? "quick_add" : "choose_options";
}
