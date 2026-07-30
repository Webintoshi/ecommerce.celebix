import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  PlanEntitlements,
  PlanFeatureKey,
  PlanLimitKey,
  ResolvedStoreHost,
  SaaSContractError,
  StoreMembership,
  TenantContext,
} from "./index.ts";

type ContractModule = typeof import("./index.ts");

const contracts = await import("./index.ts").catch(() => ({} as Partial<ContractModule>));

const REQUIRED_ERROR_CODES = [
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

const REQUIRED_PLAN_FEATURE_KEYS = [
  "catalog",
  "orders",
  "customers",
  "content",
  "media",
  "analytics",
  "checkout",
  "custom_domains",
  "staff_management",
  "promotions",
  "integrations",
  "accounting",
  "marketplaces",
] as const satisfies readonly PlanFeatureKey[];

const REQUIRED_PLAN_LIMIT_KEYS = [
  "products",
  "staff",
  "storageBytes",
  "monthlyOrders",
  "customDomains",
] as const satisfies readonly PlanLimitKey[];

const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "secret",
  "databaseurl",
  "connectionstring",
  "privatekey",
  "credential",
] as const;

function collectSensitiveKeys(value: unknown, path = "root"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectSensitiveKeys(entry, `${path}[${index}]`));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const currentPath = `${path}.${key}`;
    const matches = SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part)) ? [currentPath] : [];
    return [...matches, ...collectSensitiveKeys(nestedValue, currentPath)];
  });
}

function classifyIdempotency(
  stored: { key: string; fingerprint: string } | null,
  incoming: { key: string; fingerprint: string },
) {
  if (!stored || stored.key !== incoming.key) {
    return "new" as const;
  }

  return stored.fingerprint === incoming.fingerprint ? ("replay" as const) : ("idempotency_mismatch" as const);
}

function isMembershipActive(membership: StoreMembership) {
  return membership.status === "active";
}

function canResolveActiveHost(host: ResolvedStoreHost) {
  return host.status === "active";
}

const entitlements: PlanEntitlements = {
  schemaVersion: 1,
  planId: "plan_free",
  planCode: "free_starter",
  version: 1,
  status: "active",
  features: ["catalog"],
  limits: {
    products: 100,
    staff: 1,
    storageBytes: 1_000_000_000,
  },
  validFrom: "2026-07-10T00:00:00.000Z",
};

const membership: StoreMembership = {
  schemaVersion: 1,
  id: "membership_1",
  principalId: "principal_1",
  storeId: "store_1",
  role: "store_owner",
  status: "active",
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const activeHost: ResolvedStoreHost & { status: "active" } = {
  schemaVersion: 1,
  hostname: "ornek.celebix.site",
  domainId: "domain_1",
  domainType: "platform_subdomain",
  storeId: "store_1",
  storeSlug: "ornek",
  canonicalHostname: "ornek.celebix.site",
  status: "active",
  cacheVersion: 1,
};

const starterInput: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "opaque-request-1",
  principal: {
    issuer: "https://auth.example.test/oidc",
    subject: "subject_1",
    email: "owner@example.test",
    emailVerified: true,
  },
  store: {
    name: "Ornek Magaza",
    slug: "ornek",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: {
    privacyAcceptedAt: "2026-07-10T00:00:00.000Z",
  },
  requestedAt: "2026-07-10T00:00:00.000Z",
};

if (false) {
  const unverifiedStarterInput: CreateStarterTenantInput = {
    ...starterInput,
    principal: {
      ...starterInput.principal,
      // @ts-expect-error Automatic starter creation requires a verified identity.
      emailVerified: false,
    },
  };
  void unverifiedStarterInput;
}

const starterResult: CreateStarterTenantResult = {
  schemaVersion: 1,
  operationId: "operation_1",
  replayed: false,
  store: {
    id: "store_1",
    slug: "ornek",
    status: "active",
  },
  primaryDomain: activeHost,
  membership,
  plan: entitlements,
  provisioningStatus: "ready",
  panelUrl: "https://panel.celebix.site",
  storefrontUrl: "https://ornek.celebix.site",
};

const tenantContext: TenantContext = {
  schemaVersion: 1,
  requestId: "request_1",
  principal: {
    id: "principal_1",
    issuer: "https://auth.example.test/oidc",
    subject: "subject_1",
  },
  store: {
    id: "store_1",
    slug: "ornek",
    status: "active",
  },
  membership: {
    id: "membership_1",
    role: "store_owner",
    status: "active",
  },
  entitlements,
  resolvedHost: activeHost,
  locale: "tr",
};

test("freezes the SaaS contract schema at version 1", () => {
  assert.equal(contracts.SAAS_CONTRACT_SCHEMA_VERSION, 1);
});

test("requires schemaVersion on every top-level contract", () => {
  const error: SaaSContractError = {
    schemaVersion: 1,
    code: "invalid_input",
    retryable: false,
  };

  for (const contract of [starterInput, starterResult, membership, entitlements, activeHost, tenantContext, error]) {
    assert.equal(contract.schemaVersion, 1);
  }
});

test("exports every required error code exactly once", () => {
  assert.deepEqual(contracts.SAAS_ERROR_CODES, REQUIRED_ERROR_CODES);
  assert.equal(new Set(contracts.SAAS_ERROR_CODES).size, REQUIRED_ERROR_CODES.length);
});

test("CreateStarterTenantInput contains no sensitive keys", () => {
  assert.deepEqual(collectSensitiveKeys(starterInput), []);
});

test("CreateStarterTenantInput requires a verified identity literal", () => {
  assert.equal(starterInput.principal.emailVerified, true);
});

test("CreateStarterTenantResult contains no sensitive keys", () => {
  assert.deepEqual(collectSensitiveKeys(starterResult), []);
});

test("TenantContext contains no sensitive keys", () => {
  assert.deepEqual(collectSensitiveKeys(tenantContext), []);
});

test("recursive scanner detects prohibited sensitive key families", () => {
  const unsafe = {
    password: "unsafe",
    nested: {
      accessToken: "unsafe",
      webhookSecret: "unsafe",
      databaseUrl: "unsafe",
      connectionString: "unsafe",
      privateKey: "unsafe",
    },
  };

  assert.deepEqual(collectSensitiveKeys(unsafe), [
    "root.password",
    "root.nested.accessToken",
    "root.nested.webhookSecret",
    "root.nested.databaseUrl",
    "root.nested.connectionString",
    "root.nested.privateKey",
  ]);
});

test("exports the exact finite feature registry without duplicates", () => {
  assert.deepEqual(contracts.PLAN_FEATURE_KEYS, REQUIRED_PLAN_FEATURE_KEYS);
  assert.equal(new Set(contracts.PLAN_FEATURE_KEYS).size, REQUIRED_PLAN_FEATURE_KEYS.length);
  assert.equal(contracts.isPlanFeatureKey?.("catalog"), true);
  assert.equal(contracts.isPlanFeatureKey?.("unknown-feature"), false);
});

test("enables only configured known features on active plans", () => {
  assert.equal(contracts.isPlanFeatureEnabled?.(entitlements, "catalog"), true);
  assert.equal(contracts.isPlanFeatureEnabled?.(entitlements, "orders"), false);
  assert.equal(contracts.isPlanFeatureEnabled?.(entitlements, "unknown-feature"), false);
});

test("denies unknown features injected through an unsafe runtime cast", () => {
  const unsafeEntitlements = {
    ...entitlements,
    features: ["catalog", "unknown-feature"] as unknown as PlanEntitlements["features"],
  };

  assert.equal(contracts.isPlanFeatureEnabled?.(unsafeEntitlements, "unknown-feature"), false);
});

test("denies known features on inactive and expired plans", () => {
  assert.equal(contracts.isPlanFeatureEnabled?.({ ...entitlements, status: "inactive" }, "catalog"), false);
  assert.equal(contracts.isPlanFeatureEnabled?.({ ...entitlements, status: "expired" }, "catalog"), false);
});

test("exports the exact finite limit registry without duplicates", () => {
  assert.deepEqual(contracts.PLAN_LIMIT_KEYS, REQUIRED_PLAN_LIMIT_KEYS);
  assert.equal(new Set(contracts.PLAN_LIMIT_KEYS).size, REQUIRED_PLAN_LIMIT_KEYS.length);
  assert.equal(contracts.isPlanLimitKey?.("products"), true);
  assert.equal(contracts.isPlanLimitKey?.("unknown-limit"), false);
});

test("resolves unknown, missing, and invalid limits to zero", () => {
  assert.equal(contracts.getPlanLimit?.(entitlements, "unknown-limit"), 0);
  assert.equal(contracts.getPlanLimit?.(entitlements, "monthlyOrders"), 0);
  assert.equal(contracts.getPlanLimit?.({ ...entitlements, limits: { ...entitlements.limits, products: -1 } }, "products"), 0);
  assert.equal(contracts.getPlanLimit?.({ ...entitlements, limits: { ...entitlements.limits, products: Number.NaN } }, "products"), 0);
  assert.equal(contracts.getPlanLimit?.({ ...entitlements, limits: { ...entitlements.limits, products: Number.POSITIVE_INFINITY } }, "products"), 0);
});

test("floors positive decimal limits and preserves non-negative integers", () => {
  assert.equal(contracts.getPlanLimit?.({ ...entitlements, limits: { ...entitlements.limits, products: 12.9 } }, "products"), 12);
  assert.equal(contracts.getPlanLimit?.(entitlements, "products"), 100);
  assert.equal(contracts.getPlanLimit?.({ ...entitlements, limits: { ...entitlements.limits, products: 0 } }, "products"), 0);
});

test("same idempotency key and fingerprint replays the prior operation", () => {
  const stored = { key: "opaque-request-1", fingerprint: "fingerprint-a" };
  assert.equal(classifyIdempotency(stored, stored), "replay");
});

test("same idempotency key with a different fingerprint maps to idempotency_mismatch", () => {
  const stored = { key: "opaque-request-1", fingerprint: "fingerprint-a" };
  assert.equal(
    classifyIdempotency(stored, { key: stored.key, fingerprint: "fingerprint-b" }),
    "idempotency_mismatch",
  );
});

test("revoked memberships never authorize", () => {
  assert.equal(isMembershipActive(membership), true);
  assert.equal(isMembershipActive({ ...membership, status: "revoked" }), false);
});

test("pending verification domains cannot form an active host fixture", () => {
  assert.equal(canResolveActiveHost(activeHost), true);
  assert.equal(canResolveActiveHost({ ...activeHost, status: "pending_verification" }), false);
});

test("disabled domains cannot form an active host fixture", () => {
  assert.equal(canResolveActiveHost({ ...activeHost, status: "disabled" }), false);
});

test("unknown error codes are not part of the frozen success or authorization surface", () => {
  assert.equal((contracts.SAAS_ERROR_CODES as readonly string[]).includes("unknown_error"), false);
});

test("keeps the public runtime export surface frozen", () => {
  assert.deepEqual(Object.keys(contracts).sort(), [
    "ABANDONED_CART_SORTS",
    "ABANDONED_CART_STATUSES",
    "ANALYTICS_CONNECTION_STATUSES",
    "ANALYTICS_METRIC_TYPES",
    "ANALYTICS_PERIODS",
    "ANALYTICS_RANGES",
    "BUILT_IN_PAYMENT_METHODS",
    "CATALOG_ADMIN_RESOURCE_KINDS",
    "CATALOG_IMPORT_STATUSES",
    "CATALOG_ONBOARDING_CHANNEL_KINDS",
    "CATALOG_ONBOARDING_PRODUCT_TYPES",
    "CATALOG_ONBOARDING_RESOURCE_KINDS",
    "CATALOG_ONBOARDING_UNITS",
    "CUSTOMER_CONSENT_CHANNELS",
    "CUSTOMER_STATUSES",
    "INVENTORY_COUNT_STATUSES",
    "INVENTORY_LOCATION_ARCHIVE_BLOCK_REASONS",
    "INVENTORY_MOVEMENT_KINDS",
    "INVENTORY_TRANSFER_STATUSES",
    "MERCHANT_ACTIONS",
    "MERCHANT_ADMIN_EVENT_KINDS",
    "MERCHANT_ADMIN_PROVIDER_ACTIONS",
    "MERCHANT_ADMIN_PROVIDER_JOB_STATUSES",
    "MERCHANT_ADMIN_PROVIDER_RECORD_KINDS",
    "MERCHANT_ADMIN_RECORD_KINDS",
    "MERCHANT_PROVIDER_CAPABILITIES",
    "MERCHANT_PROVIDER_PROFILE_STATUSES",
    "ORDER_PAYMENT_STATUSES",
    "ORDER_SORTS",
    "ORDER_SOURCES",
    "ORDER_STATUSES",
    "PAYMENT_METHOD_KINDS",
    "PAYMENT_METHOD_STATES",
    "PAYMENT_PROVIDER_INTERACTION_MODES",
    "PAYMENT_PROVIDER_READINESS",
    "PLAN_ENTITLEMENT_STATUSES",
    "PLAN_FEATURE_KEYS",
    "PLAN_LIMIT_KEYS",
    "PRICE_CHANNELS",
    "PRICE_LIST_STATUSES",
    "PRICE_SOURCE_KINDS",
    "PRODUCT_REVIEW_STATUSES",
    "PRODUCT_STATUSES",
    "PROVISIONING_STATUSES",
    "PURCHASE_ORDER_STATUSES",
    "QUICK_ORDER_EXPIRY_HOURS",
    "QUICK_ORDER_LINK_STATUSES",
    "QUICK_ORDER_MAX_COMPONENT_CENTS",
    "QUICK_ORDER_MAX_TOTAL_CENTS",
    "QUICK_ORDER_MAX_UNIT_PRICE_CENTS",
    "SAAS_CONTRACT_SCHEMA_VERSION",
    "SAAS_ERROR_CODES",
    "STOREFRONT_ASSET_KINDS",
    "STOREFRONT_ASSET_STATUSES",
    "STORE_DOMAIN_TYPES",
    "STORE_HOST_STATUSES",
    "STORE_MEMBERSHIP_ROLES",
    "STORE_MEMBERSHIP_STATUSES",
    "STORE_STATUSES",
    "VARIANT_STATUSES",
    "buildDefaultStarterPresentation",
    "getPlanLimit",
    "isBuiltInPaymentMethodKind",
    "isMerchantActionAllowed",
    "isPlanFeatureEnabled",
    "isPlanFeatureKey",
    "isPlanLimitKey",
    "normalizeTurkishIbanInput",
    "parseAbandonedCartDetail",
    "parseAbandonedCartListItem",
    "parseAbandonedCartMutationResult",
    "parseAbandonedCartSummary",
    "parseAnalyticsConnectionMutationResult",
    "parseAnalyticsConnectionView",
    "parseAnalyticsDashboard",
    "parseAnalyticsMetricResult",
    "parseAnalyticsSummary",
    "parseBarcodeLabelRows",
    "parseBuiltInPaymentMethodConfig",
    "parseCatalogAdminImportJob",
    "parseCatalogAdminMutationResult",
    "parseCatalogAdminResource",
    "parseCatalogCategory",
    "parseCatalogCategoryFields",
    "parseCatalogCategoryList",
    "parseCatalogCategoryMutationResult",
    "parseCatalogImportPreview",
    "parseCatalogOnboardingIntent",
    "parseCatalogOnboardingOptions",
    "parseCatalogOnboardingResult",
    "parseCatalogProductEditorProjection",
    "parseCheckoutAddress",
    "parseCheckoutDeliveryInput",
    "parseCheckoutHttpError",
    "parseCheckoutHttpErrorResponse",
    "parseCheckoutPaymentMethod",
    "parseCheckoutPolicy",
    "parseCheckoutQuote",
    "parseCheckoutStatus",
    "parseCheckoutSubmissionResult",
    "parseCheckoutSubmitInput",
    "parseCheckoutSubmitSuccess",
    "parseCustomerDetail",
    "parseCustomerListItem",
    "parseCustomerMutationResult",
    "parseCustomerSegment",
    "parseCustomerSummary",
    "parseCustomerTag",
    "parseEffectivePrice",
    "parseInventoryBalance",
    "parseInventoryCount",
    "parseInventoryCountLine",
    "parseInventoryLocation",
    "parseInventoryLocationArchiveInput",
    "parseInventoryLocationMutationResult",
    "parseInventoryLocationSaveInput",
    "parseInventoryMovement",
    "parseInventoryMutationResult",
    "parseInventoryTransfer",
    "parseInventoryTransferLine",
    "parseMerchantAdminConfig",
    "parseMerchantAdminEvent",
    "parseMerchantAdminMutationResult",
    "parseMerchantAdminProviderJob",
    "parseMerchantAdminProviderJobMutationResult",
    "parseMerchantAdminRecord",
    "parseMerchantPaymentMethod",
    "parseMerchantProviderDescriptor",
    "parseMerchantProviderProfile",
    "parseOrderDashboardSummary",
    "parseOrderDetail",
    "parseOrderListItem",
    "parsePaymentMethodMutationResult",
    "parsePaymentMethodReorderResult",
    "parsePaymentProviderCatalog",
    "parsePaymentProviderCatalogEntry",
    "parsePriceList",
    "parsePriceListItem",
    "parsePriceListRule",
    "parsePricingPreviewEntry",
    "parsePricingPreviewRequest",
    "parsePricingPreviewResult",
    "parseProduct",
    "parseProductReview",
    "parseProductVariant",
    "parsePublicProduct",
    "parsePublicProductMedia",
    "parsePublicProductVariant",
    "parsePublicStorefront",
    "parsePurchaseOrder",
    "parsePurchaseOrderLine",
    "parseQuickOrderLinkDetail",
    "parseQuickOrderLinkListItem",
    "parseQuickOrderLinkMutationResult",
    "parseStorefrontAsset",
    "starterThemeTokens",
  ]);
});

test("contract sources import no runtime application code", async () => {
  const sourceFiles = [
    "index.ts",
    "types.ts",
    "errors.ts",
    "catalog/index.ts",
    "catalog/types.ts",
    "catalog/validation.ts",
    "catalog-onboarding/index.ts",
    "catalog-onboarding/types.ts",
    "catalog-onboarding/validation.ts",
    "catalog-admin/index.ts",
    "catalog-admin/barcode-labels.ts",
    "catalog-admin/types.ts",
    "catalog-admin/validation.ts",
    "merchant-admin/index.ts",
    "merchant-admin/types.ts",
    "merchant-admin/validation.ts",
    "payment-providers/index.ts",
    "payment-providers/types.ts",
    "payment-providers/validation.ts",
    "authorization/actions.ts",
    "inventory/index.ts",
    "inventory/types.ts",
    "inventory/validation.ts",
    "pricing/index.ts",
    "pricing/types.ts",
    "pricing/validation.ts",
    "analytics/index.ts",
    "analytics/types.ts",
    "analytics/validation.ts",
    "abandoned-carts/index.ts",
    "abandoned-carts/types.ts",
    "abandoned-carts/validation.ts",
    "analytics/index.ts",
    "analytics/types.ts",
    "analytics/validation.ts",
    "customers/index.ts",
    "customers/types.ts",
    "customers/validation.ts",
    "orders/index.ts",
    "orders/types.ts",
    "orders/validation.ts",
    "quick-orders/index.ts",
    "quick-orders/types.ts",
    "quick-orders/validation.ts",
    "checkout/index.ts",
    "checkout/types.ts",
    "checkout/validation.ts",
  ];
  const sources = await Promise.all(sourceFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8")));

  for (const source of sources) {
    assert.doesNotMatch(source, /from\s+["'](?:@\/|\.\.\/\.\.\/apps\/|apps\/)/);
  }
});
