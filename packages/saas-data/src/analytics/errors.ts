export const ANALYTICS_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid", "unavailable",
] as const);

export type AnalyticsErrorCode = (typeof ANALYTICS_ERROR_CODES)[number];

export class AnalyticsRepositoryError extends Error {
  readonly code: AnalyticsErrorCode;
  constructor(code: AnalyticsErrorCode) { super(code); this.name = "AnalyticsRepositoryError"; this.code = code; }
}
