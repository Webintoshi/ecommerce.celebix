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
  "version_conflict",
  "operation_replayed",
  "operation_mismatch",
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
