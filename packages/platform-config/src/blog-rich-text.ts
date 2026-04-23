const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "a",
  "img",
  "hr",
  "code",
  "pre",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function sanitizeHref(rawHref: string) {
  const normalized = decodeHtmlEntities(rawHref).trim();

  if (!normalized) {
    return "";
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("#") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:")
  ) {
    return normalized;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return "";
}

function sanitizeImageSrc(rawSrc: string) {
  const normalized = decodeHtmlEntities(rawSrc).trim();

  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("/") || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return "";
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

export function isBlogHtmlContent(rawContent?: string | null) {
  return /<\/?[a-z][\s\S]*>/i.test(rawContent || "");
}

export function normalizeBlogHtmlContent(rawContent?: string | null) {
  if (!rawContent || !rawContent.trim()) {
    return "";
  }

  let html = rawContent
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math|video|audio)[^>]*\/?>/gi,
      "",
    )
    .replace(/<\s*\/?\s*(div|section|article|main)\b[^>]*>/gi, (match) =>
      /^<\s*\/\s*/.test(match) ? "</p>" : "<p>",
    )
    .replace(/<\s*\/?\s*(span|font)\b[^>]*>/gi, "")
    .replace(/<\s*b\b[^>]*>/gi, "<strong>")
    .replace(/<\s*\/\s*b\s*>/gi, "</strong>")
    .replace(/<\s*i\b[^>]*>/gi, "<em>")
    .replace(/<\s*\/\s*i\s*>/gi, "</em>")
    .replace(/<\s*h1\b[^>]*>/gi, "<h2>")
    .replace(/<\s*\/\s*h1\s*>/gi, "</h2>")
    .replace(/<\s*h5\b[^>]*>/gi, "<h4>")
    .replace(/<\s*\/\s*h5\s*>/gi, "</h4>")
    .replace(/<\s*h6\b[^>]*>/gi, "<h4>")
    .replace(/<\s*\/\s*h6\s*>/gi, "</h4>")
    .replace(/<\s*br\s*\/?>/gi, "<br />")
    .replace(/<\s*hr\b[^>]*\/?>/gi, "<hr />");

  html = html.replace(/<\s*a\b([^>]*)>/gi, (_, rawAttributes: string) => {
    const hrefMatch = rawAttributes.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    const unquotedHrefMatch = rawAttributes.match(/\bhref\s*=\s*([^'"\s>]+)/i);
    const href = sanitizeHref(hrefMatch?.[2] || unquotedHrefMatch?.[1] || "");

    if (!href) {
      return "<a>";
    }

    const isExternal = /^https?:\/\//i.test(href);
    return isExternal
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`
      : `<a href="${escapeHtml(href)}">`;
  });

  html = html.replace(/<\s*img\b([^>]*)\/?>/gi, (_, rawAttributes: string) => {
    const srcMatch = rawAttributes.match(/\bsrc\s*=\s*(['"])(.*?)\1/i);
    const unquotedSrcMatch = rawAttributes.match(/\bsrc\s*=\s*([^'"\s>]+)/i);
    const altMatch = rawAttributes.match(/\balt\s*=\s*(['"])(.*?)\1/i);
    const src = sanitizeImageSrc(srcMatch?.[2] || unquotedSrcMatch?.[1] || "");
    const alt = decodeHtmlEntities(altMatch?.[2] || "").trim();

    if (!src) {
      return "";
    }

    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
  });

  html = html.replace(/<\s*\/?\s*([a-z0-9]+)\b[^>]*>/gi, (match, tagName: string) => {
    const normalizedTag = tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(normalizedTag)) {
      return "";
    }

    if (/^<\s*\/\s*/.test(match)) {
      if (normalizedTag === "img" || normalizedTag === "br" || normalizedTag === "hr") {
        return "";
      }
      return `</${normalizedTag}>`;
    }

    if (normalizedTag === "a" || normalizedTag === "img") {
      return match;
    }

    if (normalizedTag === "br") {
      return "<br />";
    }

    if (normalizedTag === "hr") {
      return "<hr />";
    }

    return `<${normalizedTag}>`;
  });

  return html
    .replace(/<p>\s*(<br\s*\/?>|\s|&nbsp;)*\s*<\/p>/gi, "")
    .replace(/<(h2|h3|h4|blockquote|li|pre)>\s*(<br\s*\/?>|\s|&nbsp;)*\s*<\/\1>/gi, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/(<\/(p|h2|h3|h4|blockquote|ul|ol|pre)>\s*){3,}/gi, (match) =>
      match.replace(/(<\/(p|h2|h3|h4|blockquote|ul|ol|pre)>\s*){2,}/i, "$1$1"),
    )
    .trim();
}

export function extractPlainTextFromBlogContent(rawContent?: string | null) {
  const html = normalizeBlogHtmlContent(rawContent);

  if (!html) {
    return "";
  }

  return decodeHtmlEntities(
    html
      .replace(/<\s*img\b[^>]*alt="([^"]*)"[^>]*\/?>/gi, (_, alt: string) => (alt ? ` ${alt} ` : " "))
      .replace(/<\s*hr\s*\/?>/gi, "\n")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*li\s*>/gi, "• ")
      .replace(/<\s*\/\s*(p|h2|h3|h4|blockquote|li|ul|ol|pre)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

export function extractHeadingsFromBlogHtml(rawContent?: string | null) {
  const html = normalizeBlogHtmlContent(rawContent);

  if (!html) {
    return [];
  }

  return Array.from(html.matchAll(/<h([2-4])>([\s\S]*?)<\/h\1>/gi)).map((match) => ({
    level: Number(match[1]),
    text: decodeHtmlEntities(stripTags(match[2]).replace(/\s+/g, " ").trim()),
  }));
}
