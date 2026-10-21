import type { PublicProduct } from "@celebix/saas-contracts";

export function productBadge(product: Pick<PublicProduct, "available" | "compareAtCents" | "priceCents">): "sale" | "unavailable" | null {
  if (!product.available) return "unavailable";
  return typeof product.compareAtCents === "number" && typeof product.priceCents === "number" && product.compareAtCents > product.priceCents ? "sale" : null;
}

export function cardAction(product: PublicProduct): "quick_add" | "choose_options" | "unavailable" {
  if (!product.available) return "unavailable";
  const available = product.variants.filter((variant) => variant.available);
  return product.variants.length === 1 && available.length === 1 ? "quick_add" : "choose_options";
}
