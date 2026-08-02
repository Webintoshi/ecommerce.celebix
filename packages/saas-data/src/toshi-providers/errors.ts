export const TOSHI_PROVIDER_REPOSITORY_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "credential_invalid",
  "model_unavailable",
  "rate_limited",
  "quota_exceeded",
  "provider_timeout",
  "provider_unavailable",
  "version_conflict",
  "operation_mismatch",
  "operation_not_found",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type ToshiProviderRepositoryErrorCode =
  (typeof TOSHI_PROVIDER_REPOSITORY_ERROR_CODES)[number];

export class ToshiProviderRepositoryError extends Error {
  readonly code: ToshiProviderRepositoryErrorCode;

  constructor(code: ToshiProviderRepositoryErrorCode) {
    super(code);
    this.name = "ToshiProviderRepositoryError";
    this.code = code;
  }
}
