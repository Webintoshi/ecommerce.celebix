import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";

type ProductSeoSource = Readonly<{ title: string; description?: string; seoTitle?: string | null; seoDescription?: string | null }>;

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
      const names: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (!entity.startsWith("#")) return names[entity.toLowerCase()] ?? match;
      const point = entity.toLowerCase().startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : " ";
    })
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function resolveProductSeo(product: ProductSeoSource, displayName: string): Readonly<{ title: string; description: string }> {
  const brand = plainText(displayName);
  let title = plainText(product.seoTitle) || plainText(product.title);
  // Only the exact trailing separator and store display name count as a suffix.
  const suffix = ` | ${brand}`;
  if (brand) {
    while (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trimEnd();
    title = `${title || plainText(product.title)}${suffix}`;
  }
  const description = plainText(product.seoDescription) || plainText(normalizeProductDescriptionHtml(product.description, product.title)) || `${plainText(product.title)} ürün ayrıntıları`;
  return Object.freeze({ title, description });
}
