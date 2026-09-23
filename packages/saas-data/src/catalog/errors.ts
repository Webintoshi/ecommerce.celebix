export const CATALOG_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "product_limit_reached",
  "product_not_found",
  "variant_not_found",
  "slug_conflict",
  "sku_conflict",
  "variant_combination_conflict",
  "variant_limit_reached",
  "version_conflict",
  "dynamic_pricing_not_ready",
  "dynamic_price_unavailable",
  "removal_not_eligible",
  "operation_replayed",
  "operation_mismatch",
  "invalid_confirmation",
  "cleanup_pending",
  "cleanup_failed",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

export class CatalogRepositoryError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode) {
    super(code);
    this.name = "CatalogRepositoryError";
    this.code = code;
  }
}
