export const ORDER_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "order_not_found",
  "note_not_found",
  "draft_not_found",
  "draft_not_editable",
  "inventory_conflict",
  "catalog_conflict",
  "customer_conflict",
  "invalid_transition",
  "version_conflict",
  "operation_replayed",
  "operation_mismatch",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[number];

export class OrderRepositoryError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode) {
    super(code);
    this.name = "OrderRepositoryError";
    this.code = code;
  }
}
