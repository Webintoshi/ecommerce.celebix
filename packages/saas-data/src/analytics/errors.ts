export const ANALYTICS_ERROR_CODES = Object.freeze([
  "invalid_input","unauthenticated","store_inactive","membership_denied","durable_authority_invalid",
  "feature_not_enabled","hostname_not_found","not_configured","already_configured","website_id_conflict",
  "operation_mismatch","connection_not_found","website_id_mismatch","hostname_mismatch","stale_operation",
  "stale_version","not_committed","lease_lost","unavailable",
] as const);

export type AnalyticsErrorCode = (typeof ANALYTICS_ERROR_CODES)[number];

export class AnalyticsRepositoryError extends Error {
  readonly code: AnalyticsErrorCode;
  constructor(code: AnalyticsErrorCode) { super(code); this.name="AnalyticsRepositoryError"; this.code=code; }
}
