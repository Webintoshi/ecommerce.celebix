function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

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

function insertSectionBreaks(value: string): string {
  return INLINE_SECTION_LABELS.reduce((acc, label) => {
    const pattern = new RegExp(`\\s+(?=${escapeRegex(label)})`, "g");
    return acc.replace(pattern, "\n\n");
  }, value);
}

function normalizeDescriptionText(rawDescription: string, productName?: string): string {
  let text = rawDescription
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|section|article|h[1-6]|ul|ol)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  text = decodeHtmlEntities(text)
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\u00A0/g, " ");

  if (productName?.trim()) {
    const escapedName = escapeRegex(productName.trim());
    text = text.replace(
      new RegExp(`^\\s*(${escapedName})\\s*"+\\s*${escapedName}\\s*"+\\s*`, "i"),
      "$1 ",
    );
  }

  text = insertSectionBreaks(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

export function formatProductDescription(rawDescription?: string | null, productName?: string): string[] {
  if (!rawDescription || !rawDescription.trim()) {
    return [];
  }

  const normalized = normalizeDescriptionText(rawDescription, productName);

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}
