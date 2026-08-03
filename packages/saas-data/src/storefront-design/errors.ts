export const STOREFRONT_DESIGN_REPOSITORY_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "durable_authority_invalid",
  "version_conflict",
  "operation_mismatch",
  "not_found",
  "conflict",
  "unavailable",
] as const);

export type StorefrontDesignRepositoryErrorCode = (typeof STOREFRONT_DESIGN_REPOSITORY_ERROR_CODES)[number];

export class StorefrontDesignRepositoryError extends Error {
  readonly code: StorefrontDesignRepositoryErrorCode;
  constructor(code: StorefrontDesignRepositoryErrorCode) {
    super(code);
    this.name = "StorefrontDesignRepositoryError";
    this.code = code;
  }
}
