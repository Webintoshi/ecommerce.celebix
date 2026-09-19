export const REFERENCE_PRICING_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "resource_not_found", "version_conflict", "operation_mismatch", "scope_conflict",
  "durable_authority_invalid", "unavailable",
] as const);
export type ReferencePricingErrorCode = (typeof REFERENCE_PRICING_ERROR_CODES)[number];
const TRUSTED = new WeakSet<object>();
export class ReferencePricingRepositoryError extends Error {
  readonly code: ReferencePricingErrorCode;
  constructor(code: ReferencePricingErrorCode) {
    super(code);
    this.name = "ReferencePricingRepositoryError";
    this.code = code;
    TRUSTED.add(this);
    Object.freeze(this);
  }
}
export function failure(code: ReferencePricingErrorCode): ReferencePricingRepositoryError {
  return new ReferencePricingRepositoryError(code);
}
export function referencePricingRepositoryErrorCode(value: unknown): ReferencePricingErrorCode | undefined {
  try {
    return (typeof value === "object" && value !== null && TRUSTED.has(value))
      ? (value as ReferencePricingRepositoryError).code : undefined;
  } catch { return undefined; }
}
