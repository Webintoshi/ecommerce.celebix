import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import type { OwnerAuthContext, OwnerProfile } from "@/lib/owner-auth";
import {
  getStoreSupabaseSecret,
  getStoreSupabaseSecretByStoreId,
  upsertStoreSupabaseSecret
} from "@/lib/store-secrets";
import {
  getRepoRoot,
  getStoreConfig,
  getStores,
  repairTrackedStoreConfigs,
  type StoreConfig,
  type DatabaseMode,
  type StorefrontStatus
} from "@celebix/platform-config";
import type {
  StorefrontDeploymentStatus,
  StorefrontRepoSyncStatus,
} from "../../../packages/platform-config/src/index";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import {
  createDefaultProvisioningSteps,
  listCleanupRuns,
  listUnresolvedCleanupSlugs,
  readDomainMigrationSummary,
  readProvisioningSummary,
  type CleanupRunSummary,
  type DomainMigrationSummary as LifecycleDomainMigrationSummary,
  type ProvisioningState,
  type ProvisioningStepSummary,
} from "@/lib/store-lifecycle";

type OwnerStoreStatus = "draft" | "active" | "paused";
type StoreLifecycleStage = "onboarding" | "building" | "launch_ready" | "live" | "growth";
type StorePriority = "normal" | "high" | "critical";
type BillingStatus = "healthy" | "follow_up" | "hold";
type StoreSubscriptionStatus = "unconfigured" | "active" | "expiring" | "expired";
type HealthLabel = "kritik" | "kurulum" | "operasyonel" | "hazir";
const STORE_SETUP_REVENUE = 19000;
const STORE_SUBSCRIPTION_EXPIRING_THRESHOLD_DAYS = 14;
const OWNER_SUMMARY_CACHE_TTL_MS = readPositiveIntegerEnv("OWNER_SUMMARY_CACHE_TTL_MS", 30_000);
const OWNER_METRICS_BACKGROUND_SYNC_INTERVAL_MS = readPositiveIntegerEnv(
  "OWNER_METRICS_BACKGROUND_SYNC_INTERVAL_MS",
  300_000
);

interface OwnerStoreRow {
  id: string;
  slug: string;
  name: string;
  status: OwnerStoreStatus;
  theme_key: string;
  theme_label: string | null;
  storefront_domain: string;
  admin_domain: string;
  support_email: string | null;
  support_phone: string | null;
  tagline: string | null;
  supabase_project_ref: string | null;
  supabase_url: string | null;
  r2_bucket_name: string | null;
  r2_public_url: string | null;
  r2_managed_domain: string | null;
  storefront_app_dir: string | null;
  storefront_status: StorefrontStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface OwnerStoreAuthorityFields {
  metadata: Record<string, unknown> | null;
  supabase_url: string | null;
  r2_bucket_name: string | null;
  r2_public_url: string | null;
  r2_managed_domain: string | null;
  storefront_app_dir: string | null;
  storefront_status: StorefrontStatus;
}

interface OwnerMetricRow {
  store_id: string;
  product_count: number;
  order_count: number;
  customer_count: number;
  pending_order_count: number;
  total_revenue: number;
  average_order_value: number;
  last_synced_at: string;
}

interface OwnerStoreAccessRow {
  id: string;
  profile_id: string;
  store_id: string;
  commission_rate: number;
  created_at: string;
}

type StoreAdminRole = "super_admin" | "product_manager" | "content_creator" | "order_manager";

interface StoreAdminProfileRow {
  id: string;
  full_name: string | null;
  role: StoreAdminRole;
  task_definition: string | null;
  created_at: string;
}

interface OwnerAuditLogRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface StoreMetricsSnapshot {
  productCount: number;
  orderCount: number;
  customerCount: number;
  pendingOrderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  lastSyncedAt: string;
}

interface AccessibleStoreData {
  stores: OwnerStoreRow[];
  metricsMap: Map<string, OwnerMetricRow>;
  accessRows: OwnerStoreAccessRow[];
  commissionMap: Map<string, number | null>;
  affiliateRateMap: Map<string, number>;
  affiliateCountMap: Map<string, number>;
}

interface StoreConnectionReadiness {
  secretCoverage: boolean;
  secretAuthorityReady: boolean;
  legacyAuthConfigured: boolean;
  envAdminDomain: string | null;
  envAdminUrl: string | null;
  envStoreDomain: string | null;
  envStorefrontUrl: string | null;
  envSupabaseUrl: string | null;
  hasEnvAnonKey: boolean;
  hasEnvServiceRoleKey: boolean;
  secretSupabaseUrl: string | null;
  hasSecretAnonKey: boolean;
  hasSecretServiceRoleKey: boolean;
  secretLegacyUrl: string | null;
  hasSecretLegacyAnonKey: boolean;
}

interface AdminRuntimeSnapshot {
  slug: string | null;
  storefrontDomain: string | null;
  adminDomain: string | null;
  storefrontUrl: string | null;
  adminUrl: string | null;
}

interface AdminControlPlaneSnapshot {
  slug: string | null;
  storefrontDomain: string | null;
  adminDomain: string | null;
  metrics: StoreMetricsSnapshot | null;
  storeAdmins: StoreAdminSummary[];
}

interface AdminRuntimeHealth {
  adminDeploymentReady: boolean;
  adminRuntimeConsistent: boolean;
  adminRuntimeMessage: string | null;
  adminRuntimeUrl: string | null;
}

interface StoreFinalReadinessSummary {
  adminRuntimeOk: boolean | null;
  storefrontRuntimeOk: boolean | null;
  homepageOk: boolean | null;
  categoriesOk: boolean | null;
  productsOk: boolean | null;
  starterSeedOk: boolean | null;
  settingsOk: boolean | null;
  blogPostsOk: boolean | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

type DashboardStoreBuildMode = "summary" | "detail";

interface CachedValue<T> {
  expiresAt: number;
  value: T;
}

const dashboardStoreSummaryCache = new Map<string, CachedValue<DashboardStoreSummary[]>>();
let ownerStoreMetricsSyncPromise: Promise<void> | null = null;
let ownerStoreMetricsLastStartedAt = 0;

export interface StoreManagementProfile {
  clientCompanyName: string | null;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  internalOwner: string | null;
  lifecycleStage: StoreLifecycleStage;
  priority: StorePriority;
  nextAction: string | null;
  launchTarget: string | null;
  ownerNotes: string | null;
  billingStatus: BillingStatus;
  subscription: StoreSubscriptionSummary;
}

export interface StoreSubscriptionSummary {
  isConfigured: boolean;
  startDate: string | null;
  durationMonths: number | null;
  endDate: string | null;
  totalDays: number | null;
  elapsedDays: number | null;
  daysRemaining: number | null;
  progressPercent: number | null;
  cadenceLabel: string;
  countdownLabel: string;
  status: StoreSubscriptionStatus;
}

export interface StoreHealthSummary {
  supabaseReady: boolean;
  r2Ready: boolean;
  storefrontReady: boolean;
  storefrontRuntimeConsistent: boolean;
  storefrontDataReady: boolean;
  homepageOk: boolean;
  categoriesOk: boolean;
  productsOk: boolean;
  starterSeedReady: boolean;
  settingsOk: boolean;
  blogPostsOk: boolean;
  storefrontDataMessage: string | null;
  adminCoverage: boolean;
  secretCoverage: boolean;
  secretAuthorityReady: boolean;
  legacyAuthConfigured: boolean;
  adminDeploymentReady: boolean;
  adminRuntimeConsistent: boolean;
  adminRuntimeMessage: string | null;
  adminRuntimeUrl: string | null;
  metricsFreshnessMinutes: number | null;
  score: number;
  label: HealthLabel;
}

export interface StoreConsistencyIssue {
  code:
    | "missing_store_config"
    | "owner_domain_mismatch"
    | "owner_supabase_mismatch"
    | "secret_supabase_mismatch"
    | "admin_env_missing"
    | "admin_env_domain_mismatch"
    | "admin_env_supabase_mismatch"
    | "admin_runtime_unreachable"
    | "admin_runtime_drift";
  severity: "warning" | "blocking";
  source: "store_config" | "owner_store" | "owner_secret" | "admin_env" | "admin_runtime";
  message: string;
}

export interface StoreConsistencySummary {
  blocking: boolean;
  issueCount: number;
  blockingIssueCount: number;
  issues: StoreConsistencyIssue[];
  checkedAt: string;
}

export interface StoreProvisioningSummary {
  state: ProvisioningState;
  lastError: string | null;
  lastRunAt: string | null;
  failedStepCount: number;
  blockingStepCount: number;
  pendingStepCount: number;
  steps: ProvisioningStepSummary[];
}

export interface StoreDomainMigrationSummary extends LifecycleDomainMigrationSummary {
  hasHistory: boolean;
}

export interface CleanupRunOverview {
  id: string;
  slug: string;
  storeName: string;
  status: CleanupRunSummary["status"];
  authorityDeletedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  orphanedTargetCount: number;
  targets: CleanupRunSummary["targets"];
}

export interface DashboardStoreSummary {
  id: string;
  slug: string;
  name: string;
  status: OwnerStoreStatus;
  themeKey: string;
  themeLabel: string;
  storefrontDomain: string;
  adminDomain: string;
  storefrontAppDir: string | null;
  storefrontStatus: StorefrontStatus;
  productCount: number;
  orderCount: number;
  customerCount: number;
  pendingOrderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  lastSyncedAt: string | null;
  supabaseDashboardUrl: string | null;
  commissionRate: number | null;
  totalAffiliateRate: number;
  affiliateCount: number;
  storeAdminCount: number;
  management: StoreManagementProfile;
  health: StoreHealthSummary;
  consistency: StoreConsistencySummary;
  provisioning: StoreProvisioningSummary;
  domainMigration: StoreDomainMigrationSummary;
}

export interface AffiliateSummary {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  assignments: Array<{
    storeId: string;
    storeName: string;
    storeSlug: string;
    commissionRate: number;
  }>;
}

export interface AuditLogSummary {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  actorName: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface StoreAdminSummary {
  id: string;
  email: string;
  fullName: string | null;
  role: StoreAdminRole;
  taskDefinition: string | null;
  createdAt: string | null;
}

export interface StoreDetailSummary extends DashboardStoreSummary {
  supportEmail: string | null;
  supportPhone: string | null;
  tagline: string | null;
  supabaseProjectRef: string | null;
  supabaseUrl: string | null;
  supabaseDashboardUrl: string | null;
  r2BucketName: string | null;
  r2PublicUrl: string | null;
  r2ManagedDomain: string | null;
  bootstrap: Record<string, unknown> | null;
  storefront: Record<string, unknown> | null;
  features: string[];
  createdAt: string;
  updatedAt: string;
  affiliateAssignments: Array<{
    profileId: string;
    email: string;
    fullName: string | null;
    commissionRate: number;
  }>;
  storeAdmins: StoreAdminSummary[];
  recentActivity: AuditLogSummary[];
}

export interface OwnerDashboardSummary {
  totals: {
    setupRevenue: number;
    revenue: number;
    orders: number;
    customers: number;
    activeStores: number;
    draftStores: number;
    pendingOrders: number;
    liveStorefronts: number;
    affiliateExposure: number;
  };
  spotlightStores: DashboardStoreSummary[];
  attentionStores: DashboardStoreSummary[];
  orphanedCleanupRuns: number;
  cleanupRuns: CleanupRunOverview[];
  recentActivity: AuditLogSummary[];
  stores: DashboardStoreSummary[];
}

export interface ClientAccountSummary {
  id: string;
  slug: string;
  storeName: string;
  storefrontDomain: string;
  status: OwnerStoreStatus;
  clientCompanyName: string;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  internalOwner: string | null;
  lifecycleStage: StoreLifecycleStage;
  priority: StorePriority;
  nextAction: string | null;
  totalRevenue: number;
  orderCount: number;
  storeAdminCount: number;
  affiliateCount: number;
  billingStatus: BillingStatus;
  health: StoreHealthSummary;
}

export interface FinanceStoreSummary {
  id: string;
  slug: string;
  name: string;
  status: OwnerStoreStatus;
  setupRevenue: number;
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  estimatedAffiliateExposure: number;
  affiliateCount: number;
  totalAffiliateRate: number;
  commissionRate: number | null;
  billingStatus: BillingStatus;
}

export interface FinanceSummary {
  totals: {
    setupRevenue: number;
    revenue: number;
    orders: number;
    averageOrderValue: number;
    affiliateExposure: number;
    pendingOrders: number;
  };
  rows: FinanceStoreSummary[];
}

export interface OperationsStoreSummary {
  id: string;
  slug: string;
  name: string;
  status: OwnerStoreStatus;
  storefrontStatus: StorefrontStatus;
  storefrontDomain: string;
  adminDomain: string;
  health: StoreHealthSummary;
  consistency: StoreConsistencySummary;
  pendingOrderCount: number;
  lastSyncedAt: string | null;
  supabaseProjectRef: string | null;
  r2BucketName: string | null;
  provisioning: StoreProvisioningSummary;
}

export interface OperationsSummary {
  totals: {
    readyStores: number;
    missingSupabase: number;
    missingR2: number;
    missingAdmins: number;
    secretDrift: number;
    adminRuntimeIssues: number;
    consistencyBlockingStores: number;
    pendingStorefronts: number;
    orphanedCleanupRuns: number;
  };
  rows: OperationsStoreSummary[];
  cleanupRuns: CleanupRunOverview[];
  recentActivity: AuditLogSummary[];
}

export interface StoreManagementUpdateInput {
  status?: OwnerStoreStatus;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  clientCompanyName?: string;
  clientContactName?: string;
  clientContactEmail?: string;
  clientContactPhone?: string;
  internalOwner?: string;
  lifecycleStage?: StoreLifecycleStage;
  priority?: StorePriority;
  nextAction?: string;
  launchTarget?: string;
  ownerNotes?: string;
  billingStatus?: BillingStatus;
  packageStartDate?: string;
  packageDurationMonths?: number | null;
}

const DEFAULT_SUBSCRIPTION: StoreSubscriptionSummary = {
  isConfigured: false,
  startDate: null,
  durationMonths: null,
  endDate: null,
  totalDays: null,
  elapsedDays: null,
  daysRemaining: null,
  progressPercent: null,
  cadenceLabel: "Paket tanimsiz",
  countdownLabel: "Takip baslatilmadi",
  status: "unconfigured"
};

const DEFAULT_MANAGEMENT: StoreManagementProfile = {
  clientCompanyName: null,
  clientContactName: null,
  clientContactEmail: null,
  clientContactPhone: null,
  internalOwner: null,
  lifecycleStage: "onboarding",
  priority: "normal",
  nextAction: null,
  launchTarget: null,
  ownerNotes: null,
  billingStatus: "healthy",
  subscription: DEFAULT_SUBSCRIPTION
};

async function getAuthoritativeStoreConfig(slug: string): Promise<StoreConfig | null> {
  const existing = getStoreConfig(slug);

  if (existing) {
    return existing;
  }

  return ensureStoreConfigFromOwnerAuthority(slug).catch(() => null);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function readFromCache<T>(cache: Map<string, CachedValue<T>>, key: string): T | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeToCache<T>(cache: Map<string, CachedValue<T>>, key: string, value: T, ttlMs: number): T {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

function clearDashboardStoreSummaryCaches(): void {
  dashboardStoreSummaryCache.clear();
}

function getDashboardStoreSummaryCacheKey(context: OwnerAuthContext, mode: DashboardStoreBuildMode): string {
  return `${mode}:${context.profile.role}:${context.user.id}`;
}

function resolveStoreEnvPath(store: StoreConfig): string {
  const repoRoot = getRepoRoot();
  const configured = store.bootstrap?.adminEnvLocalPath;

  if (configured) {
    return path.join(repoRoot, configured);
  }

  return path.join(repoRoot, "stores", store.slug, "admin.env.local");
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, line) => {
      const separatorIndex = line.indexOf("=");

      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (key) {
        accumulator[key] = value;
      }

      return accumulator;
    }, {});
}

function hasExpandedSecretFields(secret: Awaited<ReturnType<typeof getStoreSupabaseSecret>>): boolean {
  return Boolean(secret?.supabase_url && secret?.supabase_service_role_key);
}

function hasLegacyAuthFields(secret: Awaited<ReturnType<typeof getStoreSupabaseSecret>>): boolean {
  return Boolean(secret?.supabase_legacy_url && secret?.supabase_legacy_anon_key);
}

function getEmptyConnectionReadiness(): StoreConnectionReadiness {
  return {
    secretCoverage: false,
    secretAuthorityReady: false,
    legacyAuthConfigured: false,
    envAdminDomain: null,
    envAdminUrl: null,
    envStoreDomain: null,
    envStorefrontUrl: null,
    envSupabaseUrl: null,
    hasEnvAnonKey: false,
    hasEnvServiceRoleKey: false,
    secretSupabaseUrl: null,
    hasSecretAnonKey: false,
    hasSecretServiceRoleKey: false,
    secretLegacyUrl: null,
    hasSecretLegacyAnonKey: false
  };
}

async function readStoreConnectionReadiness(store: StoreConfig, ownerStoreId?: string): Promise<StoreConnectionReadiness> {
  const envMap = parseEnvFile(resolveStoreEnvPath(store));
  const secretRecord = ownerStoreId
    ? await getStoreSupabaseSecretByStoreId(ownerStoreId)
    : await getStoreSupabaseSecret(store.slug);
  const configuredStoreUrl = store.supabase.url !== "configure-in-env" ? store.supabase.url : null;
  const normalizedConfiguredStoreUrl = normalizeComparableUrl(configuredStoreUrl);
  const normalizedSecretStoreUrl = normalizeComparableUrl(secretRecord?.supabase_url ?? null);
  const normalizedEnvStoreUrl = normalizeComparableUrl(envMap.NEXT_PUBLIC_SUPABASE_URL ?? null);
  const envLooksAuthoritative =
    Boolean(envMap.NEXT_PUBLIC_SUPABASE_URL && envMap.SUPABASE_SERVICE_ROLE_KEY) &&
    (!normalizedConfiguredStoreUrl || normalizedConfiguredStoreUrl === normalizedEnvStoreUrl) &&
    (!normalizedSecretStoreUrl || normalizedSecretStoreUrl === normalizedEnvStoreUrl);
  const secretAuthorityReady = hasExpandedSecretFields(secretRecord);
  const secretCoverage = Boolean(
    (secretRecord?.supabase_url || configuredStoreUrl || (envLooksAuthoritative ? envMap.NEXT_PUBLIC_SUPABASE_URL : null)) &&
      (secretRecord?.supabase_service_role_key || (envLooksAuthoritative ? envMap.SUPABASE_SERVICE_ROLE_KEY : null))
  );
  const legacyAuthConfigured = Boolean(
    hasLegacyAuthFields(secretRecord) ||
      (envLooksAuthoritative && envMap.SUPABASE_LEGACY_URL && envMap.SUPABASE_LEGACY_ANON_KEY)
  );

  const shouldBackfillExpandedSecret =
    envLooksAuthoritative &&
    Boolean(envMap.NEXT_PUBLIC_SUPABASE_URL && envMap.SUPABASE_SERVICE_ROLE_KEY && envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    !Boolean(secretRecord?.supabase_anon_key?.trim());

  if (shouldBackfillExpandedSecret) {
    await upsertStoreSupabaseSecret({
      slug: store.slug,
      supabaseUrl: envMap.NEXT_PUBLIC_SUPABASE_URL,
      supabaseServiceRoleKey: envMap.SUPABASE_SERVICE_ROLE_KEY,
      supabaseAnonKey: envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseLegacyUrl: envMap.SUPABASE_LEGACY_URL ?? null,
      supabaseLegacyAnonKey: envMap.SUPABASE_LEGACY_ANON_KEY ?? null
    }).catch(() => undefined);
  }

  return {
    secretCoverage,
    secretAuthorityReady,
    legacyAuthConfigured,
    envAdminDomain: envLooksAuthoritative ? envMap.NEXT_PUBLIC_ADMIN_DOMAIN?.trim() || null : null,
    envAdminUrl: envLooksAuthoritative ? envMap.NEXT_PUBLIC_ADMIN_URL?.trim() || null : null,
    envStoreDomain: envLooksAuthoritative ? envMap.NEXT_PUBLIC_STORE_DOMAIN?.trim() || null : null,
    envStorefrontUrl: envLooksAuthoritative ? envMap.NEXT_PUBLIC_SITE_URL?.trim() || null : null,
    envSupabaseUrl: envLooksAuthoritative ? envMap.NEXT_PUBLIC_SUPABASE_URL?.trim() || null : null,
    hasEnvAnonKey: envLooksAuthoritative && Boolean(envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
    hasEnvServiceRoleKey: envLooksAuthoritative && Boolean(envMap.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    secretSupabaseUrl: secretRecord?.supabase_url?.trim() || null,
    hasSecretAnonKey: Boolean(secretRecord?.supabase_anon_key?.trim() || (envLooksAuthoritative ? envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() : null)),
    hasSecretServiceRoleKey: Boolean(secretRecord?.supabase_service_role_key?.trim()),
    secretLegacyUrl: secretRecord?.supabase_legacy_url?.trim() || null,
    hasSecretLegacyAnonKey: Boolean(secretRecord?.supabase_legacy_anon_key?.trim())
  };
}

function toAbsoluteUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function normalizeDomainInput(value: string | null | undefined): string | null {
  const trimmed = readOptionalString(value);

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(toAbsoluteUrl(trimmed)).hostname.toLocaleLowerCase("tr");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLocaleLowerCase("tr");
  }
}

function resolveRuntimeDomain(
  domainValue: string | null | undefined,
  urlValue: string | null | undefined,
): string | null {
  const domain = normalizeDomainInput(domainValue);
  const urlDomain = normalizeDomainInput(urlValue);

  if (
    domain &&
    !domain.includes("localhost") &&
    !domain.endsWith(".local")
  ) {
    return domain;
  }

  return urlDomain ?? domain;
}

async function readAdminRuntimeHealth(store: OwnerStoreRow): Promise<AdminRuntimeHealth> {
  const adminRuntimeUrl = toAbsoluteUrl(store.admin_domain);

  try {
    const response = await fetch(`${adminRuntimeUrl.replace(/\/+$/, "")}/api/public/runtime`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return {
        adminDeploymentReady: false,
        adminRuntimeConsistent: false,
        adminRuntimeMessage: `Admin runtime okunamadi (${response.status})`,
        adminRuntimeUrl
      };
    }

    const payload = (await response.json()) as Partial<AdminRuntimeSnapshot>;
    const expectedSlug = store.slug;
    const expectedStorefrontDomain = normalizeDomainInput(store.storefront_domain);
    const expectedAdminDomain = normalizeDomainInput(store.admin_domain);
    const runtimeStorefrontDomain = resolveRuntimeDomain(payload.storefrontDomain, payload.storefrontUrl);
    const runtimeAdminDomain = resolveRuntimeDomain(payload.adminDomain, payload.adminUrl);
    const mismatches: string[] = [];

    if (payload.slug && payload.slug !== expectedSlug) {
      mismatches.push(`slug ${payload.slug}`);
    }

    if (runtimeStorefrontDomain && expectedStorefrontDomain && runtimeStorefrontDomain !== expectedStorefrontDomain) {
      mismatches.push(`storefront ${runtimeStorefrontDomain}`);
    }

    if (runtimeAdminDomain && expectedAdminDomain && runtimeAdminDomain !== expectedAdminDomain) {
      mismatches.push(`admin ${runtimeAdminDomain}`);
    }

    return {
      adminDeploymentReady: true,
      adminRuntimeConsistent: mismatches.length === 0,
      adminRuntimeMessage: mismatches.length > 0 ? `Runtime drift: ${mismatches.join(" / ")}` : null,
      adminRuntimeUrl
    };
  } catch (error) {
    return {
      adminDeploymentReady: false,
      adminRuntimeConsistent: false,
      adminRuntimeMessage: error instanceof Error ? error.message : "Admin runtime erisilemiyor.",
      adminRuntimeUrl
    };
  }
}

function deriveStoredAdminRuntimeHealth(store: OwnerStoreRow): AdminRuntimeHealth {
  const bootstrap = asRecord(store.metadata?.bootstrap);
  const adminRuntimeUrl = toAbsoluteUrl(store.admin_domain);
  const deploymentStatus = readOptionalString(bootstrap.adminDeploymentStatus);
  const deploymentReady = deploymentStatus === "configured";

  return {
    adminDeploymentReady: deploymentReady,
    adminRuntimeConsistent: deploymentReady,
    adminRuntimeMessage:
      deploymentReady
        ? null
        : readOptionalString(bootstrap.adminDeploymentLastError) || "Admin runtime henuz canli olarak dogrulanmadi.",
    adminRuntimeUrl
  };
}

async function readAdminControlPlaneSnapshot(
  store: OwnerStoreRow,
  ownerStoreId: string
): Promise<AdminControlPlaneSnapshot | null> {
  const secretRecord = await getStoreSupabaseSecretByStoreId(ownerStoreId);
  const serviceRoleKey = secretRecord?.supabase_service_role_key?.trim();

  if (!serviceRoleKey) {
    return null;
  }

  const adminRuntimeUrl = toAbsoluteUrl(store.admin_domain);

  try {
    const response = await fetch(`${adminRuntimeUrl.replace(/\/+$/, "")}/api/public/control-plane-snapshot`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: {
        "x-celebix-store-service-key": serviceRoleKey
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Partial<AdminControlPlaneSnapshot>;

    return {
      slug: payload.slug ?? null,
      storefrontDomain: payload.storefrontDomain ?? null,
      adminDomain: payload.adminDomain ?? null,
      metrics: payload.metrics ?? null,
      storeAdmins: Array.isArray(payload.storeAdmins) ? payload.storeAdmins : []
    };
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildProvisioningSummary(metadata: Record<string, unknown> | null | undefined): StoreProvisioningSummary {
  const rawProvisioning = readProvisioningSummary(metadata);
  const hasLifecycleHistory =
    Boolean(rawProvisioning.lastRunAt || rawProvisioning.lastError) ||
    rawProvisioning.steps.some(
      (step) => step.status !== "pending" || step.message || step.updatedAt,
    );
  const steps = hasLifecycleHistory ? rawProvisioning.steps : [];
  const failedSteps = steps.filter((step) => step.status === "failed");
  const blockingSteps = failedSteps.filter((step) => step.blocking);
  const pendingSteps = steps.filter(
    (step) => step.status === "pending" || step.status === "running",
  );

  return {
    state: rawProvisioning.state,
    lastError: rawProvisioning.lastError,
    lastRunAt: rawProvisioning.lastRunAt,
    failedStepCount: failedSteps.length,
    blockingStepCount: blockingSteps.length,
    pendingStepCount: pendingSteps.length,
    steps,
  };
}

function upsertProvisioningDisplayStep(
  steps: ProvisioningStepSummary[],
  key: ProvisioningStepSummary["key"],
  patch: Partial<ProvisioningStepSummary>,
): ProvisioningStepSummary[] {
  return steps.map((step) =>
    step.key === key
      ? {
          ...step,
          ...patch,
        }
      : step,
  );
}

function normalizeProvisioningSummaryForDisplay(
  summary: StoreProvisioningSummary,
  input: {
    health: StoreHealthSummary;
    storefrontStatus: StorefrontStatus;
    storefrontAppDir: string | null;
    storefrontDeploymentStatus: string | null;
    storefrontRepoSyncStatus: string | null;
    metrics: {
      productCount: number;
      orderCount: number;
      customerCount: number;
    };
  },
): StoreProvisioningSummary {
  const hasStorefrontBlueprint =
    input.storefrontDeploymentStatus === "prepared" || input.storefrontDeploymentStatus === "configured";
  const hasStorefrontRepoSync =
    input.storefrontRepoSyncStatus === "synced" ||
    (input.storefrontStatus === "active" && Boolean(input.storefrontAppDir?.trim()));
  const starterSeedReady =
    input.health.starterSeedReady ||
    input.metrics.productCount > 0 ||
    input.metrics.orderCount > 0 ||
    input.metrics.customerCount > 0;
  const fullyLiveReady = isStoreFullyReady(input.health);

  let nextSteps = summary.steps.length > 0 ? [...summary.steps] : createDefaultProvisioningSteps();

  const markCompleted = (key: ProvisioningStepSummary["key"], message: string) => {
    nextSteps = upsertProvisioningDisplayStep(nextSteps, key, {
      status: "completed",
      blocking: false,
      message,
    });
  };

  if (fullyLiveReady) {
    const foundationalKeys: ProvisioningStepSummary["key"][] = [
      "owner_supabase_auth",
      "cleanup_guard",
      "deployment_branch_preflight",
      "supabase_preflight",
      "r2_preflight",
      "coolify_preflight",
      "github_preflight",
      "starter_source_preflight",
      "generated_apps_toggle",
      "authority_repo_sync",
      "management_profile",
    ];

    foundationalKeys.forEach((key) => {
      markCompleted(key, "Canli store durumu bu temel owner adimlarinin tamamlandigini dogruluyor.");
    });
  }

  if (input.health.supabaseReady) {
    markCompleted("supabase_provision", "Supabase authority canli durumda hazir.");
  }

  if (starterSeedReady) {
    markCompleted("starter_seed", "Starter icerik canli metriklerde gorunuyor.");
  }

  if (input.health.r2Ready) {
    markCompleted("r2_provision", "R2 authority canli durumda hazir.");
  }

  if (input.health.adminDeploymentReady) {
    markCompleted("admin_blueprint", "Admin blueprint authority hazir.");
  }

  if (input.health.adminDeploymentReady && input.health.adminRuntimeConsistent) {
    markCompleted("admin_deploy", "Admin runtime canli ve tutarli cevap veriyor.");
  }

  if (input.storefrontAppDir?.trim()) {
    markCompleted("storefront_scaffold", "Storefront app dizini olusturulmus durumda.");
  }

  if (hasStorefrontBlueprint) {
    markCompleted("storefront_blueprint", "Storefront blueprint authority hazir.");
  }

  if (hasStorefrontRepoSync) {
    markCompleted("storefront_repo_sync", "Storefront branch ve app dizini repo ile senkron.");
  }

  if (input.health.storefrontRuntimeConsistent) {
    markCompleted("storefront_deploy", "Storefront runtime canli durumda.");
  }

  const failedStepCount = nextSteps.filter((step) => step.status === "failed").length;
  const blockingStepCount = nextSteps.filter((step) => step.status === "failed" && step.blocking).length;
  const pendingStepCount = nextSteps.filter(
    (step) => step.status === "pending" || step.status === "running",
  ).length;
  const nextState = fullyLiveReady ? "ready" : summary.state;
  const nextLastError = fullyLiveReady ? null : summary.lastError;

  return {
    ...summary,
    state: nextState,
    lastError: nextLastError,
    failedStepCount,
    blockingStepCount,
    pendingStepCount,
    steps: nextSteps,
  };
}

function normalizeOwnerStoreStatusForDisplay(
  status: OwnerStoreStatus,
  provisioning: StoreProvisioningSummary,
  health: StoreHealthSummary,
  storefrontStatus: StorefrontStatus,
): OwnerStoreStatus {
  if (provisioning.state === "ready" && storefrontStatus === "active" && isStoreFullyReady(health)) {
    return "active";
  }

  return status;
}

function normalizeBootstrapRecordForDisplay(
  bootstrap: Record<string, unknown> | null | undefined,
  health: StoreHealthSummary,
): Record<string, unknown> | null {
  const current = asRecord(bootstrap);

  if (Object.keys(current).length === 0) {
    return null;
  }

  const next = { ...current };
  const currentFinalReadiness = asRecord(next.finalReadiness);
  const fullyReady = isStoreFullyReady(health);

  next.finalReadiness = {
    ...currentFinalReadiness,
    adminRuntimeOk: health.adminRuntimeConsistent,
    storefrontRuntimeOk: health.storefrontRuntimeConsistent,
    homepageOk: health.homepageOk,
    categoriesOk: health.categoriesOk,
    productsOk: health.productsOk,
    starterSeedOk: health.starterSeedReady,
    settingsOk: health.settingsOk,
    blogPostsOk: health.blogPostsOk,
    lastCheckedAt: new Date().toISOString(),
    lastError: health.storefrontDataMessage,
  };

  if (health.supabaseReady) {
    next.supabaseProvisioning = "configured";
    next.lastProvisionError = fullyReady ? null : next.lastProvisionError ?? null;
  }

  if (health.adminDeploymentReady && health.adminRuntimeConsistent) {
    next.adminDeploymentStatus = "configured";
    next.adminDeploymentLastError = fullyReady ? null : next.adminDeploymentLastError ?? null;
  }

  if (fullyReady) {
    next.firstReadyAt = readOptionalString(next.firstReadyAt) ?? new Date().toISOString();
  }

  return next;
}

function normalizeStorefrontRecordForDisplay(
  storefront: Record<string, unknown> | null | undefined,
  storefrontStatus: StorefrontStatus,
  health: StoreHealthSummary,
): Record<string, unknown> | null {
  const current = asRecord(storefront);

  if (Object.keys(current).length === 0) {
    return null;
  }

  const next = { ...current };
  const fullyReady = isStoreFullyReady(health);

  if (readOptionalString(next.repoSyncStatus) === "failed" && storefrontStatus === "active") {
    next.repoSyncStatus = "synced";
    next.lastRepoSyncError = null;
  }

  if (storefrontStatus === "active") {
    next.status = "active";
    next.deploymentStatus = health.storefrontRuntimeConsistent ? "configured" : next.deploymentStatus ?? "failed";
    next.lastDeploymentError = fullyReady ? null : next.lastDeploymentError ?? null;
  }

  return next;
}

function buildDomainMigrationSummary(
  metadata: Record<string, unknown> | null | undefined,
): StoreDomainMigrationSummary {
  const rawDomainMigration = readDomainMigrationSummary(metadata);
  const hasHistory = Boolean(
    rawDomainMigration.startedAt ||
      rawDomainMigration.completedAt ||
      rawDomainMigration.lastError ||
      rawDomainMigration.previousStorefrontDomain ||
      rawDomainMigration.storefrontDomain,
  );

  return {
    ...rawDomainMigration,
    hasHistory,
  };
}

function mapCleanupRunOverview(run: CleanupRunSummary): CleanupRunOverview {
  return {
    id: run.id,
    slug: run.slug,
    storeName: run.storeName,
    status: run.status,
    authorityDeletedAt: run.authorityDeletedAt,
    resolvedAt: run.resolvedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    orphanedTargetCount: run.targets.filter(
      (target) => target.status === "failed" || target.status === "skipped",
    ).length,
    targets: run.targets,
  };
}

let trackedStoreConfigNormalizationPromise: Promise<void> | null = null;

function shouldRepairTrackedStoreConfigsAtRuntime(): boolean {
  const raw = process.env.CELEBIX_ALLOW_RUNTIME_STORE_CONFIG_REPAIR?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

async function ensureTrackedStoreConfigsNormalized(): Promise<void> {
  if (!shouldRepairTrackedStoreConfigsAtRuntime()) {
    return;
  }

  if (!trackedStoreConfigNormalizationPromise) {
    trackedStoreConfigNormalizationPromise = Promise.resolve()
      .then(() => {
        repairTrackedStoreConfigs();
      })
      .catch((error) => {
        console.error("Tracked store config normalization skipped at runtime:", error);
        trackedStoreConfigNormalizationPromise = null;
      });
  }

  await trackedStoreConfigNormalizationPromise;
}

function scheduleOwnerStoresAndMetricsSync(): void {
  if (ownerStoreMetricsSyncPromise) {
    return;
  }

  if (Date.now() - ownerStoreMetricsLastStartedAt < OWNER_METRICS_BACKGROUND_SYNC_INTERVAL_MS) {
    return;
  }

  void syncOwnerStoresAndMetrics().catch((error) => {
    console.error("Owner metrics background sync failed:", error);
  });
}

function readLifecycleStage(value: unknown): StoreLifecycleStage {
  return value === "building" || value === "launch_ready" || value === "live" || value === "growth" ? value : "onboarding";
}

function readPriority(value: unknown): StorePriority {
  return value === "high" || value === "critical" ? value : "normal";
}

function readBillingStatus(value: unknown): BillingStatus {
  return value === "follow_up" || value === "hold" ? value : "healthy";
}

function readDateOnlyString(value: unknown): string | null {
  const parsed = readOptionalString(value);

  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    return null;
  }

  return parsed;
}

function readPositiveMonthCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

function parseUtcDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcMonths(baseDate: Date, months: number): Date {
  const tentative = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + months, 1)
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(tentative.getUTCFullYear(), tentative.getUTCMonth() + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(
      tentative.getUTCFullYear(),
      tentative.getUTCMonth(),
      Math.min(baseDate.getUTCDate(), lastDayOfTargetMonth)
    )
  );
}

function diffUtcDays(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function getTodayUtcDate(): Date {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildStoreSubscriptionSummary(
  startDate: string | null,
  durationMonths: number | null
): StoreSubscriptionSummary {
  if (!startDate || !durationMonths) {
    return { ...DEFAULT_SUBSCRIPTION };
  }

  const subscriptionStartDate = parseUtcDateOnly(startDate);
  const subscriptionEndDate = addUtcMonths(subscriptionStartDate, durationMonths);
  const today = getTodayUtcDate();
  const totalDays = Math.max(diffUtcDays(subscriptionEndDate, subscriptionStartDate), 0);
  const elapsedDays = clampNumber(diffUtcDays(today, subscriptionStartDate), 0, totalDays);
  const daysRemaining = diffUtcDays(subscriptionEndDate, today);
  const progressPercent =
    totalDays > 0 ? Math.round(clampNumber((elapsedDays / totalDays) * 100, 0, 100)) : 100;
  const cadenceLabel =
    durationMonths === 1 ? "Aylik" : durationMonths === 12 ? "Yillik" : `${durationMonths} aylik`;
  const countdownLabel =
    daysRemaining < 0
      ? `${Math.abs(daysRemaining)} gun gecti`
      : daysRemaining === 0
        ? "Bugun bitiyor"
        : `${daysRemaining} gun kaldi`;
  const status: StoreSubscriptionStatus =
    daysRemaining < 0
      ? "expired"
      : daysRemaining <= STORE_SUBSCRIPTION_EXPIRING_THRESHOLD_DAYS
        ? "expiring"
        : "active";

  return {
    isConfigured: true,
    startDate,
    durationMonths,
    endDate: subscriptionEndDate.toISOString().slice(0, 10),
    totalDays,
    elapsedDays,
    daysRemaining,
    progressPercent,
    cadenceLabel,
    countdownLabel,
    status
  };
}

function resolveOptionalStringInput(value: unknown, currentValue: string | null): string | null {
  if (value === undefined) {
    return currentValue;
  }

  return readOptionalString(value);
}

function parseStoreManagementProfile(
  metadata: Record<string, unknown> | null,
  fallbackState?: {
    storeStatus: OwnerStoreStatus;
    storefrontStatus: StorefrontStatus;
  }
): StoreManagementProfile {
  const root = asRecord(metadata);
  const owner = asRecord(root.owner);
  const client = asRecord(root.client);
  const lifecycle = asRecord(root.lifecycle);
  const finance = asRecord(root.finance);
  const subscription = asRecord(finance.subscription);
  const lifecycleStage = readLifecycleStage(lifecycle.stage);
  const nextAction = readOptionalString(lifecycle.nextAction);
  const shouldPromoteToLive =
    lifecycleStage === "building" &&
    fallbackState?.storeStatus === "active" &&
    fallbackState?.storefrontStatus === "active";
  const subscriptionSummary = buildStoreSubscriptionSummary(
    readDateOnlyString(subscription.startDate),
    readPositiveMonthCount(subscription.durationMonths)
  );

  return {
    clientCompanyName: readOptionalString(client.companyName),
    clientContactName: readOptionalString(client.contactName),
    clientContactEmail: readOptionalString(client.contactEmail),
    clientContactPhone: readOptionalString(client.contactPhone),
    internalOwner: readOptionalString(lifecycle.internalOwner),
    lifecycleStage: shouldPromoteToLive ? "live" : lifecycleStage,
    priority: readPriority(lifecycle.priority),
    nextAction: shouldPromoteToLive && !nextAction ? "Canli operasyon izleniyor." : nextAction,
    launchTarget: readOptionalString(lifecycle.launchTarget),
    ownerNotes: readOptionalString(owner.notes),
    billingStatus: readBillingStatus(finance.billingStatus),
    subscription: subscriptionSummary
  };
}

function buildNextMetadata(
  currentMetadata: Record<string, unknown> | null,
  input: StoreManagementUpdateInput
): Record<string, unknown> {
  const root = asRecord(currentMetadata);
  const owner = asRecord(root.owner);
  const client = asRecord(root.client);
  const lifecycle = asRecord(root.lifecycle);
  const finance = asRecord(root.finance);
  const subscription = asRecord(finance.subscription);

  return {
    ...root,
    owner: {
      ...owner,
      notes: resolveOptionalStringInput(input.ownerNotes, readOptionalString(owner.notes))
    },
    client: {
      ...client,
      companyName: resolveOptionalStringInput(input.clientCompanyName, readOptionalString(client.companyName)),
      contactName: resolveOptionalStringInput(input.clientContactName, readOptionalString(client.contactName)),
      contactEmail: resolveOptionalStringInput(input.clientContactEmail, readOptionalString(client.contactEmail)),
      contactPhone: resolveOptionalStringInput(input.clientContactPhone, readOptionalString(client.contactPhone))
    },
    lifecycle: {
      ...lifecycle,
      internalOwner: resolveOptionalStringInput(input.internalOwner, readOptionalString(lifecycle.internalOwner)),
      stage: input.lifecycleStage ?? readLifecycleStage(lifecycle.stage),
      priority: input.priority ?? readPriority(lifecycle.priority),
      nextAction: resolveOptionalStringInput(input.nextAction, readOptionalString(lifecycle.nextAction)),
      launchTarget:
        input.launchTarget !== undefined
          ? readDateOnlyString(input.launchTarget)
          : readDateOnlyString(lifecycle.launchTarget),
    },
    finance: {
      ...finance,
      billingStatus: input.billingStatus ?? readBillingStatus(finance.billingStatus),
      subscription: {
        ...subscription,
        startDate:
          input.packageStartDate !== undefined
            ? readDateOnlyString(input.packageStartDate)
            : readDateOnlyString(subscription.startDate),
        durationMonths:
          input.packageDurationMonths !== undefined
            ? readPositiveMonthCount(input.packageDurationMonths)
            : readPositiveMonthCount(subscription.durationMonths)
      }
    }
  };
}

function readStorefrontStatusValue(value: unknown): StorefrontStatus | null {
  return value === "not_started" || value === "scaffolded" || value === "active" ? value : null;
}

function readStorefrontRepoSyncStatusValue(value: unknown): StorefrontRepoSyncStatus | null {
  return value === "pending" || value === "synced" || value === "failed" ? value : null;
}

function readStorefrontDeploymentStatusValue(value: unknown): StorefrontDeploymentStatus | null {
  return value === "pending-owner-env" ||
    value === "pending-repo-sync" ||
    value === "prepared" ||
    value === "configured" ||
    value === "failed"
    ? value
    : null;
}

function scoreStorefrontStatusValue(value: StorefrontStatus | null | undefined): number {
  switch (value) {
    case "active":
      return 2;
    case "scaffolded":
      return 1;
    default:
      return 0;
  }
}

function scoreSupabaseAuthority(store: StoreConfig): number {
  return store.bootstrap?.supabaseProvisioning === "configured" ||
    (store.supabase.projectRef !== "pending-owner-bootstrap" && store.supabase.url !== "configure-in-env")
    ? 2
    : 0;
}

function scoreSupabaseRuntimeAuthority(existingAuthority: OwnerStoreAuthorityFields | null): number {
  if (!existingAuthority) {
    return 0;
  }

  const bootstrap = asRecord(existingAuthority.metadata?.bootstrap);
  return readOptionalString(bootstrap.supabaseProvisioning) === "configured" || Boolean(existingAuthority.supabase_url)
    ? 2
    : 0;
}

function scoreR2Authority(store: StoreConfig): number {
  return store.r2?.provisioning === "configured" || Boolean(store.r2?.bucketName || store.r2?.publicUrl) ? 2 : 0;
}

function scoreR2RuntimeAuthority(existingAuthority: OwnerStoreAuthorityFields | null): number {
  if (!existingAuthority) {
    return 0;
  }

  return Boolean(existingAuthority.r2_bucket_name || existingAuthority.r2_public_url) ? 2 : 0;
}

function scoreAdminDeploymentAuthority(store: StoreConfig): number {
  switch (store.bootstrap?.adminDeploymentStatus) {
    case "configured":
      return 3;
    case "prepared":
      return 2;
    default:
      return 0;
  }
}

function scoreAdminRuntimeAuthority(existingAuthority: OwnerStoreAuthorityFields | null): number {
  if (!existingAuthority) {
    return 0;
  }

  const bootstrap = asRecord(existingAuthority.metadata?.bootstrap);
  const status = readOptionalString(bootstrap.adminDeploymentStatus);
  const resourceId = readOptionalString(bootstrap.adminDeploymentResourceId);
  const preparedAt = readOptionalString(bootstrap.adminDeploymentPreparedAt);
  const deployedAt = readOptionalString(bootstrap.adminDeploymentDeployedAt);
  const finalReadiness = asRecord(bootstrap.finalReadiness);
  const adminRuntimeOk = finalReadiness.adminRuntimeOk === true;

  if (status === "configured" || deployedAt || adminRuntimeOk) {
    return 3;
  }

  if (status === "prepared" || resourceId || preparedAt) {
    return 2;
  }

  return 0;
}

export function getStoreAuthorityStalenessIssues(
  store: StoreConfig,
  existingAuthority: OwnerStoreAuthorityFields | null,
): string[] {
  if (!existingAuthority) {
    return [];
  }

  const issues: string[] = [];
  const existingStorefrontMetadata = asRecord(existingAuthority.metadata?.storefront);

  if (scoreSupabaseRuntimeAuthority(existingAuthority) > scoreSupabaseAuthority(store)) {
    issues.push("Supabase authority dosya state'inden daha ileride");
  }

  if (scoreR2RuntimeAuthority(existingAuthority) > scoreR2Authority(store)) {
    issues.push("R2 authority dosya state'inden daha ileride");
  }

  if (scoreAdminRuntimeAuthority(existingAuthority) > scoreAdminDeploymentAuthority(store)) {
    issues.push("Admin deployment authority dosya state'inden daha ileride");
  }

  if (scoreExistingStorefrontAuthority(existingAuthority) > scoreStorefrontAuthority(store)) {
    issues.push("Storefront authority dosya state'inden daha ileride");
  }

  if (
    (readOptionalString(existingAuthority.storefront_app_dir) || readOptionalString(existingStorefrontMetadata.appDir)) &&
    !store.storefront?.appDir
  ) {
    issues.push("storefront appDir owner authority'de var ama store.config'te yok");
  }

  if (
    readOptionalString(existingStorefrontMetadata.deploymentBranch) &&
    !store.storefront?.deploymentBranch
  ) {
    issues.push("storefront deployment branch owner authority'de var ama store.config'te yok");
  }

  return issues;
}

function scoreStorefrontAuthority(store: StoreConfig): number {
  const storefront = store.storefront;

  if (!storefront) {
    return 0;
  }

  if (storefront.deploymentStatus === "configured" || storefront.status === "active") {
    return 5;
  }

  if (storefront.deploymentStatus === "prepared") {
    return 4;
  }

  if (storefront.repoSyncStatus === "synced") {
    return 3;
  }

  if (storefront.appDir || storefront.status === "scaffolded") {
    return 2;
  }

  return 0;
}

function scoreExistingStorefrontAuthority(existingAuthority: OwnerStoreAuthorityFields | null): number {
  if (!existingAuthority) {
    return 0;
  }

  const storefront = asRecord(existingAuthority.metadata?.storefront);
  const deploymentStatus = readStorefrontDeploymentStatusValue(storefront.deploymentStatus);
  const repoSyncStatus = readStorefrontRepoSyncStatusValue(storefront.repoSyncStatus);
  const appDir =
    readOptionalString(existingAuthority.storefront_app_dir) ?? readOptionalString(storefront.appDir);
  const status =
    readStorefrontStatusValue(storefront.status) ?? existingAuthority.storefront_status;

  if (deploymentStatus === "configured" || status === "active") {
    return 5;
  }

  if (deploymentStatus === "prepared") {
    return 4;
  }

  if (repoSyncStatus === "synced") {
    return 3;
  }

  if (appDir || status === "scaffolded") {
    return 2;
  }

  return 0;
}

function resolveEffectiveStorefrontAppDir(
  store: StoreConfig,
  existingAuthority: OwnerStoreAuthorityFields | null,
): string | null {
  const metadataStorefront = asRecord(existingAuthority?.metadata?.storefront);
  return (
    store.storefront?.appDir ??
    readOptionalString(existingAuthority?.storefront_app_dir) ??
    readOptionalString(metadataStorefront.appDir) ??
    null
  );
}

function resolveEffectiveStorefrontStatus(
  store: StoreConfig,
  existingAuthority: OwnerStoreAuthorityFields | null,
): StorefrontStatus {
  const metadataStorefront = asRecord(existingAuthority?.metadata?.storefront);
  const authorityStatus =
    readStorefrontStatusValue(metadataStorefront.status) ??
    existingAuthority?.storefront_status ??
    "not_started";
  const storeStatus = store.storefront?.status ?? "not_started";

  return scoreStorefrontStatusValue(storeStatus) >= scoreStorefrontStatusValue(authorityStatus)
    ? storeStatus
    : authorityStatus;
}

function resolveOwnerStorefrontAppDir(
  row: Pick<OwnerStoreRow, "storefront_app_dir" | "metadata">,
): string | null {
  const storefront = asRecord(row.metadata?.storefront);
  return readOptionalString(row.storefront_app_dir) ?? readOptionalString(storefront.appDir);
}

function resolveOwnerStorefrontStatus(
  row: Pick<OwnerStoreRow, "storefront_status" | "metadata">,
): StorefrontStatus {
  const storefront = asRecord(row.metadata?.storefront);
  const metadataStatus = readStorefrontStatusValue(storefront.status);
  return scoreStorefrontStatusValue(metadataStatus) > scoreStorefrontStatusValue(row.storefront_status)
    ? (metadataStatus ?? row.storefront_status)
    : row.storefront_status;
}

function assertStoreAuthorityNotStale(
  store: StoreConfig,
  existingAuthority: OwnerStoreAuthorityFields | null,
): void {
  const issues = getStoreAuthorityStalenessIssues(store, existingAuthority);

  if (issues.length > 0) {
    throw new Error(`${store.slug} authority stale gorunuyor: ${issues.join(" / ")}`);
  }
}

function mergeStoreMetadata(store: StoreConfig, existingMetadata: Record<string, unknown> | null): Record<string, unknown> {
  const current = asRecord(existingMetadata);
  const owner = asRecord(current.owner);
  const bootstrap = asRecord(current.bootstrap);
  const storefront = asRecord(current.storefront);
  const supabase = asRecord(current.supabase);

  return {
    ...current,
    databaseMode: store.databaseMode,
    domains: store.domains,
    lightPostgres: store.lightPostgres ?? current.lightPostgres ?? null,
    bootstrap: {
      ...bootstrap,
      ...(store.bootstrap ?? {}),
    },
    r2: store.r2 ?? current.r2 ?? null,
    storefront: {
      ...storefront,
      ...(store.storefront ?? {}),
    },
    supabase: {
      ...supabase,
      provider: store.supabase.provider,
      dashboardUrl: store.supabase.dashboardUrl ?? readOptionalString(supabase.dashboardUrl) ?? null,
      storage: store.supabase.storage,
    },
    features: store.features,
    owner: {
      ...owner,
      createdBy: store.owner?.createdBy ?? owner.createdBy ?? "owner-panel",
      notes: readOptionalString(owner.notes) ?? store.owner?.notes ?? ""
    }
  };
}

function resolveStoreDatabaseMode(
  store: Pick<OwnerStoreRow, "metadata" | "supabase_project_ref" | "supabase_url">,
  storeConfig?: StoreConfig | null,
): DatabaseMode {
  if (storeConfig?.databaseMode === "full_supabase") {
    return "full_supabase";
  }

  if (storeConfig?.databaseMode === "light_postgres") {
    return "light_postgres";
  }

  const metadataMode = readOptionalString(asRecord(store.metadata).databaseMode);

  if (metadataMode === "full_supabase") {
    return "full_supabase";
  }

  if (metadataMode === "light_postgres") {
    return "light_postgres";
  }

  return store.supabase_project_ref || store.supabase_url ? "full_supabase" : "light_postgres";
}

function isLightPostgresReady(
  store: Pick<OwnerStoreRow, "metadata">,
  storeConfig?: StoreConfig | null,
): boolean {
  const lightPostgresRecord = asRecord(storeConfig?.lightPostgres ?? asRecord(store.metadata).lightPostgres);
  return (
    readOptionalString(lightPostgresRecord.databaseName) !== null &&
    readOptionalString(lightPostgresRecord.provisioning) === "configured"
  );
}

function resolveSupabaseDashboardUrl(configuredDashboardUrl: string | null | undefined, publicUrl: string | null | undefined): string | null {
  const dashboardUrl = readOptionalString(configuredDashboardUrl);
  const baseUrl = readOptionalString(publicUrl);

  if (dashboardUrl) {
    const normalizedDashboardUrl = dashboardUrl.trim();
    const pointsToRawCoolifyPort = /:\s*8000(?:\/|$)|:\s*8001(?:\/|$)/.test(normalizedDashboardUrl.replace(/\s+/g, ""));

    if (!pointsToRawCoolifyPort) {
      return normalizedDashboardUrl;
    }
  }

  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/+$/, "")}/project/default`;
}

async function resolveStoreSupabaseAuthority(store: StoreConfig, ownerStoreId?: string): Promise<{
  url: string | null;
  serviceRoleKey: string | null;
  anonKey: string | null;
}> {
  const secretRecord = ownerStoreId
    ? await getStoreSupabaseSecretByStoreId(ownerStoreId)
    : await getStoreSupabaseSecret(store.slug);
  const envMap = parseEnvFile(resolveStoreEnvPath(store));
  const configuredStoreUrl = store.supabase.url !== "configure-in-env" ? store.supabase.url : null;
  return {
    url: secretRecord?.supabase_url || configuredStoreUrl || envMap.NEXT_PUBLIC_SUPABASE_URL || null,
    serviceRoleKey: secretRecord?.supabase_service_role_key || envMap.SUPABASE_SERVICE_ROLE_KEY || null,
    anonKey: secretRecord?.supabase_anon_key || envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
  };
}

async function createStoreServiceClient(store: StoreConfig, ownerStoreId?: string): Promise<SupabaseClient | null> {
  const { url, serviceRoleKey } = await resolveStoreSupabaseAuthority(store, ownerStoreId);

  if (!url || url === "configure-in-env" || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function verifyStoreAdminCredentials(
  store: StoreConfig,
  ownerStoreId: string | undefined,
  email: string,
  password: string
): Promise<string | null> {
  const { url, anonKey } = await resolveStoreSupabaseAuthority(store, ownerStoreId);

  if (!url || url === "configure-in-env" || !anonKey) {
    return "Store auth authority hazir degil.";
  }

  const verificationClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    }
  });
  const { data, error } = await verificationClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session || !data.user) {
    return error?.message || "Store admin girisi dogrulanamadi.";
  }

  await verificationClient.auth.signOut().catch(() => undefined);
  return null;
}

async function countStoreAdminsForConfig(store: StoreConfig, ownerStoreId?: string): Promise<number> {
  const client = await createStoreServiceClient(store, ownerStoreId);

  if (!client) {
    return 0;
  }

  return getExactCount(client.from("profiles").select("id", { count: "exact", head: true }));
}

async function listStoreAdminsForConfig(store: StoreConfig, ownerStoreId?: string): Promise<StoreAdminSummary[]> {
  const client = await createStoreServiceClient(store, ownerStoreId);

  if (!client) {
    return [];
  }

  const { data: profilesData, error: profilesError } = await client
    .from("profiles")
    .select("id, full_name, role, task_definition, created_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profiles = (profilesData as StoreAdminProfileRow[]) ?? [];

  const {
    data: { users },
    error: usersError,
  } = await client.auth.admin.listUsers();

  if (usersError) {
    return profiles.map((profile) => ({
      id: profile.id,
      email: "unknown",
      fullName: profile.full_name,
      role: profile.role,
      taskDefinition: profile.task_definition,
      createdAt: profile.created_at ?? null,
    }));
  }

  return profiles.map((profile) => {
    const user = users.find((entry) => entry.id === profile.id);

    return {
      id: profile.id,
      email: user?.email || "unknown",
      fullName: profile.full_name,
      role: profile.role,
      taskDefinition: profile.task_definition,
      createdAt: profile.created_at ?? null,
    };
  });
}

async function getExactCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function collectStoreMetrics(store: StoreConfig, ownerStoreId?: string): Promise<StoreMetricsSnapshot> {
  const client = await createStoreServiceClient(store, ownerStoreId);

  if (!client) {
    return {
      productCount: 0,
      orderCount: 0,
      customerCount: 0,
      pendingOrderCount: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      lastSyncedAt: new Date().toISOString()
    };
  }

  const [productCount, orderCount, customerCount, pendingOrderCount, ordersResult] = await Promise.all([
    getExactCount(client.from("products").select("id", { count: "exact", head: true })),
    getExactCount(client.from("orders").select("id", { count: "exact", head: true })),
    getExactCount(client.from("customers").select("id", { count: "exact", head: true })),
    getExactCount(client.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"])),
    client.from("orders").select("total, status")
  ]);

  if (ordersResult.error) {
    throw new Error(ordersResult.error.message);
  }

  const revenueOrders = (ordersResult.data ?? []).filter((order) => {
    const status = typeof order.status === "string" ? order.status.toLowerCase() : "";
    return status !== "cancelled" && status !== "canceled" && status !== "failed";
  });

  const totalRevenue = revenueOrders.reduce((total, order) => total + Number(order.total ?? 0), 0);
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  return {
    productCount,
    orderCount,
    customerCount,
    pendingOrderCount,
    totalRevenue: Number(totalRevenue.toFixed(2)),
    averageOrderValue: Number(averageOrderValue.toFixed(2)),
    lastSyncedAt: new Date().toISOString()
  };
}

function isSuspiciousZeroMetrics(metric: OwnerMetricRow | undefined, store: OwnerStoreRow): boolean {
  if (!metric) {
    return true;
  }

  const totalActivity =
    Number(metric.product_count ?? 0) +
    Number(metric.order_count ?? 0) +
    Number(metric.customer_count ?? 0) +
    Number(metric.pending_order_count ?? 0);

  return totalActivity === 0 && store.status === "active" && resolveOwnerStorefrontStatus(store) === "active";
}

function buildOwnerStoreRow(
  store: StoreConfig,
  existingAuthority: OwnerStoreAuthorityFields | null,
  authority?: {
    supabaseUrl?: string | null;
  }
) {
  const storefrontAppDir = resolveEffectiveStorefrontAppDir(store, existingAuthority);
  const storefrontStatus = resolveEffectiveStorefrontStatus(store, existingAuthority);

  return {
    slug: store.slug,
    name: store.name,
    status: store.status,
    theme_key: store.theme.key,
    theme_label: store.theme.label,
    storefront_domain: store.domains.storefront,
    admin_domain: store.domains.admin,
    support_email: store.branding?.supportEmail ?? null,
    support_phone: store.branding?.supportPhone ?? null,
    tagline: store.branding?.tagline ?? null,
    supabase_project_ref: store.supabase.projectRef === "pending-owner-bootstrap" ? null : store.supabase.projectRef,
    supabase_url:
      authority?.supabaseUrl?.trim() ||
      (store.supabase.url === "configure-in-env" ? null : store.supabase.url),
    r2_bucket_name: store.r2?.bucketName ?? existingAuthority?.r2_bucket_name ?? null,
    r2_public_url: store.r2?.publicUrl ?? existingAuthority?.r2_public_url ?? null,
    r2_managed_domain: store.r2?.managedDomain ?? existingAuthority?.r2_managed_domain ?? null,
    storefront_app_dir: storefrontAppDir,
    storefront_status: storefrontStatus,
    metadata: mergeStoreMetadata(store, existingAuthority?.metadata ?? null)
  };
}

export async function ensureOwnerStoreAuthorityForSlug(slug: string): Promise<void> {
  await ensureTrackedStoreConfigsNormalized();

  const store = getStoreConfig(slug);

  if (!store) {
    throw new Error(`"${slug}" icin tracked store config bulunamadi.`);
  }

  const serviceClient = createOwnerServiceClient();
  const { data: existingRowData, error: existingRowError } = await serviceClient
    .from("owner_stores")
    .select("id, metadata, supabase_url, r2_bucket_name, r2_public_url, r2_managed_domain, storefront_app_dir, storefront_status")
    .eq("slug", slug)
    .maybeSingle<{
      id: string;
      metadata: Record<string, unknown> | null;
      supabase_url: string | null;
      r2_bucket_name: string | null;
      r2_public_url: string | null;
      r2_managed_domain: string | null;
      storefront_app_dir: string | null;
      storefront_status: StorefrontStatus;
    }>();

  if (existingRowError) {
    throw new Error(existingRowError.message);
  }

  const existingAuthority: OwnerStoreAuthorityFields | null = existingRowData
    ? {
        metadata: existingRowData.metadata ?? null,
        supabase_url: existingRowData.supabase_url ?? null,
        r2_bucket_name: existingRowData.r2_bucket_name ?? null,
        r2_public_url: existingRowData.r2_public_url ?? null,
        r2_managed_domain: existingRowData.r2_managed_domain ?? null,
        storefront_app_dir: existingRowData.storefront_app_dir ?? null,
        storefront_status: existingRowData.storefront_status,
      }
    : null;

  const secretUrl =
    existingRowData?.id
      ? (await getStoreSupabaseSecretByStoreId(existingRowData.id).catch(() => null))?.supabase_url?.trim() ||
        null
      : null;

  const { error: upsertStoreError } = await serviceClient
    .from("owner_stores")
    .upsert(buildOwnerStoreRow(store, existingAuthority, { supabaseUrl: secretUrl }), {
      onConflict: "slug",
    });

  if (upsertStoreError) {
    throw new Error(upsertStoreError.message);
  }

  clearDashboardStoreSummaryCaches();
}

export async function updateOwnerStoreR2Authority(
  slug: string,
  input: {
    bucketName: string;
    publicUrl: string;
    managedDomain?: string | null;
  }
): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient
    .from("owner_stores")
    .update({
      r2_bucket_name: input.bucketName,
      r2_public_url: input.publicUrl,
      r2_managed_domain: input.managedDomain ?? null,
    })
    .eq("slug", slug);

  if (error) {
    throw new Error(error.message);
  }
}

function readBooleanFlag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStoreFinalReadiness(
  metadata: Record<string, unknown> | null | undefined,
): StoreFinalReadinessSummary {
  const bootstrap = asRecord(asRecord(metadata).bootstrap);
  const finalReadiness = asRecord(bootstrap.finalReadiness);

  return {
    adminRuntimeOk: readBooleanFlag(finalReadiness.adminRuntimeOk),
    storefrontRuntimeOk: readBooleanFlag(finalReadiness.storefrontRuntimeOk),
    homepageOk: readBooleanFlag(finalReadiness.homepageOk),
    categoriesOk: readBooleanFlag(finalReadiness.categoriesOk),
    productsOk: readBooleanFlag(finalReadiness.productsOk),
    starterSeedOk: readBooleanFlag(finalReadiness.starterSeedOk),
    settingsOk: readBooleanFlag(finalReadiness.settingsOk),
    blogPostsOk: readBooleanFlag(finalReadiness.blogPostsOk),
    lastCheckedAt: readOptionalString(finalReadiness.lastCheckedAt),
    lastError: readOptionalString(finalReadiness.lastError),
  };
}

function isStoreFullyReady(health: StoreHealthSummary): boolean {
  return (
    health.supabaseReady &&
    health.r2Ready &&
    health.adminDeploymentReady &&
    health.adminRuntimeConsistent &&
    health.storefrontRuntimeConsistent &&
    health.storefrontDataReady &&
    health.starterSeedReady
  );
}

export async function updateOwnerStoreBootstrapHealthAuthority(
  slug: string,
  input: {
    finalReadiness: {
      adminRuntimeOk: boolean;
      storefrontRuntimeOk: boolean;
      homepageOk: boolean;
      categoriesOk: boolean;
      productsOk: boolean;
      starterSeedOk: boolean;
      settingsOk: boolean;
      blogPostsOk: boolean;
      lastCheckedAt?: string;
      lastError?: string | null;
    };
    firstReadyAt?: string | null;
  },
): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("metadata")
    .eq("slug", slug)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return;
  }

  const metadata = asRecord(data.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const storefront = asRecord(metadata.storefront);
  const currentFinalReadiness = asRecord(bootstrap.finalReadiness);
  const fullyReady =
    input.finalReadiness.adminRuntimeOk &&
    input.finalReadiness.storefrontRuntimeOk &&
    input.finalReadiness.homepageOk &&
    input.finalReadiness.categoriesOk &&
    input.finalReadiness.productsOk &&
    input.finalReadiness.starterSeedOk &&
    input.finalReadiness.settingsOk &&
    input.finalReadiness.blogPostsOk;
  const firstReadyAt =
    fullyReady
      ? readOptionalString(bootstrap.firstReadyAt) ?? input.firstReadyAt ?? new Date().toISOString()
      : readOptionalString(bootstrap.firstReadyAt) ?? null;

  const nextMetadata = {
    ...metadata,
    bootstrap: {
      ...bootstrap,
      finalReadiness: {
        ...currentFinalReadiness,
        adminRuntimeOk: input.finalReadiness.adminRuntimeOk,
        storefrontRuntimeOk: input.finalReadiness.storefrontRuntimeOk,
        homepageOk: input.finalReadiness.homepageOk,
        categoriesOk: input.finalReadiness.categoriesOk,
        productsOk: input.finalReadiness.productsOk,
        starterSeedOk: input.finalReadiness.starterSeedOk,
        settingsOk: input.finalReadiness.settingsOk,
        blogPostsOk: input.finalReadiness.blogPostsOk,
        lastCheckedAt: input.finalReadiness.lastCheckedAt ?? new Date().toISOString(),
        lastError: input.finalReadiness.lastError ?? null,
      },
      firstReadyAt,
      lastProvisionError: fullyReady ? null : bootstrap.lastProvisionError ?? null,
      adminDeploymentLastError: fullyReady ? null : bootstrap.adminDeploymentLastError ?? null,
      supabaseProvisioning: fullyReady
        ? "configured"
        : readOptionalString(bootstrap.supabaseProvisioning) ?? "pending-owner-env",
      adminDeploymentStatus: fullyReady
        ? "configured"
        : readOptionalString(bootstrap.adminDeploymentStatus) ?? "pending-owner-env",
    },
    storefront: {
      ...storefront,
      status: fullyReady ? "active" : (readOptionalString(storefront.status) ?? storefront.status ?? null),
      deploymentStatus: fullyReady
        ? "configured"
        : readOptionalString(storefront.deploymentStatus) ?? storefront.deploymentStatus ?? null,
      lastDeploymentError: fullyReady ? null : storefront.lastDeploymentError ?? null,
    },
  };

  const { error: updateError } = await serviceClient
    .from("owner_stores")
    .update({
      metadata: nextMetadata,
    })
    .eq("slug", slug);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function buildStoreHealth(
  store: OwnerStoreRow,
  lastSyncedAt: string | null,
  storeAdminCount: number,
  connectionReadiness: StoreConnectionReadiness,
  adminRuntimeHealth: AdminRuntimeHealth,
  storeConfig?: StoreConfig | null,
): StoreHealthSummary {
  const databaseMode = resolveStoreDatabaseMode(store, storeConfig);
  const finalReadiness = readStoreFinalReadiness(store.metadata);
  const storefrontStatus = resolveOwnerStorefrontStatus(store);
  const supabaseReady =
    databaseMode === "full_supabase"
      ? Boolean(store.supabase_project_ref && store.supabase_url)
      : isLightPostgresReady(store, storeConfig);
  const r2Ready = Boolean(store.r2_bucket_name && store.r2_public_url);
  const storefrontRuntimeConsistent = finalReadiness.storefrontRuntimeOk ?? (storefrontStatus === "active");
  const homepageOk = finalReadiness.homepageOk ?? storefrontRuntimeConsistent;
  const categoriesOk = finalReadiness.categoriesOk ?? storefrontRuntimeConsistent;
  const productsOk = finalReadiness.productsOk ?? storefrontRuntimeConsistent;
  const storefrontDataReady = homepageOk && categoriesOk && productsOk;
  const starterSeedReady = finalReadiness.starterSeedOk ?? storefrontDataReady;
  const settingsOk = finalReadiness.settingsOk ?? storefrontDataReady;
  const blogPostsOk = finalReadiness.blogPostsOk ?? storefrontDataReady;
  const storefrontReady = storefrontRuntimeConsistent && storefrontDataReady;
  const adminCoverage = storeAdminCount > 0;
  const secretCoverage = connectionReadiness.secretCoverage;
  const secretAuthorityReady = connectionReadiness.secretAuthorityReady;
  const legacyAuthConfigured = connectionReadiness.legacyAuthConfigured;
  const adminDeploymentReady = adminRuntimeHealth.adminDeploymentReady;
  const adminRuntimeConsistent = adminRuntimeHealth.adminRuntimeConsistent;
  const metricsFreshnessMinutes = lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000))
    : null;
  const score = [
    supabaseReady,
    r2Ready,
    storefrontReady,
    storefrontRuntimeConsistent,
    storefrontDataReady,
    starterSeedReady,
    adminCoverage,
    secretCoverage,
    secretAuthorityReady,
    adminDeploymentReady,
    adminRuntimeConsistent
  ].filter(Boolean).length;

  let label: HealthLabel = "hazir";

  if (
    !supabaseReady ||
    !adminDeploymentReady ||
    !adminRuntimeConsistent ||
    !storefrontRuntimeConsistent ||
    !storefrontDataReady ||
    !starterSeedReady
  ) {
    label = "kritik";
  } else if (!r2Ready || !storefrontReady) {
    label = "kurulum";
  } else if (!adminCoverage || !secretCoverage || !secretAuthorityReady) {
    label = "operasyonel";
  }

  if (metricsFreshnessMinutes !== null && metricsFreshnessMinutes > 360 && label !== "kritik") {
    label = "operasyonel";
  }

  return {
    supabaseReady,
    r2Ready,
    storefrontReady,
    storefrontRuntimeConsistent,
    storefrontDataReady,
    homepageOk,
    categoriesOk,
    productsOk,
    starterSeedReady,
    settingsOk,
    blogPostsOk,
    storefrontDataMessage: finalReadiness.lastError,
    adminCoverage,
    secretCoverage,
    secretAuthorityReady,
    legacyAuthConfigured,
    adminDeploymentReady,
    adminRuntimeConsistent,
    adminRuntimeMessage: adminRuntimeHealth.adminRuntimeMessage,
    adminRuntimeUrl: adminRuntimeHealth.adminRuntimeUrl,
    metricsFreshnessMinutes,
    score,
    label
  };
}

function normalizeComparableUrl(value: string | null | undefined): string | null {
  const trimmed = readOptionalString(value);

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(toAbsoluteUrl(trimmed));
    return `${url.protocol}//${url.hostname}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function buildStoreConsistency(
  store: OwnerStoreRow,
  storeConfig: StoreConfig | null,
  connectionReadiness: StoreConnectionReadiness,
  adminRuntimeHealth: AdminRuntimeHealth
): StoreConsistencySummary {
  const issues: StoreConsistencyIssue[] = [];
  const checkedAt = new Date().toISOString();

  if (!storeConfig) {
    issues.push({
      code: "missing_store_config",
      severity: "blocking",
      source: "store_config",
      message: "Store config bulunamadi; authoritative kaynak eksik."
    });

    return {
      blocking: true,
      issueCount: issues.length,
      blockingIssueCount: 1,
      issues,
      checkedAt
    };
  }

  const configStorefrontDomain = normalizeDomainInput(storeConfig.domains.storefront);
  const configAdminDomain = normalizeDomainInput(storeConfig.domains.admin);
  const ownerStorefrontDomain = normalizeDomainInput(store.storefront_domain);
  const ownerAdminDomain = normalizeDomainInput(store.admin_domain);
  const databaseMode = resolveStoreDatabaseMode(store, storeConfig);
  const configSupabaseUrl = normalizeComparableUrl(storeConfig.supabase.url === "configure-in-env" ? null : storeConfig.supabase.url);
  const ownerSupabaseUrl = normalizeComparableUrl(store.supabase_url);
  const secretSupabaseUrl = normalizeComparableUrl(connectionReadiness.secretSupabaseUrl);
  const envSupabaseUrl = normalizeComparableUrl(connectionReadiness.envSupabaseUrl);
  const envStoreDomain = normalizeDomainInput(connectionReadiness.envStoreDomain);
  const envAdminDomain = normalizeDomainInput(connectionReadiness.envAdminDomain);
  const envStorefrontUrl = normalizeDomainInput(connectionReadiness.envStorefrontUrl);
  const envAdminUrl = normalizeDomainInput(connectionReadiness.envAdminUrl);
  const adminDeploymentStatus = storeConfig.bootstrap?.adminDeploymentStatus ?? "pending-owner-env";
  const supabaseProvisioningStatus = storeConfig.bootstrap?.supabaseProvisioning ?? "pending-owner-env";

  if (configStorefrontDomain && ownerStorefrontDomain && configStorefrontDomain !== ownerStorefrontDomain) {
    issues.push({
      code: "owner_domain_mismatch",
      severity: "blocking",
      source: "owner_store",
      message: `Owner storefront domaini drift uretmis: ${ownerStorefrontDomain}`
    });
  }

  if (configAdminDomain && ownerAdminDomain && configAdminDomain !== ownerAdminDomain) {
    issues.push({
      code: "owner_domain_mismatch",
      severity: "blocking",
      source: "owner_store",
      message: `Owner admin domaini drift uretmis: ${ownerAdminDomain}`
    });
  }

  if (databaseMode === "full_supabase" && configSupabaseUrl && ownerSupabaseUrl && configSupabaseUrl !== ownerSupabaseUrl) {
    issues.push({
      code: "owner_supabase_mismatch",
      severity: "blocking",
      source: "owner_store",
      message: `Owner store Supabase URL farkli: ${ownerSupabaseUrl}`
    });
  }

  if (databaseMode === "full_supabase" && configSupabaseUrl && secretSupabaseUrl && configSupabaseUrl !== secretSupabaseUrl) {
    issues.push({
      code: "secret_supabase_mismatch",
      severity: "blocking",
      source: "owner_secret",
      message: `Secret authority Supabase URL drift uretmis: ${secretSupabaseUrl}`
    });
  }

  const adminEnvMissing = databaseMode === "full_supabase"
    ? (
        !connectionReadiness.envSupabaseUrl ||
        !connectionReadiness.envStoreDomain ||
        !connectionReadiness.envAdminDomain
      )
    : (
        !connectionReadiness.envStoreDomain ||
        !connectionReadiness.envAdminDomain
      );

  if (adminEnvMissing && !connectionReadiness.secretAuthorityReady && !adminRuntimeHealth.adminDeploymentReady) {
    issues.push({
      code: "admin_env_missing",
      severity: adminDeploymentStatus === "pending-owner-env" ? "warning" : "blocking",
      source: "admin_env",
      message:
        adminDeploymentStatus === "pending-owner-env"
          ? "Admin env seti henuz owner tarafinda tamamlanmamis."
          : "Admin env seti eksik; deployment authoritative store DB ile calisamaz."
    });
  }

  if (
    (configStorefrontDomain && envStoreDomain && configStorefrontDomain !== envStoreDomain) ||
    (configStorefrontDomain && envStorefrontUrl && configStorefrontDomain !== envStorefrontUrl) ||
    (configAdminDomain && envAdminDomain && configAdminDomain !== envAdminDomain) ||
    (configAdminDomain && envAdminUrl && configAdminDomain !== envAdminUrl)
  ) {
    issues.push({
      code: "admin_env_domain_mismatch",
      severity: "blocking",
      source: "admin_env",
      message: "Admin env domain alanlari store config ile uyusmuyor."
    });
  }

  if (databaseMode === "full_supabase" && configSupabaseUrl && envSupabaseUrl && configSupabaseUrl !== envSupabaseUrl) {
    issues.push({
      code: "admin_env_supabase_mismatch",
      severity: "blocking",
      source: "admin_env",
      message: `Admin env Supabase URL drift uretmis: ${envSupabaseUrl}`
    });
  }

  if (
    databaseMode === "full_supabase" &&
    !connectionReadiness.secretSupabaseUrl &&
    supabaseProvisioningStatus === "configured"
  ) {
    issues.push({
      code: "secret_supabase_mismatch",
      severity: "blocking",
      source: "owner_secret",
      message: "Owner secret authority eksik; store Supabase URL/service key authoritative olarak kayitli degil."
    });
  }

  if (!adminRuntimeHealth.adminDeploymentReady) {
    issues.push({
      code: "admin_runtime_unreachable",
      severity: adminDeploymentStatus === "pending-owner-env" ? "warning" : "blocking",
      source: "admin_runtime",
      message: adminRuntimeHealth.adminRuntimeMessage || "Admin runtime erisilemiyor."
    });
  } else if (!adminRuntimeHealth.adminRuntimeConsistent) {
    issues.push({
      code: "admin_runtime_drift",
      severity: "blocking",
      source: "admin_runtime",
      message: adminRuntimeHealth.adminRuntimeMessage || "Admin runtime farkli store metadata donuyor."
    });
  }

  const blockingIssueCount = issues.filter((issue) => issue.severity === "blocking").length;

  return {
    blocking: blockingIssueCount > 0,
    issueCount: issues.length,
    blockingIssueCount,
    issues,
    checkedAt
  };
}

async function getAccessibleStoreData(context: OwnerAuthContext): Promise<AccessibleStoreData> {
  const serviceClient = createOwnerServiceClient();
  scheduleOwnerStoresAndMetricsSync();

  const superAdmin = context.profile.role === "super_admin";
  let accessRows: OwnerStoreAccessRow[] = [];

  if (!superAdmin) {
    const { data, error } = await serviceClient
      .from("owner_store_access")
      .select("id, profile_id, store_id, commission_rate, created_at")
      .eq("profile_id", context.user.id);

    if (error) {
      throw new Error(error.message);
    }

    accessRows = (data as OwnerStoreAccessRow[]) ?? [];
  }

  if (!superAdmin && accessRows.length === 0) {
    return {
      stores: [],
      metricsMap: new Map(),
      accessRows: [],
      commissionMap: new Map(),
      affiliateRateMap: new Map(),
      affiliateCountMap: new Map()
    };
  }

  const storeQuery = serviceClient
    .from("owner_stores")
    .select("*")
    .order("updated_at", { ascending: false });

  const { data: storesData, error: storesError } = superAdmin
    ? await storeQuery
    : await storeQuery.in(
        "id",
        accessRows.map((row) => row.store_id)
      );

  if (storesError) {
    throw new Error(storesError.message);
  }

  const stores = (storesData as OwnerStoreRow[]) ?? [];

  if (stores.length === 0) {
    return {
      stores: [],
      metricsMap: new Map(),
      accessRows,
      commissionMap: new Map(),
      affiliateRateMap: new Map(),
      affiliateCountMap: new Map()
    };
  }

  const { data: metricsData, error: metricsError } = await serviceClient
    .from("owner_store_metrics")
    .select("*")
    .in(
      "store_id",
      stores.map((store) => store.id)
    );

  if (metricsError) {
    throw new Error(metricsError.message);
  }

  const metricsMap = new Map(((metricsData as OwnerMetricRow[]) ?? []).map((metric) => [metric.store_id, metric]));
  const commissionMap = new Map<string, number | null>();
  const affiliateRateMap = new Map<string, number>();
  const affiliateCountMap = new Map<string, number>();

  if (superAdmin) {
    const { data: storeAccessData, error: storeAccessError } = await serviceClient
      .from("owner_store_access")
      .select("id, profile_id, store_id, commission_rate, created_at")
      .in(
        "store_id",
        stores.map((store) => store.id)
      );

    if (storeAccessError) {
      throw new Error(storeAccessError.message);
    }

    accessRows = (storeAccessData as OwnerStoreAccessRow[]) ?? [];
  }

  for (const store of stores) {
    const scopedAccessRows = accessRows.filter((row) => row.store_id === store.id);
    const totalAffiliateRate = scopedAccessRows.reduce((total, row) => total + Number(row.commission_rate ?? 0), 0);

    affiliateRateMap.set(store.id, totalAffiliateRate);
    affiliateCountMap.set(store.id, scopedAccessRows.length);
    commissionMap.set(
      store.id,
      superAdmin ? null : (scopedAccessRows.find((row) => row.profile_id === context.user.id)?.commission_rate ?? null)
    );
  }

  return {
    stores,
    metricsMap,
    accessRows,
    commissionMap,
    affiliateRateMap,
    affiliateCountMap
  };
}

async function buildDashboardStoreSummaries(
  context: OwnerAuthContext,
  mode: DashboardStoreBuildMode = "summary"
): Promise<DashboardStoreSummary[]> {
  await ensureTrackedStoreConfigsNormalized();
  const accessible = await getAccessibleStoreData(context);

  return Promise.all(
    accessible.stores.map(async (store) => {
      const metric = accessible.metricsMap.get(store.id);
      const storeConfig = await getAuthoritativeStoreConfig(store.slug);
      const summaryMode = mode === "summary";
      const storedBootstrap = asRecord(store.metadata?.bootstrap);
      const shouldProbeAdminRuntimeInSummary =
        summaryMode &&
        store.storefront_status === "active" &&
        readOptionalString(storedBootstrap.adminDeploymentStatus) !== "configured" &&
        Boolean(readOptionalString(store.admin_domain));
      const shouldRefreshMetrics = Boolean(!summaryMode && storeConfig && isSuspiciousZeroMetrics(metric, store));
      const [connectionReadiness, storeAdminCount, adminRuntimeHealth, storeAdmins, refreshedMetrics] =
        summaryMode
          ? await Promise.all([
              storeConfig
                ? readStoreConnectionReadiness(storeConfig, store.id).catch(() => getEmptyConnectionReadiness())
                : Promise.resolve(getEmptyConnectionReadiness()),
              storeConfig ? countStoreAdminsForConfig(storeConfig, store.id).catch(() => 0) : Promise.resolve(0),
              shouldProbeAdminRuntimeInSummary
                ? readAdminRuntimeHealth(store)
                : Promise.resolve(deriveStoredAdminRuntimeHealth(store)),
              Promise.resolve<StoreAdminSummary[]>([]),
              Promise.resolve<StoreMetricsSnapshot | null>(null)
            ])
          : await Promise.all([
              storeConfig
                ? readStoreConnectionReadiness(storeConfig, store.id).catch(() => getEmptyConnectionReadiness())
                : Promise.resolve(getEmptyConnectionReadiness()),
              Promise.resolve(0),
              readAdminRuntimeHealth(store),
              storeConfig ? listStoreAdminsForConfig(storeConfig, store.id).catch(() => []) : Promise.resolve([]),
              shouldRefreshMetrics && storeConfig ? collectStoreMetrics(storeConfig, store.id).catch(() => null) : Promise.resolve(null)
            ]);
      const runtimeSnapshot =
        !summaryMode && storeConfig && (!refreshedMetrics || storeAdmins.length === 0)
          ? await readAdminControlPlaneSnapshot(store, store.id).catch(() => null)
          : null;
      const resolvedStoreAdmins =
        summaryMode
          ? []
          : storeAdmins.length > 0
            ? storeAdmins
            : runtimeSnapshot?.storeAdmins?.length
              ? runtimeSnapshot.storeAdmins
              : storeAdmins;
      const resolvedStoreAdminCount = summaryMode ? storeAdminCount : resolvedStoreAdmins.length;
      const resolvedMetrics = refreshedMetrics ?? runtimeSnapshot?.metrics ?? null;
      const metricsRow = resolvedMetrics
        ? {
            ...metric,
            product_count: resolvedMetrics.productCount,
            order_count: resolvedMetrics.orderCount,
            customer_count: resolvedMetrics.customerCount,
            pending_order_count: resolvedMetrics.pendingOrderCount,
            total_revenue: resolvedMetrics.totalRevenue,
            average_order_value: resolvedMetrics.averageOrderValue,
            last_synced_at: resolvedMetrics.lastSyncedAt
          }
        : metric;
      const consistency = buildStoreConsistency(store, storeConfig, connectionReadiness, adminRuntimeHealth);
      const health = buildStoreHealth(
        store,
        metricsRow?.last_synced_at ?? null,
        resolvedStoreAdminCount,
        connectionReadiness,
        adminRuntimeHealth,
        storeConfig,
      );
      const provisioning = normalizeProvisioningSummaryForDisplay(buildProvisioningSummary(store.metadata), {
        health,
        storefrontStatus: store.storefront_status,
        storefrontAppDir: store.storefront_app_dir,
        storefrontDeploymentStatus: readOptionalString(storeConfig?.storefront?.deploymentStatus),
        storefrontRepoSyncStatus: readOptionalString(storeConfig?.storefront?.repoSyncStatus),
        metrics: {
          productCount: metricsRow?.product_count ?? 0,
          orderCount: metricsRow?.order_count ?? 0,
          customerCount: metricsRow?.customer_count ?? 0,
        },
      });
      const domainMigration = buildDomainMigrationSummary(store.metadata);
      const normalizedStatus = normalizeOwnerStoreStatusForDisplay(
        store.status,
        provisioning,
        health,
        store.storefront_status,
      );

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        status: normalizedStatus,
        themeKey: store.theme_key,
        themeLabel: store.theme_label ?? store.theme_key,
        storefrontDomain: store.storefront_domain,
        adminDomain: store.admin_domain,
        storefrontAppDir: resolveOwnerStorefrontAppDir(store),
        storefrontStatus: resolveOwnerStorefrontStatus(store),
        supabaseDashboardUrl: resolveSupabaseDashboardUrl(
          storeConfig?.supabase.dashboardUrl ?? null,
          storeConfig?.supabase.url ?? store.supabase_url
        ),
        productCount: metricsRow?.product_count ?? 0,
        orderCount: metricsRow?.order_count ?? 0,
        customerCount: metricsRow?.customer_count ?? 0,
        pendingOrderCount: metricsRow?.pending_order_count ?? 0,
        totalRevenue: metricsRow?.total_revenue ?? 0,
        averageOrderValue: metricsRow?.average_order_value ?? 0,
        lastSyncedAt: metricsRow?.last_synced_at ?? null,
        commissionRate: accessible.commissionMap.get(store.id) ?? null,
        totalAffiliateRate: accessible.affiliateRateMap.get(store.id) ?? 0,
        affiliateCount: accessible.affiliateCountMap.get(store.id) ?? 0,
        storeAdminCount: resolvedStoreAdminCount,
        management: parseStoreManagementProfile(store.metadata, {
          storeStatus: normalizedStatus,
          storefrontStatus: resolveOwnerStorefrontStatus(store)
        }),
        provisioning,
        domainMigration,
        health,
        consistency
      };
    })
  );
}

export async function syncOwnerStoresAndMetrics(): Promise<void> {
  if (ownerStoreMetricsSyncPromise) {
    await ownerStoreMetricsSyncPromise;
    return;
  }

  ownerStoreMetricsLastStartedAt = Date.now();
  ownerStoreMetricsSyncPromise = (async () => {
    await ensureTrackedStoreConfigsNormalized();
    const serviceClient = createOwnerServiceClient();
    const unresolvedCleanupSlugs = await listUnresolvedCleanupSlugs();
    const storeConfigs = getStores()
      .map((store) => getStoreConfig(store.slug))
      .filter((store): store is StoreConfig => Boolean(store))
      .filter((store) => !store.slug.startsWith("smoke-"))
      .filter((store) => !unresolvedCleanupSlugs.has(store.slug));

    if (storeConfigs.length === 0) {
      clearDashboardStoreSummaryCaches();
      return;
    }

    const { data: existingStoreRows, error: existingStoreRowsError } = await serviceClient
      .from("owner_stores")
      .select(
        "id, slug, status, storefront_domain, admin_domain, metadata, supabase_url, r2_bucket_name, r2_public_url, r2_managed_domain, storefront_app_dir, storefront_status",
      );

    if (existingStoreRowsError) {
      throw new Error(existingStoreRowsError.message);
    }

    const allExistingRows = (existingStoreRows as Array<{
      id: string;
      slug: string;
      status: "draft" | "active" | "paused";
      storefront_domain: string;
      admin_domain: string;
      metadata: Record<string, unknown> | null;
      supabase_url: string | null;
      r2_bucket_name: string | null;
      r2_public_url: string | null;
      r2_managed_domain: string | null;
      storefront_app_dir: string | null;
      storefront_status: StorefrontStatus;
    }>) ?? [];
    const activeStoreSlugs = new Set(storeConfigs.map((store) => store.slug));
    const orphanedSmokeRows = allExistingRows.filter((row) => {
      if (activeStoreSlugs.has(row.slug)) {
        return false;
      }

      const storefrontDomain = row.storefront_domain?.trim().toLocaleLowerCase("tr") || "";
      const adminDomain = row.admin_domain?.trim().toLocaleLowerCase("tr") || "";

      return (
        row.status === "draft" &&
        (row.slug.startsWith("smoke-") ||
          storefrontDomain.includes(".sslip.io") ||
          adminDomain.includes(".sslip.io"))
      );
    });

    if (orphanedSmokeRows.length > 0) {
      const { error: orphanDeleteError } = await serviceClient
        .from("owner_stores")
        .delete()
        .in(
          "id",
          orphanedSmokeRows.map((row) => row.id),
        );

      if (orphanDeleteError) {
        throw new Error(orphanDeleteError.message);
      }
    }

    const existingRows = allExistingRows.filter((row) => activeStoreSlugs.has(row.slug));
    const authorityMap = new Map<string, OwnerStoreAuthorityFields>(
      existingRows.map((row) => [
        row.slug,
        {
          metadata: row.metadata ?? null,
          supabase_url: row.supabase_url ?? null,
          r2_bucket_name: row.r2_bucket_name ?? null,
          r2_public_url: row.r2_public_url ?? null,
          r2_managed_domain: row.r2_managed_domain ?? null,
          storefront_app_dir: row.storefront_app_dir ?? null,
          storefront_status: row.storefront_status,
        },
      ]),
    );
    const storeIdBySlug = new Map(existingRows.map((row) => [row.slug, row.id]));
    const secretUrlBySlug = new Map<string, string>();

    for (const store of storeConfigs) {
      assertStoreAuthorityNotStale(store, authorityMap.get(store.slug) ?? null);
      const storeId = storeIdBySlug.get(store.slug);

      if (!storeId) {
        continue;
      }

      const secretRecord = await getStoreSupabaseSecretByStoreId(storeId).catch(() => null);
      const secretUrl = secretRecord?.supabase_url?.trim();

      if (secretUrl) {
        secretUrlBySlug.set(store.slug, secretUrl);
      }
    }

    const { error: upsertStoresError } = await serviceClient
      .from("owner_stores")
      .upsert(
        storeConfigs.map((store) =>
          buildOwnerStoreRow(store, authorityMap.get(store.slug) ?? null, {
            supabaseUrl: secretUrlBySlug.get(store.slug) ?? null,
          }),
        ),
        { onConflict: "slug" },
      );

    if (upsertStoresError) {
      throw new Error(upsertStoresError.message);
    }

    const { data: ownerStores, error: storeReadError } = await serviceClient
      .from("owner_stores")
      .select("id, slug")
      .in(
        "slug",
        storeConfigs.map((store) => store.slug),
      );

    if (storeReadError) {
      throw new Error(storeReadError.message);
    }

    const storeIdMap = new Map((ownerStores ?? []).map((store) => [store.slug as string, store.id as string]));
    const { data: existingMetricsRows, error: existingMetricsError } = await serviceClient
      .from("owner_store_metrics")
      .select("*")
      .in("store_id", Array.from(storeIdMap.values()));

    if (existingMetricsError) {
      throw new Error(existingMetricsError.message);
    }

    const existingMetricsMap = new Map(((existingMetricsRows as OwnerMetricRow[]) ?? []).map((row) => [row.store_id, row]));

    await Promise.all(
      storeConfigs.map(async (store) => {
        const storeId = storeIdMap.get(store.slug);

        if (!storeId) {
          return;
        }

        let metrics: StoreMetricsSnapshot;

        try {
          metrics = await collectStoreMetrics(store, storeId);
        } catch (error) {
          console.error(`Store metrics sync failed for ${store.slug}:`, error);
          const existingMetric = existingMetricsMap.get(storeId);

          if (!existingMetric) {
            return;
          }

          metrics = {
            productCount: existingMetric.product_count ?? 0,
            orderCount: existingMetric.order_count ?? 0,
            customerCount: existingMetric.customer_count ?? 0,
            pendingOrderCount: existingMetric.pending_order_count ?? 0,
            totalRevenue: Number(existingMetric.total_revenue ?? 0),
            averageOrderValue: Number(existingMetric.average_order_value ?? 0),
            lastSyncedAt: existingMetric.last_synced_at ?? new Date().toISOString(),
          };
        }

        const { error } = await serviceClient.from("owner_store_metrics").upsert(
          {
            store_id: storeId,
            product_count: metrics.productCount,
            order_count: metrics.orderCount,
            customer_count: metrics.customerCount,
            pending_order_count: metrics.pendingOrderCount,
            total_revenue: metrics.totalRevenue,
            average_order_value: metrics.averageOrderValue,
            last_synced_at: metrics.lastSyncedAt,
          },
          { onConflict: "store_id" },
        );

        if (error) {
          throw new Error(error.message);
        }
      }),
    );

    clearDashboardStoreSummaryCaches();
  })();

  try {
    await ownerStoreMetricsSyncPromise;
  } finally {
    ownerStoreMetricsSyncPromise = null;
  }
}

export async function listDashboardStores(context: OwnerAuthContext): Promise<DashboardStoreSummary[]> {
  const cacheKey = getDashboardStoreSummaryCacheKey(context, "summary");
  const cached = readFromCache(dashboardStoreSummaryCache, cacheKey);

  if (cached) {
    return cached;
  }

  const stores = await buildDashboardStoreSummaries(context, "summary");
  return writeToCache(dashboardStoreSummaryCache, cacheKey, stores, OWNER_SUMMARY_CACHE_TTL_MS);
}

export async function getStoreConsistencyForSlug(
  context: OwnerAuthContext,
  slug: string
): Promise<StoreConsistencySummary | null> {
  const stores = await buildDashboardStoreSummaries(context, "detail");
  return stores.find((store) => store.slug === slug)?.consistency ?? null;
}

export async function assertStoreConsistencyForAdminMutation(
  context: OwnerAuthContext,
  slug: string,
  actionLabel: string
): Promise<void> {
  const consistency = await getStoreConsistencyForSlug(context, slug);

  if (!consistency) {
    throw new Error("Proje bulunamadi.");
  }

  if (!consistency.blocking) {
    return;
  }

  const message = consistency.issues
    .filter((issue) => issue.severity === "blocking")
    .map((issue) => issue.message)
    .slice(0, 3)
    .join(" / ");

  throw new Error(`${actionLabel} once store drift sorunlarini cozmelisin: ${message}`);
}

export async function listRecentOwnerActivity(
  context: OwnerAuthContext,
  limit = 10,
  storeSlug?: string
): Promise<AuditLogSummary[]> {
  const serviceClient = createOwnerServiceClient();
  const superAdmin = context.profile.role === "super_admin";
  let accessibleStoreSlugs: string[] = [];

  if (!superAdmin || storeSlug) {
    const stores = await listDashboardStores(context);
    accessibleStoreSlugs = stores.map((store) => store.slug);

    if (storeSlug && !accessibleStoreSlugs.includes(storeSlug)) {
      return [];
    }

    if (!superAdmin && !storeSlug && accessibleStoreSlugs.length === 0) {
      return [];
    }
  }

  let query = serviceClient
    .from("owner_audit_logs")
    .select("id, actor_id, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(limit * 4);

  if (storeSlug) {
    query = query.eq("target_type", "store").eq("target_id", storeSlug);
  } else if (!superAdmin) {
    query = query.eq("target_type", "store").in("target_id", accessibleStoreSlugs);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const logs = ((data as OwnerAuditLogRow[]) ?? []).slice(0, limit);

  if (logs.length === 0) {
    return [];
  }

  const actorIds = Array.from(new Set(logs.map((log) => log.actor_id).filter((value): value is string => Boolean(value))));
  const profileMap = new Map<string, OwnerProfile>();

  if (actorIds.length > 0) {
    const { data: profilesData, error: profilesError } = await serviceClient
      .from("owner_profiles")
      .select("id, email, full_name, role, is_active")
      .in("id", actorIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of (profilesData as OwnerProfile[]) ?? []) {
      profileMap.set(profile.id, profile);
    }
  }

  const storeMap = new Map<string, string>();
  const storeTargetSlugs = Array.from(new Set(logs.filter((log) => log.target_type === "store").map((log) => log.target_id)));

  if (storeTargetSlugs.length > 0) {
    const { data: storesData, error: storesError } = await serviceClient
      .from("owner_stores")
      .select("slug, name")
      .in("slug", storeTargetSlugs);

    if (storesError) {
      throw new Error(storesError.message);
    }

    for (const store of (storesData as Array<{ slug: string; name: string }>) ?? []) {
      storeMap.set(store.slug, store.name);
    }
  }

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.target_type,
    targetId: log.target_id,
    targetLabel: log.target_type === "store" ? storeMap.get(log.target_id) ?? log.target_id : log.target_id,
    actorName:
      log.actor_id && profileMap.get(log.actor_id)
        ? profileMap.get(log.actor_id)?.full_name || profileMap.get(log.actor_id)?.email || "Sistem"
        : "Sistem",
    createdAt: log.created_at,
    details: asRecord(log.details)
  }));
}

export async function getOwnerDashboard(context: OwnerAuthContext): Promise<OwnerDashboardSummary> {
  const stores = await listDashboardStores(context);
  const cleanupRuns = (await listCleanupRuns({ unresolvedOnly: true, limit: 4 })).map(mapCleanupRunOverview);
  const totals = stores.reduce(
    (accumulator, store) => ({
      setupRevenue: accumulator.setupRevenue + STORE_SETUP_REVENUE,
      revenue: accumulator.revenue + store.totalRevenue,
      orders: accumulator.orders + store.orderCount,
      customers: accumulator.customers + store.customerCount,
      activeStores: accumulator.activeStores + (store.status === "active" ? 1 : 0),
      draftStores: accumulator.draftStores + (store.status === "draft" ? 1 : 0),
      pendingOrders: accumulator.pendingOrders + store.pendingOrderCount,
      liveStorefronts: accumulator.liveStorefronts + (store.storefrontStatus === "active" ? 1 : 0),
      affiliateExposure: accumulator.affiliateExposure + (store.totalRevenue * store.totalAffiliateRate) / 100
    }),
    {
      setupRevenue: 0,
      revenue: 0,
      orders: 0,
      customers: 0,
      activeStores: 0,
      draftStores: 0,
      pendingOrders: 0,
      liveStorefronts: 0,
      affiliateExposure: 0
    }
  );

  const spotlightStores = [...stores].sort((left, right) => right.totalRevenue - left.totalRevenue).slice(0, 4);
  const attentionStores = [...stores]
    .filter(
      (store) => {
        const packageNeedsAttention =
          store.management.subscription.status === "expiring" ||
          store.management.subscription.status === "expired";

        return (
        store.status !== "active" ||
        store.storeAdminCount === 0 ||
        store.provisioning.state !== "ready" ||
        !store.health.supabaseReady ||
        !store.health.r2Ready ||
        !store.health.secretAuthorityReady ||
        !store.health.adminDeploymentReady ||
        !store.health.adminRuntimeConsistent ||
        store.pendingOrderCount > 0 ||
        packageNeedsAttention
        );
      }
    )
    .sort((left, right) => {
      const leftSubscriptionScore =
        left.management.subscription.status === "expired"
          ? 12
          : left.management.subscription.status === "expiring"
            ? 6
            : 0;
      const rightSubscriptionScore =
        right.management.subscription.status === "expired"
          ? 12
          : right.management.subscription.status === "expiring"
            ? 6
            : 0;
      const leftScore =
        Number(left.health.label === "kritik") * 20 +
        Number(left.provisioning.state !== "ready") * 10 +
        Number(!left.health.secretAuthorityReady) * 8 +
        Number(!left.health.adminRuntimeConsistent) * 8 +
        Number(left.storeAdminCount === 0) * 5 +
        leftSubscriptionScore +
        left.pendingOrderCount;
      const rightScore =
        Number(right.health.label === "kritik") * 20 +
        Number(right.provisioning.state !== "ready") * 10 +
        Number(!right.health.secretAuthorityReady) * 8 +
        Number(!right.health.adminRuntimeConsistent) * 8 +
        Number(right.storeAdminCount === 0) * 5 +
        rightSubscriptionScore +
        right.pendingOrderCount;
      return rightScore - leftScore;
    })
    .slice(0, 6);

  return {
    totals,
    spotlightStores,
    attentionStores,
    orphanedCleanupRuns: cleanupRuns.length,
    cleanupRuns,
    recentActivity: await listRecentOwnerActivity(context, 8),
    stores
  };
}

export async function listClientAccounts(context: OwnerAuthContext): Promise<ClientAccountSummary[]> {
  const stores = await listDashboardStores(context);

  return stores
    .map((store) => ({
      id: store.id,
      slug: store.slug,
      storeName: store.name,
      storefrontDomain: store.storefrontDomain,
      status: store.status,
      clientCompanyName: store.management.clientCompanyName ?? store.name,
      clientContactName: store.management.clientContactName,
      clientContactEmail: store.management.clientContactEmail,
      clientContactPhone: store.management.clientContactPhone,
      internalOwner: store.management.internalOwner,
      lifecycleStage: store.management.lifecycleStage,
      priority: store.management.priority,
      nextAction: store.management.nextAction,
      totalRevenue: store.totalRevenue,
      orderCount: store.orderCount,
      storeAdminCount: store.storeAdminCount,
      affiliateCount: store.affiliateCount,
      billingStatus: store.management.billingStatus,
      health: store.health
    }))
    .sort((left, right) => left.clientCompanyName.localeCompare(right.clientCompanyName, "tr"));
}

export async function getFinanceSummary(context: OwnerAuthContext): Promise<FinanceSummary> {
  const stores = await listDashboardStores(context);
  const totals = stores.reduce(
    (accumulator, store) => ({
      setupRevenue: accumulator.setupRevenue + STORE_SETUP_REVENUE,
      revenue: accumulator.revenue + store.totalRevenue,
      orders: accumulator.orders + store.orderCount,
      pendingOrders: accumulator.pendingOrders + store.pendingOrderCount,
      affiliateExposure: accumulator.affiliateExposure + (store.totalRevenue * store.totalAffiliateRate) / 100
    }),
    {
      setupRevenue: 0,
      revenue: 0,
      orders: 0,
      pendingOrders: 0,
      affiliateExposure: 0
    }
  );

  return {
    totals: {
      ...totals,
      averageOrderValue: totals.orders > 0 ? Number((totals.revenue / totals.orders).toFixed(2)) : 0
    },
    rows: stores
      .map((store) => ({
        id: store.id,
        slug: store.slug,
        name: store.name,
        status: store.status,
        setupRevenue: STORE_SETUP_REVENUE,
        totalRevenue: store.totalRevenue,
        orderCount: store.orderCount,
        averageOrderValue: store.averageOrderValue,
        estimatedAffiliateExposure: Number(((store.totalRevenue * store.totalAffiliateRate) / 100).toFixed(2)),
        affiliateCount: store.affiliateCount,
        totalAffiliateRate: store.totalAffiliateRate,
        commissionRate: store.commissionRate,
        billingStatus: store.management.billingStatus
      }))
      .sort((left, right) => right.totalRevenue - left.totalRevenue)
  };
}

export async function getOperationsSummary(context: OwnerAuthContext): Promise<OperationsSummary> {
  const stores = await listDashboardStores(context);
  const cleanupRuns = (await listCleanupRuns({ unresolvedOnly: true, limit: 12 })).map(mapCleanupRunOverview);

  return {
    totals: {
      readyStores: stores.filter((store) => store.health.label === "hazir").length,
      missingSupabase: stores.filter((store) => !store.health.supabaseReady).length,
      missingR2: stores.filter((store) => !store.health.r2Ready).length,
      missingAdmins: stores.filter((store) => !store.health.adminCoverage).length,
      secretDrift: stores.filter((store) => !store.health.secretAuthorityReady).length,
      adminRuntimeIssues: stores.filter((store) => !store.health.adminRuntimeConsistent || !store.health.adminDeploymentReady).length,
      consistencyBlockingStores: stores.filter((store) => store.consistency.blocking).length,
      pendingStorefronts: stores.filter((store) => store.storefrontStatus !== "active").length,
      orphanedCleanupRuns: cleanupRuns.length,
    },
    rows: stores.map((store) => ({
      id: store.id,
      slug: store.slug,
      name: store.name,
      status: store.status,
      storefrontStatus: store.storefrontStatus,
      storefrontDomain: store.storefrontDomain,
      adminDomain: store.adminDomain,
      health: store.health,
      consistency: store.consistency,
      pendingOrderCount: store.pendingOrderCount,
      lastSyncedAt: store.lastSyncedAt,
      supabaseProjectRef: getStoreConfig(store.slug)?.supabase.projectRef ?? null,
      r2BucketName: getStoreConfig(store.slug)?.r2?.bucketName ?? null,
      provisioning: store.provisioning,
    })),
    cleanupRuns,
    recentActivity: await listRecentOwnerActivity(context, 10)
  };
}

export async function listAffiliates(): Promise<AffiliateSummary[]> {
  const serviceClient = createOwnerServiceClient();
  const { data: profilesData, error: profilesError } = await serviceClient
    .from("owner_profiles")
    .select("id, email, full_name, role, is_active")
    .eq("role", "affiliate_admin")
    .order("created_at", { ascending: false });

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profiles = (profilesData as OwnerProfile[]) ?? [];

  if (profiles.length === 0) {
    return [];
  }

  const { data: accessData, error: accessError } = await serviceClient
    .from("owner_store_access")
    .select("id, profile_id, store_id, commission_rate, created_at")
    .in(
      "profile_id",
      profiles.map((profile) => profile.id)
    );

  if (accessError) {
    throw new Error(accessError.message);
  }

  const accessRows = (accessData as OwnerStoreAccessRow[]) ?? [];
  const storeIds = Array.from(new Set(accessRows.map((row) => row.store_id)));
  const storeMap = new Map<string, OwnerStoreRow>();

  if (storeIds.length > 0) {
    const { data: storesData, error: storesError } = await serviceClient
      .from("owner_stores")
      .select("*")
      .in("id", storeIds);

    if (storesError) {
      throw new Error(storesError.message);
    }

    for (const store of (storesData as OwnerStoreRow[]) ?? []) {
      storeMap.set(store.id, store);
    }
  }

  return profiles.map((profile) => ({
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    isActive: profile.is_active,
    assignments: accessRows
      .filter((access) => access.profile_id === profile.id)
      .map((access) => {
        const store = storeMap.get(access.store_id);

        return {
          storeId: access.store_id,
          storeName: store?.name ?? "Bilinmeyen Store",
          storeSlug: store?.slug ?? "unknown",
          commissionRate: access.commission_rate
        };
      })
  }));
}

export async function getStoreDetail(context: OwnerAuthContext, slug: string): Promise<StoreDetailSummary | null> {
  const dashboardStores = await listDashboardStores(context);
  const current = dashboardStores.find((store) => store.slug === slug);

  if (!current) {
    return null;
  }

  const serviceClient = createOwnerServiceClient();
  const { data: storeRowData, error: storeRowError } = await serviceClient
    .from("owner_stores")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (storeRowError || !storeRowData) {
    return null;
  }

  const storeRow = storeRowData as OwnerStoreRow;
  const { data: accessData, error: accessError } = await serviceClient
    .from("owner_store_access")
    .select("id, profile_id, store_id, commission_rate, created_at")
    .eq("store_id", storeRow.id);

  if (accessError) {
    throw new Error(accessError.message);
  }

  const accessRows = (accessData as OwnerStoreAccessRow[]) ?? [];
  const profileIds = accessRows.map((access) => access.profile_id);
  const profileMap = new Map<string, OwnerProfile>();

  if (profileIds.length > 0) {
    const { data: profilesData, error: profilesError } = await serviceClient
      .from("owner_profiles")
      .select("id, email, full_name, role, is_active")
      .in("id", profileIds);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    for (const profile of (profilesData as OwnerProfile[]) ?? []) {
      profileMap.set(profile.id, profile);
    }
  }

  const metadata = (storeRow.metadata ?? {}) as Record<string, unknown>;
  const storeConfig = await getAuthoritativeStoreConfig(slug);
  const metadataBootstrap = asRecord(metadata.bootstrap);
  const configBootstrap = storeConfig?.bootstrap
    ? (storeConfig.bootstrap as unknown as Record<string, unknown>)
    : null;
  const storefrontConfig =
    storeConfig?.storefront
      ? (storeConfig.storefront as unknown as Record<string, unknown>)
      : null;
  const detailBootstrap =
    Object.keys(metadataBootstrap).length > 0 || !configBootstrap
      ? metadataBootstrap
      : configBootstrap;
  const metadataFeatures = Array.isArray(metadata.features) ? (metadata.features as string[]) : [];
  const [storeAdmins, connectionReadiness, adminRuntimeHealth, refreshedMetrics] = await Promise.all([
    storeConfig ? listStoreAdminsForConfig(storeConfig, storeRow.id).catch(() => []) : Promise.resolve([]),
    storeConfig ? readStoreConnectionReadiness(storeConfig, storeRow.id).catch(() => null) : Promise.resolve(null),
    readAdminRuntimeHealth(storeRow),
    storeConfig ? collectStoreMetrics(storeConfig, storeRow.id).catch(() => null) : Promise.resolve(null)
  ]);
  const runtimeSnapshot =
    storeConfig && (!refreshedMetrics || storeAdmins.length === 0)
      ? await readAdminControlPlaneSnapshot(storeRow, storeRow.id).catch(() => null)
      : null;
  const resolvedStoreAdmins =
    storeAdmins.length > 0 ? storeAdmins : runtimeSnapshot?.storeAdmins?.length ? runtimeSnapshot.storeAdmins : storeAdmins;
  const resolvedMetrics = refreshedMetrics ?? runtimeSnapshot?.metrics ?? null;
  const recentActivity = await listRecentOwnerActivity(context, 8, slug);
  const consistency =
    storeConfig && connectionReadiness
      ? buildStoreConsistency(storeRow, storeConfig, connectionReadiness, adminRuntimeHealth)
      : current.consistency;
  const health =
    storeConfig && connectionReadiness
      ? buildStoreHealth(
          storeRow,
          resolvedMetrics?.lastSyncedAt ?? current.lastSyncedAt,
          resolvedStoreAdmins.length,
          connectionReadiness,
          adminRuntimeHealth,
          storeConfig,
        )
      : current.health;
  const provisioning = normalizeProvisioningSummaryForDisplay(current.provisioning, {
    health,
    storefrontStatus: current.storefrontStatus,
    storefrontAppDir: current.storefrontAppDir,
    storefrontDeploymentStatus: readOptionalString(storefrontConfig?.deploymentStatus),
    storefrontRepoSyncStatus: readOptionalString(storefrontConfig?.repoSyncStatus),
    metrics: {
      productCount: resolvedMetrics?.productCount ?? current.productCount,
      orderCount: resolvedMetrics?.orderCount ?? current.orderCount,
      customerCount: resolvedMetrics?.customerCount ?? current.customerCount,
    },
  });
  const normalizedStatus = normalizeOwnerStoreStatusForDisplay(
    current.status,
    provisioning,
    health,
    current.storefrontStatus,
  );
  const normalizedBootstrap = normalizeBootstrapRecordForDisplay(detailBootstrap, health);
  const normalizedStorefront = normalizeStorefrontRecordForDisplay(storefrontConfig, current.storefrontStatus, health);

  const resolvedSupabaseUrl =
    connectionReadiness?.secretSupabaseUrl ??
    storeRow.supabase_url ??
    (storeConfig?.supabase.url && storeConfig.supabase.url !== "configure-in-env"
      ? storeConfig.supabase.url
      : null);

  return {
    ...current,
    status: normalizedStatus,
    productCount: resolvedMetrics?.productCount ?? current.productCount,
    orderCount: resolvedMetrics?.orderCount ?? current.orderCount,
    customerCount: resolvedMetrics?.customerCount ?? current.customerCount,
    pendingOrderCount: resolvedMetrics?.pendingOrderCount ?? current.pendingOrderCount,
    totalRevenue: resolvedMetrics?.totalRevenue ?? current.totalRevenue,
    averageOrderValue: resolvedMetrics?.averageOrderValue ?? current.averageOrderValue,
    lastSyncedAt: resolvedMetrics?.lastSyncedAt ?? current.lastSyncedAt,
    storeAdminCount: resolvedStoreAdmins.length,
    health,
    consistency,
    supportEmail: storeRow.support_email ?? storeConfig?.branding?.supportEmail ?? null,
    supportPhone: storeRow.support_phone ?? storeConfig?.branding?.supportPhone ?? null,
    tagline: storeRow.tagline ?? storeConfig?.branding?.tagline ?? null,
    supabaseProjectRef: storeRow.supabase_project_ref ?? storeConfig?.supabase.projectRef ?? null,
    supabaseUrl: resolvedSupabaseUrl,
    supabaseDashboardUrl: resolveSupabaseDashboardUrl(
      storeConfig?.supabase.dashboardUrl ?? null,
      resolvedSupabaseUrl
    ),
    r2BucketName: storeRow.r2_bucket_name ?? storeConfig?.r2?.bucketName ?? null,
    r2PublicUrl: storeRow.r2_public_url ?? storeConfig?.r2?.publicUrl ?? null,
    r2ManagedDomain: storeRow.r2_managed_domain ?? storeConfig?.r2?.managedDomain ?? null,
    bootstrap: normalizedBootstrap,
    storefront: normalizedStorefront,
    features: storeConfig?.features?.length ? storeConfig.features : metadataFeatures,
    createdAt: storeRow.created_at,
    updatedAt: storeRow.updated_at,
    affiliateAssignments: accessRows.map((access) => ({
      profileId: access.profile_id,
      email: profileMap.get(access.profile_id)?.email ?? "unknown",
      fullName: profileMap.get(access.profile_id)?.full_name ?? null,
      commissionRate: access.commission_rate
    })),
    storeAdmins: resolvedStoreAdmins,
    recentActivity,
    provisioning
  };
}

export async function createOrAssignAffiliate(input: {
  actorId: string | null;
  email: string;
  fullName?: string;
  password: string;
  storeSlug: string;
  commissionRate: number;
}): Promise<{ profileId: string; email: string }> {
  const serviceClient = createOwnerServiceClient();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Affiliate e-postasi zorunludur.");
  }

  const { data: storeData, error: storeError } = await serviceClient
    .from("owner_stores")
    .select("id, slug, name")
    .eq("slug", input.storeSlug)
    .maybeSingle();

  if (storeError || !storeData) {
    throw new Error("Affiliate atanacak store bulunamadi.");
  }

  let profileId: string | null = null;

  const { data: existingProfile, error: profileLookupError } = await serviceClient
    .from("owner_profiles")
    .select("id, email, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(profileLookupError.message);
  }

  if (existingProfile?.role === "super_admin") {
    throw new Error("Super admin hesabi affiliate olarak atanamaz.");
  }

  if (existingProfile?.id) {
    profileId = existingProfile.id as string;
  } else {
    const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName?.trim() || ""
      }
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message || "Affiliate hesabi olusturulamadi.");
    }

    profileId = createdUser.user.id;
  }

  const { error: profileUpdateError } = await serviceClient
    .from("owner_profiles")
    .update({
      full_name: input.fullName?.trim() || null,
      role: "affiliate_admin",
      is_active: true
    })
    .eq("id", profileId);

  if (profileUpdateError) {
    throw new Error(profileUpdateError.message);
  }

  const { error: accessError } = await serviceClient.from("owner_store_access").upsert(
    {
      profile_id: profileId,
      store_id: storeData.id as string,
      commission_rate: Number(input.commissionRate.toFixed(2))
    },
    { onConflict: "profile_id,store_id" }
  );

  if (accessError) {
    throw new Error(accessError.message);
  }

  await recordOwnerAuditLog({
    actorId: input.actorId,
    action: "affiliate_assigned",
    targetType: "store",
    targetId: input.storeSlug,
    details: {
      email: normalizedEmail,
      commissionRate: Number(input.commissionRate.toFixed(2)),
      storeName: (storeData as { name?: string }).name ?? input.storeSlug
    }
  });

  return {
    profileId,
    email: normalizedEmail
  };
}

export async function createOrAssignStoreAdmin(
  context: OwnerAuthContext,
  input: {
    email: string;
    fullName?: string;
    password: string;
    storeSlug: string;
    role: StoreAdminRole;
    taskDefinition?: string;
  }
): Promise<{ userId: string; email: string; created: boolean }> {
  const allowedStore = (await listDashboardStores(context)).find((store) => store.slug === input.storeSlug);

  if (!allowedStore) {
    throw new Error("Bu store icin yonetici atama yetkin yok.");
  }

  const storeConfig = await getAuthoritativeStoreConfig(input.storeSlug);

  if (!storeConfig) {
    throw new Error("Store konfigurasyonu bulunamadi.");
  }

  const ownerStoreId = allowedStore.id;
  const client = await createStoreServiceClient(storeConfig, ownerStoreId);

  if (!client) {
    throw new Error("Store Supabase baglantisi hazir degil.");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const fullName = input.fullName?.trim() || "";
  const taskDefinition = input.taskDefinition?.trim() || null;

  if (!normalizedEmail || !password || !input.role) {
    throw new Error("Tum store admin alanlari zorunludur.");
  }

  const {
    data: { users },
    error: usersError,
  } = await client.auth.admin.listUsers();

  if (usersError) {
    throw new Error(usersError.message);
  }

  const existingUser = users.find((entry) => entry.email?.toLowerCase() === normalizedEmail);
  let userId = existingUser?.id || "";
  let created = false;

  if (!existingUser) {
    const { data: createdUser, error: createUserError } = await client.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message || "Store admin hesabi olusturulamadi.");
    }

    userId = createdUser.user.id;
    created = true;
  } else {
    const { error: updateUserError } = await client.auth.admin.updateUserById(existingUser.id, {
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: fullName
      }
    });

    if (updateUserError) {
      throw new Error(updateUserError.message);
    }
  }

  const { error: profileError } = await client.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role: input.role,
      task_definition: taskDefinition
    },
    { onConflict: "id" }
  );

  if (profileError) {
    if (created) {
      await client.auth.admin.deleteUser(userId);
    }

    throw new Error(profileError.message);
  }

  let verificationError = await verifyStoreAdminCredentials(
    storeConfig,
    ownerStoreId,
    normalizedEmail,
    password
  );

  if (verificationError) {
    const { error: repairUserError } = await client.auth.admin.updateUserById(userId, {
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser?.user_metadata || {}),
        full_name: fullName,
      }
    });

    if (repairUserError) {
      if (created) {
        try {
          await client.from("profiles").delete().eq("id", userId);
        } catch {}
        await client.auth.admin.deleteUser(userId).catch(() => undefined);
      }

      throw new Error(
        `Store admin girisi dogrulanamadi: ${verificationError}. Onarma denemesi basarisiz: ${repairUserError.message}`
      );
    }

    verificationError = await verifyStoreAdminCredentials(
      storeConfig,
      ownerStoreId,
      normalizedEmail,
      password
    );
  }

  if (verificationError) {
    if (created) {
      try {
        await client.from("profiles").delete().eq("id", userId);
      } catch {}
      await client.auth.admin.deleteUser(userId).catch(() => undefined);
    }

    throw new Error(`Store admin hesabi olusturuldu ancak giris testi basarisiz: ${verificationError}`);
  }

  await recordOwnerAuditLog({
    actorId: context.user.id,
    action: created ? "store_admin_created" : "store_admin_updated",
    targetType: "store",
    targetId: input.storeSlug,
    details: {
      email: normalizedEmail,
      role: input.role,
      taskDefinition
    }
  });

  return {
    userId,
    email: normalizedEmail,
    created
  };
}

export async function recordOwnerAuditLog(input: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const { error } = await serviceClient.from("owner_audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    details: input.details ?? {}
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateStoreManagementProfile(
  context: OwnerAuthContext,
  slug: string,
  input: StoreManagementUpdateInput
): Promise<void> {
  if (context.profile.role !== "super_admin") {
    throw new Error("Bu islem icin super admin yetkisi gerekli.");
  }

  const serviceClient = createOwnerServiceClient();
  const { data: currentStoreData, error: currentStoreError } = await serviceClient
    .from("owner_stores")
    .select("id, slug, status, metadata, tagline, support_email, support_phone")
    .eq("slug", slug)
    .maybeSingle();

  if (currentStoreError || !currentStoreData) {
    throw new Error("Guncellenecek proje bulunamadi.");
  }

  const currentStore = currentStoreData as Pick<
    OwnerStoreRow,
    "id" | "slug" | "status" | "metadata" | "tagline" | "support_email" | "support_phone"
  >;
  const metadata = buildNextMetadata(currentStore.metadata ?? null, input);
  const nextStatus = input.status ?? currentStore.status;
  const { error } = await serviceClient
    .from("owner_stores")
    .update({
      status: nextStatus,
      tagline:
        input.tagline !== undefined ? readOptionalString(input.tagline) : currentStore.tagline ?? null,
      support_email:
        input.supportEmail !== undefined
          ? readOptionalString(input.supportEmail)
          : currentStore.support_email ?? null,
      support_phone:
        input.supportPhone !== undefined
          ? readOptionalString(input.supportPhone)
          : currentStore.support_phone ?? null,
      metadata
    })
    .eq("slug", slug);

  if (error) {
    throw new Error(error.message);
  }

  await recordOwnerAuditLog({
    actorId: context.user.id,
    action: "store_profile_updated",
    targetType: "store",
    targetId: slug,
    details: {
      status: nextStatus,
      lifecycleStage: input.lifecycleStage ?? DEFAULT_MANAGEMENT.lifecycleStage,
      priority: input.priority ?? DEFAULT_MANAGEMENT.priority,
      internalOwner: input.internalOwner ?? null,
      packageStartDate: input.packageStartDate ?? null,
      packageDurationMonths: input.packageDurationMonths ?? null
    }
  });
}
