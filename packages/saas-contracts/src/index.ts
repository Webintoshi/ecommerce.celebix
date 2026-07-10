/**
 * Frozen shared SaaS contracts.
 *
 * After Atlas approval, breaking changes require a schemaVersion increment and
 * explicit integration review. Implementation agents consume these contracts
 * and must not redefine them locally.
 */
export {
  PLAN_ENTITLEMENT_STATUSES,
  PROVISIONING_STATUSES,
  SAAS_CONTRACT_SCHEMA_VERSION,
  STORE_DOMAIN_TYPES,
  STORE_HOST_STATUSES,
  STORE_MEMBERSHIP_ROLES,
  STORE_MEMBERSHIP_STATUSES,
  STORE_STATUSES,
  isPlanFeatureEnabled,
} from "./types.ts";

export type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  DomainId,
  MembershipId,
  OperationId,
  PlanEntitlementLimits,
  PlanEntitlementStatus,
  PlanEntitlements,
  PlanId,
  PrincipalId,
  ProvisioningStatus,
  ResolvedStoreHost,
  SaaSContractSchemaVersion,
  StoreDomainType,
  StoreHostStatus,
  StoreId,
  StoreMembership,
  StoreMembershipRole,
  StoreMembershipStatus,
  StoreStatus,
  TenantContext,
} from "./types.ts";

export { SAAS_ERROR_CODES } from "./errors.ts";
export type { SaaSContractError, SaaSErrorCode } from "./errors.ts";
