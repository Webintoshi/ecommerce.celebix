import {
  extractPlainTextFromBlogContent,
  isBlogHtmlContent,
  normalizeBlogHtmlContent,
} from "@celebix/platform-config/src/blog-rich-text";
import { renderMarkdownToHtml } from "@/lib/markdown";

export function renderBlogContentToHtml(content?: string | null) {
  const normalized = (content || "").trim();

  if (!normalized) {
    return "";
  }

  return isBlogHtmlContent(normalized)
    ? normalizeBlogHtmlContent(normalized)
    : renderMarkdownToHtml(normalized);
}

export function extractBlogPlainText(content?: string | null) {
  const normalized = (content || "").trim();

  if (!normalized) {
    return "";
  }

  return isBlogHtmlContent(normalized)
    ? extractPlainTextFromBlogContent(normalized)
    : extractPlainTextFromBlogContent(renderMarkdownToHtml(normalized));
}
