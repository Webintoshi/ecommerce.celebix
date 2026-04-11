import {
  extractPlainTextFromProductDescription,
  normalizeProductDescriptionHtml,
} from "@celebix/platform-config/src/product-description-rich-text";

export function renderProductDescriptionHtml(
  rawDescription?: string | null,
  productName?: string,
) {
  return normalizeProductDescriptionHtml(rawDescription, productName);
}

export function formatProductDescription(
  rawDescription?: string | null,
  productName?: string,
): string[] {
  const plainText = extractPlainTextFromProductDescription(
    rawDescription,
    productName,
  );

  if (!plainText) {
    return [];
  }

  return plainText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export { extractPlainTextFromProductDescription };
