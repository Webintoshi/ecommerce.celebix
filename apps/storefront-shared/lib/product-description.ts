import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";

export function renderStarterProductDescription(
  rawDescription?: string | null,
  productName?: string,
): string {
  return normalizeProductDescriptionHtml(rawDescription, productName);
}
