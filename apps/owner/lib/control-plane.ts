import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import type { OwnerAuthContext, OwnerProfile } from "@/lib/owner-auth";
import { getStoreSupabaseSecret } from "@/lib/store-secrets";
import {
  getRepoRoot,
  getStoreConfig,
  getStores,
  type StoreConfig,
  type StorefrontStatus
} from "@celebix/platform-config";

type OwnerStoreStatus = "draft" | "active" | "paused";
type StoreLifecycleStage = "onboarding" | "building" | "launch_ready" | "live" | "growth";
type StorePriority = "normal" | "high" | "critical";
type BillingStatus = "healthy" | "follow_up" | "hold";
type HealthLabel = "kritik" | "kurulum" | "operasyonel" | "hazir";
const STORE_SETUP_REVENUE = 19000;

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
}

export interface StoreHealthSummary {
  supabaseReady: boolean;
  r2Ready: boolean;
  storefrontReady: boolean;
  adminCoverage: boolean;
  metricsFreshnessMinutes: number | null;
  score: number;
  label: HealthLabel;
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
  features: string[];
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
  pendingOrderCount: number;
  lastSyncedAt: string | null;
  supabaseProjectRef: string | null;
  r2BucketName: string | null;
}

export interface OperationsSummary {
  totals: {
    readyStores: number;
    missingSupabase: number;
    missingR2: number;
    missingAdmins: number;
    pendingStorefronts: number;
  };
  rows: OperationsStoreSummary[];
  recentActivity: AuditLogSummary[];
}

export interface StoreManagementUpdateInput {
  status: OwnerStoreStatus;
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
}

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
  billingStatus: "healthy"
};

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

function readLifecycleStage(value: unknown): StoreLifecycleStage {
  return value === "building" || value === "launch_ready" || value === "live" || value === "growth" ? value : "onboarding";
}

function readPriority(value: unknown): StorePriority {
  return value === "high" || value === "critical" ? value : "normal";
}

function readBillingStatus(value: unknown): BillingStatus {
  return value === "follow_up" || value === "hold" ? value : "healthy";
}

function parseStoreManagementProfile(metadata: Record<string, unknown> | null): StoreManagementProfile {
  const root = asRecord(metadata);
  const owner = asRecord(root.owner);
  const client = asRecord(root.client);
  const lifecycle = asRecord(root.lifecycle);
  const finance = asRecord(root.finance);

  return {
    clientCompanyName: readOptionalString(client.companyName),
    clientContactName: readOptionalString(client.contactName),
    clientContactEmail: readOptionalString(client.contactEmail),
    clientContactPhone: readOptionalString(client.contactPhone),
    internalOwner: readOptionalString(lifecycle.internalOwner),
    lifecycleStage: readLifecycleStage(lifecycle.stage),
    priority: readPriority(lifecycle.priority),
    nextAction: readOptionalString(lifecycle.nextAction),
    launchTarget: readOptionalString(lifecycle.launchTarget),
    ownerNotes: readOptionalString(owner.notes),
    billingStatus: readBillingStatus(finance.billingStatus)
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

  return {
    ...root,
    owner: {
      ...owner,
      notes: input.ownerNotes ?? null
    },
    client: {
      ...client,
      companyName: input.clientCompanyName ?? null,
      contactName: input.clientContactName ?? null,
      contactEmail: input.clientContactEmail ?? null,
      contactPhone: input.clientContactPhone ?? null
    },
    lifecycle: {
      ...lifecycle,
      internalOwner: input.internalOwner ?? null,
      stage: input.lifecycleStage ?? DEFAULT_MANAGEMENT.lifecycleStage,
      priority: input.priority ?? DEFAULT_MANAGEMENT.priority,
      nextAction: input.nextAction ?? null,
      launchTarget: input.launchTarget ?? null
    },
    finance: {
      ...finance,
      billingStatus: input.billingStatus ?? DEFAULT_MANAGEMENT.billingStatus
    }
  };
}

function mergeStoreMetadata(store: StoreConfig, existingMetadata: Record<string, unknown> | null): Record<string, unknown> {
  const current = asRecord(existingMetadata);
  const owner = asRecord(current.owner);

  return {
    ...current,
    bootstrap: store.bootstrap ?? current.bootstrap ?? null,
    supabase: {
      provider: store.supabase.provider,
      dashboardUrl: store.supabase.dashboardUrl ?? null,
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

async function createStoreServiceClient(store: StoreConfig): Promise<SupabaseClient | null> {
  const secretRecord = await getStoreSupabaseSecret(store.slug);
  const envMap = parseEnvFile(resolveStoreEnvPath(store));
  const url = secretRecord?.supabase_url || envMap.NEXT_PUBLIC_SUPABASE_URL || store.supabase.url;
  const serviceKey = secretRecord?.supabase_service_role_key || envMap.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || url === "configure-in-env" || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function listStoreAdminsForConfig(store: StoreConfig): Promise<StoreAdminSummary[]> {
  const client = await createStoreServiceClient(store);

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

  const {
    data: { users },
    error: usersError,
  } = await client.auth.admin.listUsers();

  if (usersError) {
    throw new Error(usersError.message);
  }

  const profiles = (profilesData as StoreAdminProfileRow[]) ?? [];

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

async function collectStoreMetrics(store: StoreConfig): Promise<StoreMetricsSnapshot> {
  const client = await createStoreServiceClient(store);

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

function buildOwnerStoreRow(store: StoreConfig, existingMetadata: Record<string, unknown> | null) {
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
    supabase_url: store.supabase.url === "configure-in-env" ? null : store.supabase.url,
    r2_bucket_name: store.r2?.bucketName ?? null,
    r2_public_url: store.r2?.publicUrl ?? null,
    r2_managed_domain: store.r2?.managedDomain ?? null,
    storefront_app_dir: store.storefront?.appDir ?? null,
    storefront_status: store.storefront?.status ?? "not_started",
    metadata: mergeStoreMetadata(store, existingMetadata)
  };
}

function buildStoreHealth(
  store: OwnerStoreRow,
  lastSyncedAt: string | null,
  storeAdminCount: number
): StoreHealthSummary {
  const supabaseReady = Boolean(store.supabase_project_ref && store.supabase_url);
  const r2Ready = Boolean(store.r2_bucket_name && store.r2_public_url);
  const storefrontReady = store.storefront_status === "active" || store.storefront_status === "scaffolded";
  const adminCoverage = storeAdminCount > 0;
  const metricsFreshnessMinutes = lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000))
    : null;
  const score = [supabaseReady, r2Ready, storefrontReady, adminCoverage].filter(Boolean).length;

  let label: HealthLabel = "hazir";

  if (score <= 1) {
    label = "kritik";
  } else if (score === 2) {
    label = "kurulum";
  } else if (score === 3) {
    label = "operasyonel";
  }

  if (metricsFreshnessMinutes !== null && metricsFreshnessMinutes > 360 && label !== "kritik") {
    label = "operasyonel";
  }

  return {
    supabaseReady,
    r2Ready,
    storefrontReady,
    adminCoverage,
    metricsFreshnessMinutes,
    score,
    label
  };
}

async function getAccessibleStoreData(context: OwnerAuthContext): Promise<AccessibleStoreData> {
  const serviceClient = createOwnerServiceClient();
  await syncOwnerStoresAndMetrics();

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

async function buildDashboardStoreSummaries(context: OwnerAuthContext): Promise<DashboardStoreSummary[]> {
  const accessible = await getAccessibleStoreData(context);

  return Promise.all(
    accessible.stores.map(async (store) => {
      const metric = accessible.metricsMap.get(store.id);
      const storeConfig = getStoreConfig(store.slug);
      const storeAdmins = storeConfig ? await listStoreAdminsForConfig(storeConfig).catch(() => []) : [];

      return {
        id: store.id,
        slug: store.slug,
        name: store.name,
        status: store.status,
        themeKey: store.theme_key,
        themeLabel: store.theme_label ?? store.theme_key,
        storefrontDomain: store.storefront_domain,
        adminDomain: store.admin_domain,
        storefrontAppDir: store.storefront_app_dir,
        storefrontStatus: store.storefront_status,
        supabaseDashboardUrl: resolveSupabaseDashboardUrl(
          storeConfig?.supabase.dashboardUrl ?? null,
          storeConfig?.supabase.url ?? store.supabase_url
        ),
        productCount: metric?.product_count ?? 0,
        orderCount: metric?.order_count ?? 0,
        customerCount: metric?.customer_count ?? 0,
        pendingOrderCount: metric?.pending_order_count ?? 0,
        totalRevenue: metric?.total_revenue ?? 0,
        averageOrderValue: metric?.average_order_value ?? 0,
        lastSyncedAt: metric?.last_synced_at ?? null,
        commissionRate: accessible.commissionMap.get(store.id) ?? null,
        totalAffiliateRate: accessible.affiliateRateMap.get(store.id) ?? 0,
        affiliateCount: accessible.affiliateCountMap.get(store.id) ?? 0,
        storeAdminCount: storeAdmins.length,
        management: parseStoreManagementProfile(store.metadata),
        health: buildStoreHealth(store, metric?.last_synced_at ?? null, storeAdmins.length)
      };
    })
  );
}

export async function syncOwnerStoresAndMetrics(): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const storeConfigs = getStores()
    .map((store) => getStoreConfig(store.slug))
    .filter((store): store is StoreConfig => Boolean(store));

  if (storeConfigs.length === 0) {
    return;
  }

  const { data: existingStoreRows, error: existingStoreRowsError } = await serviceClient
    .from("owner_stores")
    .select("slug, metadata")
    .in(
      "slug",
      storeConfigs.map((store) => store.slug)
    );

  if (existingStoreRowsError) {
    throw new Error(existingStoreRowsError.message);
  }

  const metadataMap = new Map<string, Record<string, unknown> | null>(
    ((existingStoreRows as Array<{ slug: string; metadata: Record<string, unknown> | null }>) ?? []).map((row) => [
      row.slug,
      row.metadata ?? null
    ])
  );

  const { error: upsertStoresError } = await serviceClient
    .from("owner_stores")
    .upsert(storeConfigs.map((store) => buildOwnerStoreRow(store, metadataMap.get(store.slug) ?? null)), { onConflict: "slug" });

  if (upsertStoresError) {
    throw new Error(upsertStoresError.message);
  }

  const { data: ownerStores, error: storeReadError } = await serviceClient
    .from("owner_stores")
    .select("id, slug")
    .in(
      "slug",
      storeConfigs.map((store) => store.slug)
    );

  if (storeReadError) {
    throw new Error(storeReadError.message);
  }

  const storeIdMap = new Map((ownerStores ?? []).map((store) => [store.slug as string, store.id as string]));

  await Promise.all(
    storeConfigs.map(async (store) => {
      const storeId = storeIdMap.get(store.slug);

      if (!storeId) {
        return;
      }

      let metrics: StoreMetricsSnapshot;

      try {
        metrics = await collectStoreMetrics(store);
      } catch (error) {
        console.error(`Store metrics sync failed for ${store.slug}:`, error);
        metrics = {
          productCount: 0,
          orderCount: 0,
          customerCount: 0,
          pendingOrderCount: 0,
          totalRevenue: 0,
          averageOrderValue: 0,
          lastSyncedAt: new Date().toISOString()
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
          last_synced_at: metrics.lastSyncedAt
        },
        { onConflict: "store_id" }
      );

      if (error) {
        throw new Error(error.message);
      }
    })
  );
}

export async function listDashboardStores(context: OwnerAuthContext): Promise<DashboardStoreSummary[]> {
  return buildDashboardStoreSummaries(context);
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
      (store) =>
        store.status !== "active" ||
        store.storeAdminCount === 0 ||
        !store.health.supabaseReady ||
        !store.health.r2Ready ||
        store.pendingOrderCount > 0
    )
    .sort((left, right) => {
      const leftScore = Number(left.health.score < 4) * 10 + Number(left.storeAdminCount === 0) * 5 + left.pendingOrderCount;
      const rightScore = Number(right.health.score < 4) * 10 + Number(right.storeAdminCount === 0) * 5 + right.pendingOrderCount;
      return rightScore - leftScore;
    })
    .slice(0, 6);

  return {
    totals,
    spotlightStores,
    attentionStores,
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

  return {
    totals: {
      readyStores: stores.filter((store) => store.health.label === "hazir").length,
      missingSupabase: stores.filter((store) => !store.health.supabaseReady).length,
      missingR2: stores.filter((store) => !store.health.r2Ready).length,
      missingAdmins: stores.filter((store) => !store.health.adminCoverage).length,
      pendingStorefronts: stores.filter((store) => store.storefrontStatus !== "active").length
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
      pendingOrderCount: store.pendingOrderCount,
      lastSyncedAt: store.lastSyncedAt,
      supabaseProjectRef: getStoreConfig(store.slug)?.supabase.projectRef ?? null,
      r2BucketName: getStoreConfig(store.slug)?.r2?.bucketName ?? null
    })),
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
  const storeConfig = getStoreConfig(slug);
  const storeAdmins = storeConfig ? await listStoreAdminsForConfig(storeConfig) : [];
  const recentActivity = await listRecentOwnerActivity(context, 8, slug);

  return {
    ...current,
    supportEmail: storeRow.support_email,
    supportPhone: storeRow.support_phone,
    tagline: storeRow.tagline,
    supabaseProjectRef: storeRow.supabase_project_ref,
    supabaseUrl: storeRow.supabase_url,
    supabaseDashboardUrl: resolveSupabaseDashboardUrl(
      storeConfig?.supabase.dashboardUrl ?? null,
      storeConfig?.supabase.url ?? storeRow.supabase_url
    ),
    r2BucketName: storeRow.r2_bucket_name,
    r2PublicUrl: storeRow.r2_public_url,
    r2ManagedDomain: storeRow.r2_managed_domain,
    bootstrap: (metadata.bootstrap as Record<string, unknown> | null) ?? null,
    features: Array.isArray(metadata.features) ? (metadata.features as string[]) : [],
    affiliateAssignments: accessRows.map((access) => ({
      profileId: access.profile_id,
      email: profileMap.get(access.profile_id)?.email ?? "unknown",
      fullName: profileMap.get(access.profile_id)?.full_name ?? null,
      commissionRate: access.commission_rate
    })),
    storeAdmins,
    recentActivity
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

  const storeConfig = getStoreConfig(input.storeSlug);

  if (!storeConfig) {
    throw new Error("Store konfigurasyonu bulunamadi.");
  }

  const client = await createStoreServiceClient(storeConfig);

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
      password,
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
    .select("id, slug, metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (currentStoreError || !currentStoreData) {
    throw new Error("Guncellenecek proje bulunamadi.");
  }

  const currentStore = currentStoreData as Pick<OwnerStoreRow, "id" | "slug" | "metadata">;
  const metadata = buildNextMetadata(currentStore.metadata ?? null, input);
  const { error } = await serviceClient
    .from("owner_stores")
    .update({
      status: input.status,
      tagline: readOptionalString(input.tagline) ?? null,
      support_email: readOptionalString(input.supportEmail) ?? null,
      support_phone: readOptionalString(input.supportPhone) ?? null,
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
      status: input.status,
      lifecycleStage: input.lifecycleStage ?? DEFAULT_MANAGEMENT.lifecycleStage,
      priority: input.priority ?? DEFAULT_MANAGEMENT.priority,
      internalOwner: input.internalOwner ?? null
    }
  });
}
