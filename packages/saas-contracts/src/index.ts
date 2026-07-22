/**
 * Frozen shared SaaS contracts.
 *
 * After Atlas approval, breaking changes require a schemaVersion increment and
 * explicit integration review. Implementation agents consume these contracts
 * and must not redefine them locally.
 */
export {
  PLAN_ENTITLEMENT_STATUSES,
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  PROVISIONING_STATUSES,
  SAAS_CONTRACT_SCHEMA_VERSION,
  STORE_DOMAIN_TYPES,
  STORE_HOST_STATUSES,
  STORE_MEMBERSHIP_ROLES,
  STORE_MEMBERSHIP_STATUSES,
  STORE_STATUSES,
  getPlanLimit,
  isPlanFeatureEnabled,
  isPlanFeatureKey,
  isPlanLimitKey,
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
  PlanFeatureKey,
  PlanId,
  PlanLimitKey,
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
export { PRODUCT_STATUSES, VARIANT_STATUSES, parseProduct, parseProductVariant } from "./catalog/index.ts";
export type {
  Product,
  ProductId,
  ProductStatus,
  ProductVariant,
  ProductVariantId,
  VariantStatus,
} from "./catalog/index.ts";
export { MERCHANT_ACTIONS, isMerchantActionAllowed } from "./authorization/actions.ts";
export type { MerchantAction } from "./authorization/actions.ts";
export {
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  QUICK_ORDER_MAX_TOTAL_CENTS,
  QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
} from "./quick-orders/index.ts";
export type {
  QuickOrderAddress,
  QuickOrderLinkDetail,
  QuickOrderLinkItem,
  QuickOrderLinkListItem,
  QuickOrderLinkMutationResult,
  QuickOrderLinkStatus,
} from "./quick-orders/index.ts";
export {
  ORDER_PAYMENT_STATUSES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_SORTS,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderListItem,
} from "./orders/index.ts";
export {
  ABANDONED_CART_SORTS,
  ABANDONED_CART_STATUSES,
  parseAbandonedCartDetail,
  parseAbandonedCartListItem,
  parseAbandonedCartMutationResult,
  parseAbandonedCartSummary,
} from "./abandoned-carts/index.ts";
export {
  CUSTOMER_CONSENT_CHANNELS,
  CUSTOMER_STATUSES,
  parseCustomerDetail,
  parseCustomerListItem,
  parseCustomerMutationResult,
  parseCustomerSegment,
  parseCustomerSummary,
  parseCustomerTag,
} from "./customers/index.ts";
export type {
  CustomerAddress,
  CustomerConsent,
  CustomerConsentChannel,
  CustomerConsentStatus,
  CustomerDetail,
  CustomerListItem,
  CustomerMutationResult,
  CustomerSegment,
  CustomerSegmentRef,
  CustomerStatus,
  CustomerSummary,
  CustomerTag,
  CustomerTagRef,
} from "./customers/index.ts";
export type {
  AbandonedCartDetail,
  AbandonedCartItem,
  AbandonedCartListItem,
  AbandonedCartMutationResult,
  AbandonedCartSort,
  AbandonedCartStatus,
  AbandonedCartSummary,
} from "./abandoned-carts/index.ts";
export type {
  OrderAddress,
  OrderDashboardSummary,
  OrderDetail,
  OrderEvent,
  OrderItem,
  OrderListItem,
  OrderNote,
  OrderPaymentStatus,
  OrderSource,
  OrderSort,
  OrderStatus,
  OrderTracking,
} from "./orders/index.ts";
