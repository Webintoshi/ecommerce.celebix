import type { CreateStarterTenantInput, CreateStarterTenantResult } from "@celebix/saas-contracts";
import { createCanonicalAdminOriginFromPanelOrigin, normalizeExactHttpsOrigin } from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FEATURE_ORDER = ["catalog", "orders", "customers", "content", "media", "analytics", "checkout", "custom_domains", "staff_management", "promotions", "integrations", "accounting", "marketplaces"] as const;
const LIMIT_KEYS = new Set(["products", "staff", "storageBytes", "monthlyOrders", "customDomains"]);

export interface TenantCompletionResultAuthorities {
  panelOrigin: string;
  platformDomainSuffix: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

export function normalizeTenantCompletionResultAuthorities(
  input: TenantCompletionResultAuthorities,
): TenantCompletionResultAuthorities | undefined {
  try {
    const panelOrigin = normalizeExactHttpsOrigin(input.panelOrigin);
    if (!HOST.test(input.platformDomainSuffix) || input.platformDomainSuffix !== input.platformDomainSuffix.toLowerCase()) return undefined;
    return { panelOrigin, platformDomainSuffix: input.platformDomainSuffix };
  } catch {
    return undefined;
  }
}

export function validateTenantCompletionResult(
  value: unknown,
  tenantInput: CreateStarterTenantInput,
  authorities: TenantCompletionResultAuthorities,
): value is CreateStarterTenantResult {
  if (!exactKeys(value, ["schemaVersion", "operationId", "replayed", "store", "primaryDomain", "membership", "plan", "mediaStorage", "provisioningStatus", "panelUrl", "storefrontUrl"])) return false;
  if (value.schemaVersion !== 1 || !UUID.test(String(value.operationId)) || typeof value.replayed !== "boolean" || value.provisioningStatus !== "ready") return false;
  const store = value.store;
  if (!exactKeys(store, ["id", "slug", "status"]) || !UUID.test(String(store.id)) || store.slug !== tenantInput.store.slug || store.status !== "active") return false;
  const hostname = `${tenantInput.store.slug}.${authorities.platformDomainSuffix}`;
  const domain = value.primaryDomain;
  if (!exactKeys(domain, ["schemaVersion", "hostname", "domainId", "domainType", "storeId", "storeSlug", "canonicalHostname", "status", "cacheVersion"])) return false;
  if (domain.schemaVersion !== 1 || !UUID.test(String(domain.domainId)) || domain.domainType !== "platform_subdomain" || domain.storeId !== store.id || domain.storeSlug !== store.slug || domain.hostname !== hostname || domain.canonicalHostname !== hostname || domain.status !== "active" || !Number.isSafeInteger(domain.cacheVersion) || Number(domain.cacheVersion) < 1) return false;
  const membership = value.membership;
  if (!exactKeys(membership, ["schemaVersion", "id", "principalId", "storeId", "role", "status", "createdAt", "updatedAt"])) return false;
  if (membership.schemaVersion !== 1 || !UUID.test(String(membership.id)) || !UUID.test(String(membership.principalId)) || membership.storeId !== store.id || membership.role !== "store_owner" || membership.status !== "active" || !validTimestamp(membership.createdAt) || !validTimestamp(membership.updatedAt) || membership.createdAt !== tenantInput.requestedAt || membership.updatedAt !== tenantInput.requestedAt) return false;
  const plan = value.plan;
  if (!exactKeys(plan, ["schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom"], ["validUntil"])) return false;
  if (plan.schemaVersion !== 1 || !UUID.test(String(plan.planId)) || plan.planCode !== "free_starter" || plan.version !== 1 || plan.status !== "active" || !validTimestamp(plan.validFrom) || plan.validFrom !== tenantInput.requestedAt) return false;
  if (plan.validUntil !== undefined && (!validTimestamp(plan.validUntil) || Date.parse(plan.validUntil) <= Date.parse(plan.validFrom))) return false;
  if (!Array.isArray(plan.features) || plan.features.length === 0) return false;
  let prior = -1;
  for (const feature of plan.features) {
    const ordinal = FEATURE_ORDER.indexOf(feature as typeof FEATURE_ORDER[number]);
    if (ordinal <= prior) return false;
    prior = ordinal;
  }
  if (!isObject(plan.limits) || Object.keys(plan.limits).length !== LIMIT_KEYS.size || Object.keys(plan.limits).some((key) => !LIMIT_KEYS.has(key))) return false;
  if (Object.values(plan.limits).some((limit) => !Number.isSafeInteger(limit) || Number(limit) < 0)) return false;
  const mediaStorage = value.mediaStorage;
  if (!exactKeys(mediaStorage, ["schemaVersion", "status", "version"])) return false;
  if (mediaStorage.schemaVersion !== 1 || mediaStorage.status !== "ready" || !Number.isSafeInteger(mediaStorage.version) || Number(mediaStorage.version) < 1) return false;
  let expectedPanelUrl: string;
  try { expectedPanelUrl = createCanonicalAdminOriginFromPanelOrigin(authorities.panelOrigin, tenantInput.store.slug); } catch { return false; }
  return value.panelUrl === expectedPanelUrl && value.storefrontUrl === `https://${hostname}`;
}
