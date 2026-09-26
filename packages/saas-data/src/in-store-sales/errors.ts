export const IN_STORE_SALES_ERROR_CODES = Object.freeze(["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "origin_denied", "not_found", "ambiguous_barcode", "version_conflict", "operation_mismatch", "invalid_transition", "inventory_conflict", "pricing_unavailable", "discount_denied", "discount_invalid", "unavailable"] as const);
export type InStoreSalesErrorCode = (typeof IN_STORE_SALES_ERROR_CODES)[number];
const trusted = new WeakSet<object>();
export class InStoreSalesRepositoryError extends Error {
    readonly code: InStoreSalesErrorCode;
    constructor(code: InStoreSalesErrorCode) { super(code); this.name = "InStoreSalesRepositoryError"; this.code = code; trusted.add(this); Object.freeze(this); }
}
export function inStoreSalesRepositoryErrorCode(value: unknown): InStoreSalesErrorCode | undefined { try {
    return typeof value === "object" && value !== null && trusted.has(value) ? (value as InStoreSalesRepositoryError).code : undefined;
}
catch {
    return undefined;
} }
export function failure(code: InStoreSalesErrorCode = "invalid_input"): never { throw new InStoreSalesRepositoryError(code); }
