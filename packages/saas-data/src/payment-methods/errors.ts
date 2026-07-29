export const PAYMENT_METHOD_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "profile_not_found",
  "profile_not_active",
  "provider_capability_mismatch",
  "record_not_found",
  "invalid_transition",
  "version_conflict",
  "provider_already_active",
  "method_already_exists",
  "operation_mismatch",
  "operation_not_found",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type PaymentMethodErrorCode = (typeof PAYMENT_METHOD_ERROR_CODES)[number];

export class PaymentMethodRepositoryError extends Error {
  readonly code: PaymentMethodErrorCode;

  constructor(code: PaymentMethodErrorCode) {
    super(code);
    this.name = "PaymentMethodRepositoryError";
    this.code = code;
  }
}
