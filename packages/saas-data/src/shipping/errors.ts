export const SHIPPING_ADMIN_ERROR_CODES = Object.freeze([
  "invalid_input", "membership_denied", "store_inactive", "feature_not_enabled",
  "durable_authority_invalid", "version_conflict", "operation_mismatch", "not_found",
  "resource_invalid", "already_revoked", "commit_unknown", "unavailable",
] as const);
export type ShippingAdminErrorCode = (typeof SHIPPING_ADMIN_ERROR_CODES)[number];

export class ShippingAdminRepositoryError extends Error {
  readonly code: ShippingAdminErrorCode;
  constructor(code: ShippingAdminErrorCode) { super(code); this.name = "ShippingAdminRepositoryError"; this.code = code; }
}

export const SHIPPING_WORKFLOW_ERROR_CODES = Object.freeze([
  "invalid_input", "lease_invalid", "credential_stale", "commit_unknown", "unavailable",
] as const);
export type ShippingWorkflowErrorCode = (typeof SHIPPING_WORKFLOW_ERROR_CODES)[number];

export class ShippingWorkflowRepositoryError extends Error {
  readonly code: ShippingWorkflowErrorCode;
  constructor(code: ShippingWorkflowErrorCode) { super(code); this.name = "ShippingWorkflowRepositoryError"; this.code = code; }
}
