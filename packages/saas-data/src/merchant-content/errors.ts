export const MERCHANT_CONTENT_ERROR_CODES = ['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'record_not_found', 'invalid_transition', 'version_conflict', 'operation_mismatch', 'operation_not_found', 'durable_authority_invalid', 'unavailable', 'history_unavailable', 'commit_unknown'] as const;
export type MerchantContentErrorCode = typeof MERCHANT_CONTENT_ERROR_CODES[number];
export class MerchantContentRepositoryError extends Error {
    constructor(readonly code: MerchantContentErrorCode) { super(code); this.name = 'MerchantContentRepositoryError'; }
}
