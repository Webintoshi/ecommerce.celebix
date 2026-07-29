export const CATALOG_ADMIN_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "resource_not_found", "review_not_found", "slug_conflict", "product_limit_reached", "import_conflict",
  "invalid_transition", "version_conflict", "operation_mismatch", "durable_authority_invalid", "unavailable",
] as const);
export type CatalogAdminErrorCode = (typeof CATALOG_ADMIN_ERROR_CODES)[number];
export class CatalogAdminRepositoryError extends Error {
  readonly code: CatalogAdminErrorCode;
  constructor(code: CatalogAdminErrorCode) { super(code); this.name = "CatalogAdminRepositoryError"; this.code = code; }
}
