export const PRICING_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "resource_not_found", "invalid_transition", "version_conflict", "operation_mismatch", "pricing_conflict",
  "durable_authority_invalid", "unavailable",
] as const);
export type PricingErrorCode = (typeof PRICING_ERROR_CODES)[number];
const TRUSTED = new WeakSet<object>();
class PricingRepositoryFailure extends Error {
  readonly code: PricingErrorCode;
  constructor(code: PricingErrorCode) { super(code); this.name = "PricingRepositoryError"; this.code = code; TRUSTED.add(this); Object.freeze(this); }
}
export function pricingFailure(code: PricingErrorCode): Error { return new PricingRepositoryFailure(code); }
export function pricingRepositoryErrorCode(value: unknown): PricingErrorCode | undefined {
  try { return ((typeof value === "object" || typeof value === "function") && value !== null && TRUSTED.has(value)) ? (value as PricingRepositoryFailure).code : undefined; }
  catch { return undefined; }
}
