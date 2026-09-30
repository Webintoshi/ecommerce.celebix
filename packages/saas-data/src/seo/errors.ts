export const SEO_ERROR_CODES = ['invalid_input','unauthenticated','membership_denied','store_inactive','feature_not_enabled','record_not_found','version_conflict','operation_mismatch','unavailable','commit_unknown','not_found'] as const;
export type SeoErrorCode = typeof SEO_ERROR_CODES[number];
export class SeoRepositoryError extends Error { readonly code: SeoErrorCode; constructor(code: SeoErrorCode) { super(code);this.name='SeoRepositoryError';this.code=code; } }
