export const CATALOG_WEIGHT_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "resource_not_found", "profile_not_enabled", "version_conflict", "operation_mismatch",
  "durable_authority_invalid", "unavailable",
] as const);
export type CatalogWeightErrorCode = (typeof CATALOG_WEIGHT_ERROR_CODES)[number];
const TRUSTED = new WeakSet<object>();
export class CatalogWeightRepositoryError extends Error {
  readonly code: CatalogWeightErrorCode;
  constructor(code: CatalogWeightErrorCode) {
    super(code); this.name = "CatalogWeightRepositoryError"; this.code = code; TRUSTED.add(this); Object.freeze(this);
  }
}
export function catalogWeightFailure(code: CatalogWeightErrorCode): CatalogWeightRepositoryError {
  return new CatalogWeightRepositoryError(code);
}
export function catalogWeightRepositoryErrorCode(value: unknown): CatalogWeightErrorCode | undefined {
  try { return typeof value === "object" && value !== null && TRUSTED.has(value) ? (value as CatalogWeightRepositoryError).code : undefined; }
  catch { return undefined; }
}
