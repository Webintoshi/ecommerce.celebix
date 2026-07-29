export const MEDIA_ERROR_CODES = Object.freeze(["invalid_input", "membership_denied", "store_inactive", "feature_not_enabled", "product_not_found", "variant_not_found", "media_not_found", "media_limit_reached", "version_conflict", "operation_mismatch", "unavailable"] as const);
export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];
export class ProductMediaRepositoryError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode) { super(code); this.name = "ProductMediaRepositoryError"; this.code = code; }
}
