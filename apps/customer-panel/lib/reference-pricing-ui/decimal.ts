const PLAIN_TURKISH_DECIMAL = /^(0|[1-9][0-9]*)(?:,([0-9]+))?$/;
const GROUPED_TURKISH_DECIMAL = /^([1-9][0-9]{0,2}(?:\.[0-9]{3})+),([0-9]+)$/;
const MAX_SAFE_DECIMAL = "9007199254740991";

export function parseTurkishPricingDecimal(value: unknown, fractionDigits: 6 | 8): string | null {
  if (typeof value !== "string" || (fractionDigits !== 6 && fractionDigits !== 8)) return null;

  const match = PLAIN_TURKISH_DECIMAL.exec(value) ?? GROUPED_TURKISH_DECIMAL.exec(value);
  if (!match) return null;

  const whole = match[1]!.replaceAll(".", "");
  const fraction = match[2] ?? "";
  if (fraction.length > fractionDigits) return null;
  if (
    whole.length > MAX_SAFE_DECIMAL.length
    || (whole.length === MAX_SAFE_DECIMAL.length && whole > MAX_SAFE_DECIMAL)
  ) return null;

  const canonicalFraction = fraction.replace(/0+$/, "");
  if (whole === MAX_SAFE_DECIMAL && canonicalFraction !== "") return null;
  return canonicalFraction === "" ? whole : `${whole}.${canonicalFraction}`;
}
