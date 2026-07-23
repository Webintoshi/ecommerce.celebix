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

const TRUSTED_ERRORS = new WeakSet<object>();

class InventoryRepositoryFailure extends Error {
  readonly code: InventoryErrorCode;
  constructor(code: InventoryErrorCode) {
    super(code);
    this.name = "InventoryRepositoryError";
    this.code = code;
    TRUSTED_ERRORS.add(this);
    Object.freeze(this);
  }
}

export function inventoryFailure(code: InventoryErrorCode): Error {
  return new InventoryRepositoryFailure(code);
}

export function inventoryRepositoryErrorCode(value: unknown): InventoryErrorCode | undefined {
  try {
    if ((typeof value !== "object" && typeof value !== "function") || value === null || !TRUSTED_ERRORS.has(value)) {
      return undefined;
    }
    return (value as InventoryRepositoryFailure).code;
  } catch { return undefined; }
}
