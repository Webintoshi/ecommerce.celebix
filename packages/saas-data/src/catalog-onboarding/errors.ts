export const CATALOG_ONBOARDING_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "durable_authority_invalid",
  "product_limit_reached",
  "product_not_found",
  "category_not_found",
  "category_in_use",
  "catalog_conflict",
  "version_conflict",
  "invalid_transition",
  "media_incomplete",
  "operation_mismatch",
  "operation_not_found",
  "unavailable",
] as const);

export type CatalogOnboardingErrorCode = (typeof CATALOG_ONBOARDING_ERROR_CODES)[number];

export class CatalogOnboardingRepositoryError extends Error {
  readonly code: CatalogOnboardingErrorCode;
  constructor(code: CatalogOnboardingErrorCode) {
    super(code);
    this.name = "CatalogOnboardingRepositoryError";
    this.code = code;
  }
}
