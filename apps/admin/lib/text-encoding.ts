type TextNormalizeOptions = {
  collapseWhitespace?: boolean;
  decodeEntities?: boolean;
  trim?: boolean;
};

type TextFieldOptions = TextNormalizeOptions & {
  keys: string[];
};

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: "\"",
  lt: "<",
  gt: ">",
  nbsp: " ",
  uuml: "\u00fc",
  Uuml: "\u00dc",
  ouml: "\u00f6",
  Ouml: "\u00d6",
  auml: "\u00e4",
  Auml: "\u00c4",
  ccedil: "\u00e7",
  Ccedil: "\u00c7",
  iuml: "\u00ef",
  Iuml: "\u00cf",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\"",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
};

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00c3\u00bc", "\u00fc"],
  ["\u00c3\u0152", "\u00dc"],
  ["\u00c3\u009c", "\u00dc"],
  ["\u00c3\u00b6", "\u00f6"],
  ["\u00c3\u2013", "\u00d6"],
  ["\u00c3\u0096", "\u00d6"],
  ["\u00c3\u00a7", "\u00e7"],
  ["\u00c3\u2021", "\u00c7"],
  ["\u00c3\u0087", "\u00c7"],
  ["\u00c4\u00b1", "\u0131"],
  ["\u00c4\u00b0", "\u0130"],
  ["\u00c4\u0178", "\u011f"],
  ["\u00c4\u009f", "\u011f"],
  ["\u00c4\u017d", "\u011e"],
  ["\u00c4\u009e", "\u011e"],
  ["\u00c5\u0178", "\u015f"],
  ["\u00c5\u009f", "\u015f"],
  ["\u00c5\u017d", "\u015e"],
  ["\u00c5\u009e", "\u015e"],
  ["\u00e2\u20ac\u2122", "'"],
  ["\u00e2\u0080\u0099", "'"],
  ["\u00e2\u20ac\u02dc", "'"],
  ["\u00e2\u0080\u0098", "'"],
  ["\u00e2\u20ac\u0153", "\""],
  ["\u00e2\u0080\u009c", "\""],
  ["\u00e2\u20ac\u009d", "\""],
  ["\u00e2\u0080\u009d", "\""],
  ["\u00e2\u20ac\u201c", "\u2013"],
  ["\u00e2\u0080\u0093", "\u2013"],
  ["\u00e2\u20ac\u009d", "\u2014"],
  ["\u00e2\u0080\u0094", "\u2014"],
  ["\u00e2\u20ac\u00a6", "\u2026"],
  ["\u00e2\u0080\u00a6", "\u2026"],
  ["\u00e2\u201a\u00ba", "\u20ba"],
  ["\u00c2\u00a0", " "],
  ["\u00c2\u00ae", "\u00ae"],
  ["\u00c2\u00a9", "\u00a9"],
];

export function decodeHtmlEntities(value: string): string {
  if (!value) {
    return "";
  }

  let decoded = value;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = decoded.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (entity, token) => {
      if (token[0] === "#") {
        const isHex = token[1]?.toLowerCase() === "x";
        const numericValue = Number.parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(numericValue) ? String.fromCodePoint(numericValue) : entity;
      }

      return HTML_ENTITY_MAP[token] ?? entity;
    });

    if (next === decoded) {
      break;
    }

    decoded = next;
  }

  return decoded;
}

export function repairMojibakeIfNeeded(value: string): string {
  if (!value) {
    return "";
  }

  let repaired = value;
  for (const [broken, replacement] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(broken).join(replacement);
  }

  return repaired;
}

export function normalizeVisibleText(
  value: unknown,
  options: TextNormalizeOptions = {},
): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const shouldTrim = options.trim ?? true;
  let normalized = String(value);

  if (options.decodeEntities) {
    normalized = decodeHtmlEntities(normalized);
  }

  normalized = repairMojibakeIfNeeded(normalized).normalize("NFC");

  if (options.collapseWhitespace) {
    normalized = normalized.replace(/\s+/g, " ");
  }

  return shouldTrim ? normalized.trim() : normalized;
}

export function normalizeVisibleTextFields<T extends Record<string, unknown>>(
  record: T,
  options: TextFieldOptions,
): T {
  const nextRecord = { ...record };

  for (const key of options.keys) {
    const value = nextRecord[key];
    if (typeof value === "string" || typeof value === "number") {
      nextRecord[key as keyof T] = normalizeVisibleText(value, options) as T[keyof T];
    }
  }

  return nextRecord;
}
