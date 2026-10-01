import type { PublicProduct } from "@celebix/saas-contracts";

export function variantStockLabel(variant: Pick<PublicProduct["variants"][number], "available" | "stockTracking" | "stockQuantity">, showStockQuantity = true): string {
  if (!variant.available) return "Tükendi";
  return showStockQuantity && variant.stockTracking ? `${variant.stockQuantity} adet` : "Stokta";
}
