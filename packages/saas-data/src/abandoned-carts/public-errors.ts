export const PUBLIC_ABANDONED_CART_ERROR_CODES = Object.freeze([
  "invalid_input", "not_found", "catalog_item_unavailable", "invalid_transition", "commit_unknown", "unavailable",
] as const);

export type PublicAbandonedCartErrorCode = (typeof PUBLIC_ABANDONED_CART_ERROR_CODES)[number];

export class PublicAbandonedCartRepositoryError extends Error {
  readonly code: PublicAbandonedCartErrorCode;
  constructor(code: PublicAbandonedCartErrorCode) {
    super(code);
    this.name = "PublicAbandonedCartRepositoryError";
    this.code = code;
  }
}
