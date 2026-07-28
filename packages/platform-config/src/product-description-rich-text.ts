import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";

const INLINE_SECTION_LABELS = [
  "Özellikler:",
  "Malzeme:",
  "Üretim ve İşçilik:",
  "Kalınlık:",
  "Adaptör ve Toka:",
  "Beden:",
  "Kapasitesi:",
  "Kapasitesi;",
  "Ek Özellik:",
  "Boyutlar:",
  "Boyutlar;",
  "Eni:",
  "Boyu:",
  "Açık Hali:",
  "Özel Tabaklama İşlemi ve Deri Bakımı:",
  "Not:",
  "Not :",
  "Dikkat:",
  "Whatsapp iletişim:",
];

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "del",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "a",
  "pre",
  "code",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const markdownOptions: MarkdownItOptions & Readonly<{ maxNesting: number }> = {
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
  maxNesting: 20,
};

const markdown = new MarkdownIt(markdownOptions);

markdown.renderer.rules.image = (tokens, index) =>
  escapeHtml(tokens[index]?.content ?? "");

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function insertSectionBreaks(value: string): string {
  return INLINE_SECTION_LABELS.reduce((acc, label) => {
    const pattern = new RegExp(`\\s+(?=${escapeRegex(label)})`, "g");
    return acc.replace(pattern, "\n\n");
  }, value);
}

function hasHtmlMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
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

function normalizePlainTextDescription(rawDescription: string, productName?: string) {
  let text = rawDescription
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ");

  if (productName?.trim()) {
    const escapedName = escapeRegex(productName.trim());
    text = text.replace(
      new RegExp(`^\\s*(${escapedName})\\s*"+\\s*${escapedName}\\s*"+\\s*`, "i"),
      "$1 ",
    );
  }

  return insertSectionBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function plainTextToHtml(rawDescription: string, productName?: string) {
  const normalized = normalizePlainTextDescription(rawDescription, productName);

  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) =>
      `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

function renderMarkdownSource(rawDescription: string, productName?: string) {
  return markdown.render(
    normalizePlainTextDescription(rawDescription, productName),
  );
}

export function normalizeProductDescriptionHtml(
  rawDescription?: string | null,
  productName?: string,
) {
  if (!rawDescription || !rawDescription.trim()) {
    return "";
  }

  const legacyHtml = hasHtmlMarkup(rawDescription);
  let html = (legacyHtml
    ? rawDescription
    : renderMarkdownSource(rawDescription, productName))
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
    .replace(/<\s*s\b[^>]*>/gi, "<del>")
    .replace(/<\s*\/\s*s\s*>/gi, "</del>")
    .replace(/<\s*h1\b[^>]*>/gi, "<h2>")
    .replace(/<\s*\/\s*h1\s*>/gi, "</h2>")
    .replace(/<\s*h5\b[^>]*>/gi, "<h4>")
    .replace(/<\s*\/\s*h5\s*>/gi, "</h4>")
    .replace(/<\s*h6\b[^>]*>/gi, "<h4>")
    .replace(/<\s*\/\s*h6\s*>/gi, "</h4>")
    .replace(/<\s*br\s*\/?>/gi, "<br />");

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

  html = html.replace(/<\s*\/?\s*([a-z0-9]+)\b[^>]*>/gi, (match, tagName: string) => {
    const normalizedTag = tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(normalizedTag)) {
      return "";
    }

    if (/^<\s*\/\s*/.test(match)) {
      return `</${normalizedTag}>`;
    }

    if (normalizedTag === "a") {
      return match;
    }

    if (normalizedTag === "br") {
      return "<br />";
    }

    return `<${normalizedTag}>`;
  });

  html = html
    .replace(/<p>\s*(<br\s*\/?>|\s|&nbsp;)*\s*<\/p>/gi, "")
    .replace(/<(h2|h3|h4|blockquote|li)>\s*(<br\s*\/?>|\s|&nbsp;)*\s*<\/\1>/gi, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .replace(/(<\/(p|h2|h3|h4|blockquote|ul|ol)>\s*){3,}/gi, (match) =>
      match.replace(/(<\/(p|h2|h3|h4|blockquote|ul|ol)>\s*){2,}/i, "$1$1"),
    )
    .trim();

  return html || (legacyHtml ? "" : plainTextToHtml(rawDescription, productName));
}

export function extractPlainTextFromProductDescription(
  rawDescription?: string | null,
  productName?: string,
) {
  const html = normalizeProductDescriptionHtml(rawDescription, productName);

  if (!html) {
    return "";
  }

  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*li\s*>/gi, "• ")
      .replace(/<\s*\/\s*(th|td)\s*>/gi, " ")
      .replace(/<\s*\/\s*(p|h2|h3|h4|blockquote|li|ul|ol|pre|table|tr)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}
