import { normalizePromotionCode } from "@celebix/saas-contracts";

const COOKIE_NAME = "__Host-celebix_coupon";
const CANDIDATE_TTL_SECONDS = 86_400;

function canonical(value: unknown): string | null {
  try {
    const normalized = normalizePromotionCode(value);
    return normalized === value ? normalized : null;
  } catch {
    return null;
  }
}

export function readCouponCandidateCookie(
  cookieHeader: string | null,
): readonly string[] {
  if (!cookieHeader || cookieHeader.length > 8_192) return Object.freeze([]);
  const matches: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const selected = part.trim();
    const separator = selected.indexOf("=");
    if (separator < 1 || selected.slice(0, separator) !== COOKIE_NAME) continue;
    matches.push(selected.slice(separator + 1));
  }
  if (matches.length !== 1) return Object.freeze([]);
  const values = matches[0]!.split(".");
  if (values.length < 1 || values.length > 5) return Object.freeze([]);
  const output = values.map(canonical);
  if (output.some((value) => value === null)) return Object.freeze([]);
  const selected = output as string[];
  return new Set(selected).size === selected.length
    ? Object.freeze(selected)
    : Object.freeze([]);
}

export function serializeCouponCandidateCookie(values: readonly string[]): string {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > 5 ||
    Object.getPrototypeOf(values) !== Array.prototype
  )
    throw new TypeError("coupon_candidate_cookie_invalid");
  const selected = values.map(canonical);
  if (
    selected.some((value) => value === null) ||
    new Set(selected).size !== selected.length
  )
    throw new TypeError("coupon_candidate_cookie_invalid");
  return `${COOKIE_NAME}=${selected.join(".")}; Path=/; Max-Age=${CANDIDATE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCouponCandidateCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
