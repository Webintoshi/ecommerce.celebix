export const TOSHI_CONVERSATION_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid",
  "credential_invalid", "connection_revoked", "model_unavailable", "rate_limited", "quota_exceeded", "provider_timeout", "provider_unavailable",
  "version_conflict", "turn_busy", "conversation_limit_reached", "conversation_not_found", "operation_mismatch", "operation_failed", "operation_not_found", "cancelled", "unavailable",
] as const);
export type ToshiConversationErrorCode = (typeof TOSHI_CONVERSATION_ERROR_CODES)[number];
export class ToshiConversationRepositoryError extends Error {
  readonly code: ToshiConversationErrorCode;
  constructor(code: ToshiConversationErrorCode) { super(code); this.name = "ToshiConversationRepositoryError"; this.code = code; }
}
