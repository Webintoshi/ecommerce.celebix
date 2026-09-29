import type { PublicContentV2 } from "@celebix/saas-data";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { renderMerchantContentBody } from "@celebix/platform-config/src/merchant-content-body.ts";
import { contentPath } from "./content-locale.ts";

function plain(value: string | null | undefined): string {
  return (value ?? "").replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[^]*?-->/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? " ";
      const point = entity.toLowerCase().startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : " ";
    }).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

function bodySummary(value: string): string {
  const characters = Array.from(value);
  if (characters.length <= 240) return value;
  const prefix = characters.slice(0, 241).join("");
  const wordBreak = prefix.lastIndexOf(" ");
  return wordBreak >= 120 ? prefix.slice(0, wordBreak).trimEnd() : characters.slice(0, 240).join("");
}

export function publicContentSeo(source: Pick<PublicContentV2, "title" | "body" | "bodyFormat" | "excerpt" | "seoTitle" | "seoDescription">, brand: string) {
  const cleanBrand = plain(brand);
  let title = plain(source.seoTitle) || plain(source.title);
  const suffix = ` | ${cleanBrand}`;
  if (cleanBrand) {
    while (title.endsWith(suffix)) title = title.slice(0, -suffix.length).trimEnd();
    title = `${title || plain(source.title)}${suffix}`;
  }
  const description = plain(source.seoDescription) || plain(source.excerpt) || bodySummary(plain(source.bodyFormat === "normalized_html" ? source.body : normalizeProductDescriptionHtml(source.body, source.title))) || plain(source.title);
  return Object.freeze({ title, description });
}

export function buildPublicBlogPage(source: PublicContentV2, slug: string, defaultLocale: string) {
  if (source.kind !== "blog_post" || source.slug !== slug) throw new TypeError("public_blog_invalid");
  const html = source.bodyFormat === "normalized_html" ? renderMerchantContentBody(source.body, source.bodyFormat) : source.body.trim() ? normalizeProductDescriptionHtml(source.body, source.title) : "";
  return Object.freeze({ ...source, route: contentPath("blog_post", slug, source.locale, defaultLocale), html });
}
