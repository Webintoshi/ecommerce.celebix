import type { OperationId, SaaSContractSchemaVersion } from "./types.ts";

export const SAAS_ERROR_CODES = [
  "invalid_input",
  "identity_unverified",
  "slug_taken",
  "quota_exceeded",
  "idempotency_mismatch",
  "tenant_transaction_failed",
  "domain_conflict",
  "membership_conflict",
  "unauthenticated",
  "membership_denied",
  "store_inactive",
  "host_store_mismatch",
  "host_not_found",
  "host_unverified",
  "ambiguous_host",
  "feature_not_enabled",
  "limit_exceeded",
] as const;

export type SaaSErrorCode = (typeof SAAS_ERROR_CODES)[number];

/**
 * Safe, serializable contract error. Unknown codes fail closed and never imply
 * success or authorization. Internal exceptions, provider responses, SQL
 * details, authentication material, and private infrastructure data are not
 * represented by this type.
 */
export interface SaaSContractError {
  schemaVersion: SaaSContractSchemaVersion;
  code: SaaSErrorCode;
  retryable: boolean;
  field?: string;
  safeMessage?: string;
  operationId?: OperationId;
}
