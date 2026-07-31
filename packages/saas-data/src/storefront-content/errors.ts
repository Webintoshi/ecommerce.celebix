export const STOREFRONT_CONTENT_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "not_found",
  "version_conflict",
  "operation_mismatch",
  "operation_not_found",
  "membership_denied",
  "durable_authority_invalid",
  "store_inactive",
  "feature_not_enabled",
  "commit_unknown",
  "unavailable",
] as const);

export type StorefrontContentErrorCode = (typeof STOREFRONT_CONTENT_ERROR_CODES)[number];

export class StorefrontContentRepositoryError extends Error {
  readonly code: StorefrontContentErrorCode;

  constructor(code: StorefrontContentErrorCode) {
    super(code);
    this.name = "StorefrontContentRepositoryError";
    this.code = code;
  }
}
