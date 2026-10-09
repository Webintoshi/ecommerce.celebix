export type EmailMarketingErrorCode = 'invalid_input' | 'unauthorized' | 'forbidden' | 'version_conflict' | 'operation_conflict' | 'candidate_expired' | 'account_in_use' | 'account_mismatch' | 'provider_unauthorized' | 'provider_forbidden' | 'provider_rate_limited' | 'provider_unavailable' | 'provider_invalid_response' | 'outcome_unknown' | 'cleanup_pending' | 'not_configured';
export class EmailMarketingError extends Error {
  constructor(readonly code: EmailMarketingErrorCode, readonly retryAfterSeconds: number | null = null) { super(`email_marketing_${code}`); this.name = 'EmailMarketingError'; }
}
