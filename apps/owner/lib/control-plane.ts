import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import type { OwnerAuthContext, OwnerProfile } from "@/lib/owner-auth";
import {
  getRepoRoot,
  getStoreConfig,
  getStores,
  type StoreConfig,
  type StorefrontStatus
} from "@celebix/platform-config";

type OwnerStoreStatus = "draft" | "active" | "paused";

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

interface StoreMetricsSnapshot {
  productCount: number;
  orderCount: number;
  customerCount: number;
  pendingOrderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  lastSyncedAt: string;
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
  commissionRate: number | null;
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
  r2BucketName: string | null;
  r2PublicUrl: string | null;
  r2ManagedDomain: string | null;
  bootstrap: Record<string, unknown> | null;
  features: string[];
  ownerNotes: string | null;
  affiliateAssignments: Array<{
    profileId: string;
    email: string;
    fullName: string | null;
    commissionRate: number;
  }>;
  storeAdmins: StoreAdminSummary[];
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

function createStoreServiceClient(store: StoreConfig): SupabaseClient | null {
  const envMap = parseEnvFile(resolveStoreEnvPath(store));
  const url = envMap.NEXT_PUBLIC_SUPABASE_URL || store.supabase.url;
  const serviceKey = envMap.SUPABASE_SERVICE_ROLE_KEY;

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
  const client = createStoreServiceClient(store);

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
  const client = createStoreServiceClient(store);

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

function buildOwnerStoreRow(store: StoreConfig) {
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
    metadata: {
      bootstrap: store.bootstrap ?? null,
      features: store.features,
      owner: store.owner ?? null
    }
  };
}

function mapDashboardStore(
  store: OwnerStoreRow,
  metric: OwnerMetricRow | undefined,
  commissionRate: number | null
): DashboardStoreSummary {
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
    productCount: metric?.product_count ?? 0,
    orderCount: metric?.order_count ?? 0,
    customerCount: metric?.customer_count ?? 0,
    pendingOrderCount: metric?.pending_order_count ?? 0,
    totalRevenue: metric?.total_revenue ?? 0,
    averageOrderValue: metric?.average_order_value ?? 0,
    lastSyncedAt: metric?.last_synced_at ?? null,
    commissionRate
  };
}

export async function syncOwnerStoresAndMetrics(): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const storeConfigs = getStores()
    .map((store) => getStoreConfig(store.slug))
    .filter((store): store is StoreConfig => Boolean(store));

  if (storeConfigs.length === 0) {
    return;
  }

  const { error: upsertStoresError } = await serviceClient
    .from("owner_stores")
    .upsert(storeConfigs.map(buildOwnerStoreRow), { onConflict: "slug" });

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
  const serviceClient = createOwnerServiceClient();
  await syncOwnerStoresAndMetrics();

  const isSuperAdmin = context.profile.role === "super_admin";
  let accessRows: OwnerStoreAccessRow[] = [];

  if (!isSuperAdmin) {
    const { data, error } = await serviceClient
      .from("owner_store_access")
      .select("id, profile_id, store_id, commission_rate, created_at")
      .eq("profile_id", context.user.id);

    if (error) {
      throw new Error(error.message);
    }

    accessRows = (data as OwnerStoreAccessRow[]) ?? [];
  }

  if (!isSuperAdmin && accessRows.length === 0) {
    return [];
  }

  const storeQuery = serviceClient
    .from("owner_stores")
    .select("*")
    .order("updated_at", { ascending: false });

  const { data: storesData, error: storesError } = isSuperAdmin
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
    return [];
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
  const accessMap = new Map(accessRows.map((row) => [row.store_id, row.commission_rate]));

  return stores.map((store) => mapDashboardStore(store, metricsMap.get(store.id), isSuperAdmin ? null : accessMap.get(store.id) ?? null));
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

  return {
    ...current,
    supportEmail: storeRow.support_email,
    supportPhone: storeRow.support_phone,
    tagline: storeRow.tagline,
    supabaseProjectRef: storeRow.supabase_project_ref,
    supabaseUrl: storeRow.supabase_url,
    r2BucketName: storeRow.r2_bucket_name,
    r2PublicUrl: storeRow.r2_public_url,
    r2ManagedDomain: storeRow.r2_managed_domain,
    bootstrap: (metadata.bootstrap as Record<string, unknown> | null) ?? null,
    features: Array.isArray(metadata.features) ? (metadata.features as string[]) : [],
    ownerNotes:
      metadata.owner && typeof metadata.owner === "object" && "notes" in metadata.owner
        ? String((metadata.owner as Record<string, unknown>).notes ?? "")
        : null,
    affiliateAssignments: accessRows.map((access) => ({
      profileId: access.profile_id,
      email: profileMap.get(access.profile_id)?.email ?? "unknown",
      fullName: profileMap.get(access.profile_id)?.full_name ?? null,
      commissionRate: access.commission_rate
    })),
    storeAdmins
  };
}

export async function createOrAssignAffiliate(input: {
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
    .select("id, slug")
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

  const client = createStoreServiceClient(storeConfig);

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

  return {
    userId,
    email: normalizedEmail,
    created
  };
}
