import type { CreateStarterTenantResult, PlanFeatureKey } from "@celebix/saas-contracts";

import type { TenantOperationRecord } from "../types.ts";
import { createPanelStoreUrl, normalizeExactHttpsOrigin } from "../panel-origin.ts";
import { SaaSDataCorruptionError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const FEATURE_ORDER: readonly PlanFeatureKey[] = ["catalog", "orders", "customers", "content", "media", "analytics", "checkout", "custom_domains", "staff_management", "promotions", "integrations", "accounting", "marketplaces"];
const FEATURES = new Set<PlanFeatureKey>(FEATURE_ORDER);
const LIMIT_KEYS = ["products", "staff", "storageBytes", "monthlyOrders", "customDomains"] as const;

function corrupt(): never { throw new SaaSDataCorruptionError(); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) corrupt();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const object = record(value);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) corrupt();
  return object;
}
function string(value: unknown): string { if (typeof value !== "string") corrupt(); return value; }
function uuid(value: unknown): string { const result = string(value); if (!UUID.test(result)) corrupt(); return result; }
function integer(value: unknown, minimum = 0): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) corrupt(); return value as number; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") corrupt(); return value; }
function timestamp(value: unknown): string {
  const result = value instanceof Date ? value.toISOString() : string(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || new Date(result).toISOString() !== result) corrupt();
  return result;
}
function url(value: unknown): string {
  const result = string(value);
  try { if (new URL(result).protocol !== "https:") corrupt(); } catch { corrupt(); }
  return result;
}

export function parseCreateStarterTenantResult(value: unknown, approvedPanelOrigin: string): CreateStarterTenantResult {
  let panelOrigin: string;
  try { panelOrigin = normalizeExactHttpsOrigin(approvedPanelOrigin); } catch { corrupt(); }
  const root = exact(value, ["schemaVersion", "operationId", "replayed", "store", "primaryDomain", "membership", "plan", "provisioningStatus", "panelUrl", "storefrontUrl"]);
  if (root.schemaVersion !== 1 || root.replayed !== false || root.provisioningStatus !== "ready") corrupt();
  const operationId = uuid(root.operationId);
  const store = exact(root.store, ["id", "slug", "status"]);
  const storeId = uuid(store.id);
  const slug = string(store.slug);
  if (!SLUG.test(slug) || store.status !== "active") corrupt();
  const domain = exact(root.primaryDomain, ["schemaVersion", "hostname", "domainId", "domainType", "storeId", "storeSlug", "canonicalHostname", "status", "cacheVersion"]);
  const hostname = string(domain.hostname);
  if (domain.schemaVersion !== 1 || !HOST.test(hostname) || domain.canonicalHostname !== hostname || domain.storeId !== storeId || domain.storeSlug !== slug || domain.status !== "active" || !["platform_subdomain", "custom"].includes(string(domain.domainType))) corrupt();
  uuid(domain.domainId); integer(domain.cacheVersion, 1);
  const membership = exact(root.membership, ["schemaVersion", "id", "principalId", "storeId", "role", "status", "createdAt", "updatedAt"]);
  if (membership.schemaVersion !== 1 || membership.storeId !== storeId || membership.role !== "store_owner" || membership.status !== "active") corrupt();
  uuid(membership.id); uuid(membership.principalId); timestamp(membership.createdAt); timestamp(membership.updatedAt);
  const planKeys = record(root.plan).validUntil === undefined
    ? ["schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom"]
    : ["schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom", "validUntil"];
  const plan = exact(root.plan, planKeys);
  if (plan.schemaVersion !== 1 || plan.planCode !== "free_starter" || plan.version !== 1 || plan.status !== "active") corrupt();
  uuid(plan.planId); const validFrom = timestamp(plan.validFrom);
  if (plan.validUntil !== undefined && Date.parse(timestamp(plan.validUntil)) <= Date.parse(validFrom)) corrupt();
  if (!Array.isArray(plan.features) || plan.features.length === 0) corrupt();
  const seen = new Set<string>();
  let priorOrdinal = -1;
  for (const feature of plan.features) {
    if (typeof feature !== "string" || !FEATURES.has(feature as PlanFeatureKey) || seen.has(feature)) corrupt();
    const ordinal = FEATURE_ORDER.indexOf(feature as PlanFeatureKey);
    if (ordinal <= priorOrdinal) corrupt();
    priorOrdinal = ordinal; seen.add(feature);
  }
  const limits = exact(plan.limits, LIMIT_KEYS);
  for (const key of LIMIT_KEYS) integer(limits[key]);
  let expectedPanelUrl: string;
  try { expectedPanelUrl = createPanelStoreUrl(panelOrigin, slug); } catch { corrupt(); }
  if (root.panelUrl !== expectedPanelUrl) corrupt();
  const storefrontUrl = url(root.storefrontUrl);
  if (storefrontUrl !== `https://${hostname}`) corrupt();
  return structuredClone(root) as unknown as CreateStarterTenantResult;
}

export function parseTenantOperationRow(value: unknown, approvedPanelOrigin: string): TenantOperationRecord {
  const row = exact(value, ["id", "idempotency_key", "payload_fingerprint", "status", "result_payload", "created_at", "updated_at"]);
  const status = string(row.status);
  if (!["processing", "committed", "failed"].includes(status)) corrupt();
  const fingerprint = string(row.payload_fingerprint);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) corrupt();
  const result = row.result_payload === null ? undefined : parseCreateStarterTenantResult(row.result_payload, approvedPanelOrigin);
  if ((status === "committed") !== Boolean(result)) corrupt();
  const id = uuid(row.id);
  if (result && result.operationId !== id) corrupt();
  const idempotencyKey = string(row.idempotency_key);
  if (idempotencyKey !== idempotencyKey.trim() || idempotencyKey.length < 1 || idempotencyKey.length > 128) corrupt();
  return {
    id: id as TenantOperationRecord["id"],
    idempotencyKey,
    fingerprint: fingerprint as TenantOperationRecord["fingerprint"],
    status: status as TenantOperationRecord["status"],
    ...(result ? { result } : {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

export const postgresParserInternals = { uuid, timestamp, boolean, integer, record, exact };
