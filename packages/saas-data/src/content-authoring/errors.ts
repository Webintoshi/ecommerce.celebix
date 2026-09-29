export const CONTENT_AUTHORING_ERROR_CODES = ['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'durable_authority_invalid', 'credential_invalid', 'connection_revoked', 'model_unavailable', 'rate_limited', 'quota_exceeded', 'operation_busy', 'operation_mismatch', 'operation_not_found', 'version_conflict', 'lease_expired', 'dispatch_already_claimed', 'unavailable', 'commit_unknown'] as const;
export type ContentAuthoringRepositoryErrorCode = typeof CONTENT_AUTHORING_ERROR_CODES[number];
export class ContentAuthoringRepositoryError extends Error {
    constructor(readonly code: ContentAuthoringRepositoryErrorCode) { super(code); this.name = 'ContentAuthoringRepositoryError'; }
}
