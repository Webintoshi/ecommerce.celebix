export const CONTENT_RESOURCE_AUTHORING_ERROR_CODES = ['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'durable_authority_invalid', 'credential_invalid', 'connection_revoked', 'model_unavailable', 'rate_limited', 'quota_exceeded', 'operation_busy', 'operation_mismatch', 'operation_not_found', 'record_not_found', 'invalid_transition', 'version_conflict', 'lease_expired', 'dispatch_already_claimed', 'unavailable', 'commit_unknown'] as const;
export type ContentResourceAuthoringErrorCode = typeof CONTENT_RESOURCE_AUTHORING_ERROR_CODES[number];
export class ContentResourceAuthoringRepositoryError extends Error {
    constructor(readonly code: ContentResourceAuthoringErrorCode) { super(code); this.name = 'ContentResourceAuthoringRepositoryError'; }
}
