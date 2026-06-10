const ABOUT_SECTION_TITLES = [
  "MARKAMIZIN HİKÂYESİ",
  "MİSYONUMUZ",
  "VİZYONUMUZ",
  "NEDEN BİZİ TERCİH ETMELİSİNİZ?",
] as const;

const WHY_US_LABELS = [
  "Kaliteli Malzemeler",
  "El İşçiliği",
  "Özgün Tasarımlar",
  "Sürdürülebilirlik",
  "Müşteri Memnuniyeti",
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRichStructure(html: string): boolean {
  const headingCount = (html.match(/<h[23][^>]*>/gi) || []).length;
  const paragraphCount = (html.match(/<p[^>]*>/gi) || []).length;
  const listCount = (html.match(/<ul[^>]*>/gi) || []).length;

  return headingCount >= 2 || listCount >= 1 || (paragraphCount >= 3 && headingCount >= 1);
}

function normalizeAboutPlainText(plainText: string): string {
  return plainText.replace(/^Hakkımızda\s*/i, "").trim();
}

function buildWhyUsList(body: string): string {
  const pattern = new RegExp(
    `(?=${WHY_US_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}:)`,
    "g",
  );
  const items = body.split(pattern).map((item) => item.trim()).filter(Boolean);

  if (items.length < 2) {
    return `<p>${escapeHtml(body)}</p>`;
  }

  const listItems = items
    .map((item) => {
      const colonIndex = item.indexOf(":");
      if (colonIndex === -1) {
        return `<li>${escapeHtml(item)}</li>`;
      }

      const label = item.slice(0, colonIndex).trim();
      const copy = item.slice(colonIndex + 1).trim();
      return `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(copy)}</span></li>`;
    })
    .join("");

  return `<ul class="about-feature-list">${listItems}</ul>`;
}

function isAboutSectionTitle(value: string): boolean {
  const normalized = value.trim().toLocaleUpperCase("tr-TR");
  return ABOUT_SECTION_TITLES.some(
    (title) => title.toLocaleUpperCase("tr-TR") === normalized,
  );
}

function structureAboutPlainText(plainText: string): string {
  const normalized = normalizeAboutPlainText(plainText);
  if (!normalized) {
    return "";
  }

  const sectionPattern = new RegExp(
    `(${ABOUT_SECTION_TITLES.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  const parts = normalized.split(sectionPattern).map((part) => part.trim()).filter(Boolean);

  if (parts.length <= 1) {
    return `<div class="about-section"><p>${escapeHtml(normalized)}</p></div>`;
  }

  let html = "";
  let index = 0;

  if (parts[0] && !isAboutSectionTitle(parts[0])) {
    html += `<section class="about-section about-section--lead"><p>${escapeHtml(parts[0])}</p></section>`;
    index = 1;
  }

  for (; index < parts.length; index += 2) {
    const title = parts[index];
    const body = parts[index + 1] ?? "";
    if (!title) {
      continue;
    }

    const isWhyUs = /NEDEN BİZİ TERCİH/i.test(title);
    html += `<section class="about-section"><h2>${escapeHtml(title)}</h2>`;
    html += isWhyUs ? buildWhyUsList(body) : `<p>${escapeHtml(body)}</p>`;
    html += "</section>";
  }

  return html;
}

/**
 * Admin CMS HTML is preserved when already structured.
 * Flat paragraphs are re-flowed for readability without changing the source text.
 */
export function prepareAboutPageHtml(contentHtml: string, plainText: string): string {
  const trimmedHtml = contentHtml.trim();
  if (!trimmedHtml) {
    return "";
  }

  if (hasRichStructure(trimmedHtml)) {
    return trimmedHtml;
  }

  const sourceText = plainText.trim() || stripHtml(trimmedHtml);
  return structureAboutPlainText(sourceText) || trimmedHtml;
}
