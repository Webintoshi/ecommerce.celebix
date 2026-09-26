import type { CatalogProductListVariantSummary } from "@celebix/saas-contracts";

type StockSummary = Pick<CatalogProductListVariantSummary, "stockTracking" | "stockQuantity" | "productStock">;
type StockPresentation = Readonly<{
  label: string;
  className: "product-stock" | "product-stock-low" | "product-stock-out";
  csvValue: string;
}>;

function trackedClass(quantity: number): StockPresentation["className"] {
  return quantity === 0 ? "product-stock-out" : quantity <= 10 ? "product-stock-low" : "product-stock";
}

export function productStockPresentation(variant: StockSummary | undefined): StockPresentation {
  if (!variant) return { label: "—", className: "product-stock", csvValue: "" };
  const aggregate = variant.productStock;
  if (!aggregate) return {
    label: variant.stockTracking ? `${variant.stockQuantity} adet` : "Takipsiz",
    className: variant.stockTracking ? trackedClass(variant.stockQuantity) : "product-stock",
    csvValue: String(variant.stockQuantity),
  };
  if (aggregate.trackedVariantCount === 0) return aggregate.untrackedVariantCount === 0
    ? { label: "—", className: "product-stock", csvValue: "" }
    : { label: "Takipsiz", className: "product-stock", csvValue: "Takipsiz" };
  if (aggregate.untrackedVariantCount > 0) {
    const label = `${aggregate.trackedQuantity} adet + takipsiz`;
    return { label, className: "product-stock", csvValue: label };
  }
  return {
    label: `${aggregate.trackedQuantity} adet`,
    className: trackedClass(aggregate.trackedQuantity),
    csvValue: String(aggregate.trackedQuantity),
  };
}
