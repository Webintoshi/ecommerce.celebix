export const QUICK_LINK_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "action_denied",
  "quick_link_not_found",
  "provider_not_ready",
  "catalog_item_unavailable",
  "stock_unavailable",
  "invalid_transition",
  "version_conflict",
  "operation_replayed",
  "operation_mismatch",
  "durable_authority_invalid",
  "unavailable",
  "commit_unknown",
] as const);

export type QuickOrderLinkErrorCode = (typeof QUICK_LINK_ERROR_CODES)[number];

export class QuickOrderLinkRepositoryError extends Error {
  readonly code: QuickOrderLinkErrorCode;

  constructor(code: QuickOrderLinkErrorCode) {
    super(code);
    this.name = "QuickOrderLinkRepositoryError";
    this.code = code;
  }
}
