export const SHIPPING_ADMIN_ERROR_CODES = Object.freeze([
  "invalid_input", "membership_denied", "store_inactive", "feature_not_enabled",
  "durable_authority_invalid", "version_conflict", "operation_mismatch", "not_found",
  "resource_invalid", "already_revoked", "order_not_found", "order_version_mismatch",
  "order_not_fulfillable", "currency_unsupported", "provider_not_ready", "quote_not_found",
  "quote_expired", "quote_not_ready", "option_invalid", "shipment_exists", "operation_not_found",
  "commit_unknown", "unavailable",
] as const);
export type ShippingAdminErrorCode = (typeof SHIPPING_ADMIN_ERROR_CODES)[number];

export class ShippingAdminRepositoryError extends Error {
  readonly code: ShippingAdminErrorCode;
  constructor(code: ShippingAdminErrorCode) { super(code); this.name = "ShippingAdminRepositoryError"; this.code = code; }
}

export const SHIPPING_WORKFLOW_ERROR_CODES = Object.freeze([
  "invalid_input", "lease_invalid", "credential_stale", "quote_expired", "resource_invalid",
  "shipment_stale", "commit_unknown", "unavailable",
] as const);
export type ShippingWorkflowErrorCode = (typeof SHIPPING_WORKFLOW_ERROR_CODES)[number];

export class ShippingWorkflowRepositoryError extends Error {
  readonly code: ShippingWorkflowErrorCode;
  constructor(code: ShippingWorkflowErrorCode) { super(code); this.name = "ShippingWorkflowRepositoryError"; this.code = code; }
}
