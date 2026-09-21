import type {
  CatalogWeightExtraction,
  CatalogWeightSalesUnit,
  CatalogWeightScope,
} from "./types.ts";

const NUMBER = "[0-9]{1,6}(?:[.,][0-9]{1,3})?";
const UNIT = "(?:gram|gr|g)(?:dır|dir|dur|dür)?";
const UNIT_END = "(?!\\p{L})";
const RANGE = new RegExp(`(${NUMBER})\\s*[-–—]\\s*(${NUMBER})\\s*(${UNIT})${UNIT_END}`, "iu");
const LABEL = new RegExp(`(net\\s+altın\\s+ağırlığı|altın\\s+ağırlığı|çift\\s+ağırlığı|set\\s+ağırlığı|ürün\\s+ağırlığı|ağırlık|gramaj)\\s*:?\\s*(${NUMBER})\\s*(${UNIT})${UNIT_END}`, "iu");
const SENTENCE = new RegExp(`ürün[^.!?\\n]{0,180}?altın[^.!?\\n]{0,100}?\\bve\\s*(${NUMBER})\\s*(${UNIT})${UNIT_END}`, "iu");
const ANY_WEIGHT_NUMBER = new RegExp(`(${NUMBER})\\s*(${UNIT})${UNIT_END}`, "iu");
const AMBIGUOUS = /[0-9]{1,3}[.,][0-9]{3}\s*(?:gram|gr|g)(?!\p{L})/iu;
const SHIPPING = /(?:kargo|paket|desi)[^.!?\n]{0,80}(?:ağırl|gram|\bgr\b|\bg\b)/iu;
const APPROXIMATE = /\b(?:yaklaşık|takriben|ortalama)\b/iu;
const TOLERANCE = /(?:(?:tolerans|sapma)[^.!?\n]{0,80}?%\s*([0-9]{1,2}(?:[.,][0-9]{1,2})?)|%\s*([0-9]{1,2}(?:[.,][0-9]{1,2})?)[^.!?\n]{0,80}?(?:tolerans|sapma))/iu;

const ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  acirc: "â", ccedil: "ç", gbreve: "ğ", icirc: "î", idot: "İ", odot: "ö", ouml: "ö", scedil: "ş", uuml: "ü",
});

function decodeEntity(entity: string): string {
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const value = Number.parseInt(entity.slice(2), 16);
    return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const value = Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : `&${entity};`;
  }
  return ENTITIES[entity.toLocaleLowerCase("en-US")] ?? `&${entity};`;
}

export function catalogWeightDescriptionText(value: string): string {
  return value
    .replace(/\\n/gu, "\n")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<(?:br|\/p|\/li|\/tr|\/div|\/h[1-6])\b[^>]*>/giu, "\n")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (_match, entity: string) => decodeEntity(entity))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .split(/\r?\n/u)
    .map((line) => line.replace(/[\s\u00a0]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function gramsMilli(raw: string): number | null {
  const candidate = raw.trim();
  const separator = candidate.includes(",") ? "," : candidate.includes(".") ? "." : null;
  if (separator !== null) {
    const parts = candidate.split(separator);
    if (parts.length !== 2 || parts[1]!.length === 3) return null;
  }
  const normalized = candidate.replace(",", ".");
  if (!/^(?:0|[1-9][0-9]{0,5})(?:[.][0-9]{1,2})?$/u.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const output = Number(whole) * 1_000 + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(output) && output > 0 ? output : null;
}

function context(line: string, match: RegExpExecArray): string {
  const prefix = line.slice(Math.max(0, match.index - 80), match.index);
  const suffix = line.slice(match.index + match[0].length, match.index + match[0].length + 80);
  return `${prefix}${match[0]}${suffix}`;
}

function scopeAndUnit(label: string): Readonly<{ scope: CatalogWeightScope; salesUnit: CatalogWeightSalesUnit }> {
  const normalized = label.toLocaleLowerCase("tr-TR");
  if (normalized.includes("net altın") || normalized.startsWith("altın ağırlığı")) {
    return Object.freeze({ scope: "net_metal", salesUnit: "unspecified" });
  }
  if (normalized.startsWith("çift")) return Object.freeze({ scope: "total_product", salesUnit: "pair" });
  if (normalized.startsWith("set")) return Object.freeze({ scope: "total_product", salesUnit: "set" });
  if (normalized.startsWith("ürün ağırlığı")) return Object.freeze({ scope: "total_product", salesUnit: "single" });
  return Object.freeze({ scope: "unspecified", salesUnit: "unspecified" });
}

function toleranceBasisPoints(text: string): number | null {
  const match = TOLERANCE.exec(text);
  if (!match) return null;
  const normalized = (match[1] ?? match[2])!.replace(",", ".");
  const value = Number(normalized);
  const basisPoints = Math.round(value * 100);
  return Number.isSafeInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10_000 ? basisPoints : null;
}

function excerpt(line: string, match: RegExpExecArray): string {
  const suffix = line.slice(match.index + match[0].length);
  return `${match[0].trim()}${/^[.!?]/u.test(suffix) ? suffix[0] : ""}`;
}

export function extractCatalogWeightDeclaration(description: string): CatalogWeightExtraction {
  const text = catalogWeightDescriptionText(description);
  if (text.length === 0) return Object.freeze({ kind: "none", reason: "not_found" });
  const lines = text.split("\n");
  const rangeLine = lines.find((line) => RANGE.test(line) && !SHIPPING.test(line));
  if (rangeLine) {
    const match = RANGE.exec(rangeLine)!;
    const minimum = gramsMilli(match[1]!);
    const maximum = gramsMilli(match[2]!);
    if (minimum === null || maximum === null) return Object.freeze({ kind: "none", reason: "ambiguous_decimal" });
    if (minimum >= maximum) return Object.freeze({ kind: "conflict", reason: "multiple_values", valuesGramsMilli: Object.freeze([minimum, maximum].sort((a, b) => a - b)) });
    const nearby = context(rangeLine, match);
    const dimensions = scopeAndUnit(nearby);
    return Object.freeze({ kind: "range", minimumGramsMilli: minimum, maximumGramsMilli: maximum, ...dimensions, sourceExcerpt: match[0].trim() });
  }

  const candidates: Array<Readonly<{ gramsMilli: number; scope: CatalogWeightScope; salesUnit: CatalogWeightSalesUnit; sourceExcerpt: string }>> = [];
  let sawShipping = false;
  let sawAmbiguous = false;
  for (const line of lines) {
    if (SHIPPING.test(line)) {
      if (ANY_WEIGHT_NUMBER.test(line)) sawShipping = true;
      continue;
    }
    if (AMBIGUOUS.test(line)) {
      sawAmbiguous = true;
      continue;
    }
    const labels = [...line.matchAll(new RegExp(LABEL.source, "giu"))];
    if (labels.length > 0) {
      for (const label of labels) {
        const value = gramsMilli(label[2]!);
        if (value === null) { sawAmbiguous = true; continue; }
        candidates.push(Object.freeze({ gramsMilli: value, ...scopeAndUnit(label[1]!), sourceExcerpt: excerpt(line, label) }));
      }
      continue;
    }
    const sentences = [...line.matchAll(new RegExp(SENTENCE.source, "giu"))];
    if (sentences.length > 0) {
      for (const sentence of sentences) {
        const value = gramsMilli(sentence[1]!);
        if (value === null) { sawAmbiguous = true; continue; }
        candidates.push(Object.freeze({ gramsMilli: value, scope: "unspecified", salesUnit: "unspecified", sourceExcerpt: excerpt(line, sentence) }));
      }
      continue;
    }
    const standalone = ANY_WEIGHT_NUMBER.exec(line);
    if (standalone) {
      const value = gramsMilli(standalone[1]!);
      if (value === null) { sawAmbiguous = true; continue; }
      candidates.push(Object.freeze({ gramsMilli: value, scope: "unspecified", salesUnit: "unspecified", sourceExcerpt: standalone[0].trim() }));
    }
  }

  const values = [...new Set(candidates.map((candidate) => candidate.gramsMilli))].sort((a, b) => a - b);
  if (values.length > 1) return Object.freeze({ kind: "conflict", reason: "multiple_values", valuesGramsMilli: Object.freeze(values) });
  if (values.length === 0) {
    if (sawAmbiguous) return Object.freeze({ kind: "none", reason: "ambiguous_decimal" });
    if (sawShipping) return Object.freeze({ kind: "none", reason: "shipping_weight" });
    return Object.freeze({ kind: "none", reason: "not_found" });
  }
  const selected = candidates.find((candidate) => candidate.gramsMilli === values[0])!;
  const tolerance = toleranceBasisPoints(text);
  return Object.freeze({
    kind: "single",
    gramsMilli: selected.gramsMilli,
    scope: selected.scope,
    salesUnit: selected.salesUnit,
    approximate: tolerance !== null || APPROXIMATE.test(text),
    toleranceBasisPoints: tolerance,
    sourceExcerpt: selected.sourceExcerpt,
  });
}
