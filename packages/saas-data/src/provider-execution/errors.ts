export const MERCHANT_PROVIDER_PROFILE_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "provider_not_found",
  "provider_capability_mismatch",
  "provider_disabled",
  "profile_not_found",
  "invalid_transition",
  "version_conflict",
  "operation_mismatch",
  "operation_not_found",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type MerchantProviderProfileErrorCode =
  (typeof MERCHANT_PROVIDER_PROFILE_ERROR_CODES)[number];

export class MerchantProviderProfileRepositoryError extends Error {
  readonly code: MerchantProviderProfileErrorCode;

  constructor(code: MerchantProviderProfileErrorCode) {
    super(code);
    this.name = "MerchantProviderProfileRepositoryError";
    this.code = code;
  }
}

export const MERCHANT_PROVIDER_WORKFLOW_ERROR_CODES = Object.freeze([
  "invalid_input",
  "record_not_found",
  "profile_not_found",
  "provider_disabled",
  "lease_lost",
  "invalid_transition",
  "version_conflict",
  "operation_mismatch",
  "operation_not_found",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type MerchantProviderWorkflowErrorCode =
  (typeof MERCHANT_PROVIDER_WORKFLOW_ERROR_CODES)[number];

export class MerchantProviderWorkflowRepositoryError extends Error {
  readonly code: MerchantProviderWorkflowErrorCode;

  constructor(code: MerchantProviderWorkflowErrorCode) {
    super(code);
    this.name = "MerchantProviderWorkflowRepositoryError";
    this.code = code;
  }
}
