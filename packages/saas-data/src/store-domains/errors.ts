export const STORE_DOMAIN_REPOSITORY_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unavailable",
  "feature_not_enabled",
  "limit_reached",
  "hostname_already_claimed",
  "stale_version",
  "not_found",
  "operation_mismatch",
] as const);

export type StoreDomainRepositoryErrorCode = (typeof STORE_DOMAIN_REPOSITORY_ERROR_CODES)[number];

export class StoreDomainRepositoryError extends Error {
  readonly code: StoreDomainRepositoryErrorCode;
  constructor(code: StoreDomainRepositoryErrorCode) {
    super(`store_domain_repository_${code}`);
    this.name = "StoreDomainRepositoryError";
    this.code = code;
  }
}
