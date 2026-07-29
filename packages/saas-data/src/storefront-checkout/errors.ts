export const PUBLIC_CHECKOUT_ERROR_CODES = Object.freeze([
  "invalid_input",
  "not_found",
  "version_conflict",
  "discount_invalid",
  "stock_unavailable",
  "payment_method_unavailable",
  "operation_mismatch",
  "commit_unknown",
  "unavailable",
] as const);

export type PublicCheckoutErrorCode = (typeof PUBLIC_CHECKOUT_ERROR_CODES)[number];

const ERROR_CODES = new Set<string>(PUBLIC_CHECKOUT_ERROR_CODES);

export class PublicCheckoutRepositoryError extends Error {
  readonly code: PublicCheckoutErrorCode;

  constructor(code: PublicCheckoutErrorCode) {
    if (typeof code !== "string" || !ERROR_CODES.has(code)) {
      throw new TypeError("public_checkout_error_code_invalid");
    }
    super(code);
    this.code = code;
    Object.defineProperties(this, {
      code: { configurable: false, enumerable: true, value: code, writable: false },
      message: { configurable: false, enumerable: false, value: code, writable: false },
      name: {
        configurable: false,
        enumerable: false,
        value: "PublicCheckoutRepositoryError",
        writable: false,
      },
    });
    Object.freeze(this);
  }
}

class TrustedPublicCheckoutRepositoryError extends PublicCheckoutRepositoryError {}

const TRUSTED_ERRORS = new WeakSet<object>();

export function trustedPublicCheckoutError(
  code: PublicCheckoutErrorCode,
): PublicCheckoutRepositoryError {
  const error = new TrustedPublicCheckoutRepositoryError(code);
  TRUSTED_ERRORS.add(error);
  return error;
}

export function isTrustedPublicCheckoutError(
  error: unknown,
): error is PublicCheckoutRepositoryError {
  try {
    if ((typeof error !== "object" || error === null) && typeof error !== "function") {
      return false;
    }
    return TRUSTED_ERRORS.has(error);
  } catch {
    return false;
  }
}

export function exposePublicCheckoutError(
  error: unknown,
  fallback: PublicCheckoutErrorCode,
): PublicCheckoutRepositoryError {
  return new PublicCheckoutRepositoryError(
    isTrustedPublicCheckoutError(error) ? error.code : fallback,
  );
}
