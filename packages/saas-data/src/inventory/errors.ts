export const INVENTORY_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "feature_not_enabled",
  "resource_not_found",
  "invalid_transition",
  "version_conflict",
  "operation_mismatch",
  "over_receipt",
  "inventory_conflict",
  "active_hold_conflict",
  "insufficient_stock",
  "durable_authority_invalid",
  "unavailable",
] as const);

export type InventoryErrorCode = (typeof INVENTORY_ERROR_CODES)[number];

export class InventoryRepositoryError extends Error {
  readonly code: InventoryErrorCode;
  constructor(code: InventoryErrorCode) {
    super(code);
    this.name = "InventoryRepositoryError";
    this.code = code;
  }
}
