const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["Ãœ", "Ü"],
  ["Ã¼", "ü"],
  ["Ã–", "Ö"],
  ["Ã¶", "ö"],
  ["Ã‡", "Ç"],
  ["Ã§", "ç"],
  ["Ä°", "İ"],
  ["Ä±", "ı"],
  ["Äž", "Ğ"],
  ["ÄŸ", "ğ"],
  ["Åž", "Ş"],
  ["ÅŸ", "ş"],
  ["Å", "Ş"],
  ["Å", "ş"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["â†’", "→"],
  ["Â", ""],
];

const MOJIBAKE_PATTERN = /Ã|Â|Ä|Å|â|�/;

export function repairDisplayText(value?: string | null): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  if (!MOJIBAKE_PATTERN.test(value)) {
    return value;
  }

  let normalized = value;

  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    normalized = normalized.split(from).join(to);
  }

  return normalized.replace(/�/g, "").trim();
}
