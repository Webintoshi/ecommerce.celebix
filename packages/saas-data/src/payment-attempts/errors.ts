export const PAYMENT_ATTEMPT_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unavailable",
  "commit_unknown",
  "operation_mismatch",
  "store_inactive",
  "payment_method_not_found",
  "payment_method_inactive",
  "profile_not_found",
  "profile_not_active",
  "provider_disabled",
  "environment_invalid",
  "callback_binding_conflict",
  "record_not_found",
  "version_conflict",
  "credential_version_mismatch",
  "invalid_transition",
  "provider_reference_mismatch",
  "not_found",
  "callback_not_found",
  "callback_replay_mismatch",
  "amount_mismatch",
  "currency_mismatch",
  "lease_lost",
] as const);

export type PaymentAttemptErrorCode = (typeof PAYMENT_ATTEMPT_ERROR_CODES)[number];

const CODES = new Set<string>(PAYMENT_ATTEMPT_ERROR_CODES);

export class PaymentAttemptRepositoryError extends Error {
  readonly code: PaymentAttemptErrorCode;

  constructor(code: PaymentAttemptErrorCode) {
    if (!CODES.has(code)) throw new TypeError("payment_attempt_error_code_invalid");
    super(code);
    this.code = code;
    Object.defineProperties(this, {
      code: { enumerable: true, writable: false },
      message: { enumerable: false, writable: false },
      name: {
        enumerable: false,
        writable: false,
        value: "PaymentAttemptRepositoryError",
      },
    });
    Object.freeze(this);
  }
}

class TrustedPaymentAttemptRepositoryError extends PaymentAttemptRepositoryError {}

export function trustedPaymentAttemptError(
  code: PaymentAttemptErrorCode,
): PaymentAttemptRepositoryError {
  return new TrustedPaymentAttemptRepositoryError(code);
}

export function isTrustedPaymentAttemptError(
  value: unknown,
): value is PaymentAttemptRepositoryError {
  return value instanceof TrustedPaymentAttemptRepositoryError;
}

export function exposePaymentAttemptError(
  value: unknown,
  fallback: PaymentAttemptErrorCode = "unavailable",
): PaymentAttemptRepositoryError {
  return new PaymentAttemptRepositoryError(
    isTrustedPaymentAttemptError(value) ? value.code : fallback,
  );
}
