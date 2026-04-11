import {
  extractHeadingsFromBlogHtml,
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

export function prepareBlogEditorContent(content?: string | null) {
  return renderBlogContentToHtml(content);
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

export function extractBlogOutline(content?: string | null) {
  const normalized = (content || "").trim();

  if (!normalized) {
    return [];
  }

  if (isBlogHtmlContent(normalized)) {
    return extractHeadingsFromBlogHtml(normalized).filter((item) => item.text.length > 0);
  }

  return normalized
    .split("\n")
    .map((line) => line.match(/^(#{1,6})\s+(.*)$/))
    .filter(Boolean)
    .map((match) => ({
      level: match![1].length,
      text: match![2].trim(),
    }))
    .filter((item) => item.text.length > 0);
}

export function countBlogImages(content?: string | null) {
  const normalized = (content || "").trim();

  if (!normalized) {
    return 0;
  }

  return isBlogHtmlContent(normalized)
    ? (normalizeBlogHtmlContent(normalized).match(/<img\b/gi) || []).length
    : (normalized.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
}

export function countBlogLinks(content?: string | null) {
  const normalized = (content || "").trim();

  if (!normalized) {
    return 0;
  }

  return isBlogHtmlContent(normalized)
    ? (normalizeBlogHtmlContent(normalized).match(/<a\b/gi) || []).length
    : (normalized.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
}
