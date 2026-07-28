export const CATALOG_MIGRATION_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "durable_authority_invalid",
  "job_not_found",
  "job_mismatch",
  "product_limit_reached",
  "import_conflict",
  "operation_mismatch",
  "operation_not_found",
  "unavailable",
] as const);

export type CatalogMigrationErrorCode = (typeof CATALOG_MIGRATION_ERROR_CODES)[number];

export class CatalogMigrationRepositoryError extends Error {
  readonly code: CatalogMigrationErrorCode;
  constructor(code: CatalogMigrationErrorCode) {
    super(code);
    this.name = "CatalogMigrationRepositoryError";
    this.code = code;
  }
}
