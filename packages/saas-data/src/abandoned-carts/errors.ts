export const ABANDONED_CART_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "cart_not_found",
  "invalid_transition",
  "version_conflict",
  "operation_replayed",
  "operation_mismatch",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type AbandonedCartErrorCode = (typeof ABANDONED_CART_ERROR_CODES)[number];

export class AbandonedCartRepositoryError extends Error {
  readonly code: AbandonedCartErrorCode;

  constructor(code: AbandonedCartErrorCode) {
    super(code);
    this.name = "AbandonedCartRepositoryError";
    this.code = code;
  }
}
