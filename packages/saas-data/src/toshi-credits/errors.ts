export const TOSHI_CREDIT_ERROR_CODES = Object.freeze(['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'durable_authority_invalid', 'insufficient_credits', 'operation_busy', 'operation_mismatch', 'operation_not_found', 'operation_failed', 'operation_unknown', 'reservation_expired', 'commit_unknown', 'unavailable'] as const);
export type ToshiCreditErrorCode = (typeof TOSHI_CREDIT_ERROR_CODES)[number];
export class ToshiCreditRepositoryError extends Error {
  constructor(readonly code: ToshiCreditErrorCode) { super(code); this.name = 'ToshiCreditRepositoryError'; }
}
