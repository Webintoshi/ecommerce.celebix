import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getDefaultAdminDeploymentBranch,
  getDefaultStorefrontDeploymentBranch,
  getRepoRoot,
  getStoreConfig,
  getStores,
  type StoreConfig,
  type StoreRegistryEntry,
} from "@celebix/platform-config";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";

interface OwnerStoreAuthorityRow {
  slug: string;
  name: string;
  status: "draft" | "active" | "paused";
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
  storefront_status: "not_started" | "scaffolded" | "active";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function inferSupabaseProvider(row: OwnerStoreAuthorityRow): "managed" | "self_hosted_coolify" {
  if (
    row.supabase_project_ref?.startsWith("coolify:") ||
    row.supabase_url?.includes("sslip.io") ||
    row.supabase_url?.includes("supabasekong-")
  ) {
    return "self_hosted_coolify";
  }

  return "managed";
}

function buildRecoveredStoreConfig(row: OwnerStoreAuthorityRow): StoreConfig {
  const metadata = asRecord(row.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const storefront = asRecord(metadata.storefront);
  const features = readStringArray(metadata.features);
  const themeKey = readOptionalString(row.theme_key) ?? "atelier";
  const themeLabel = readOptionalString(row.theme_label) ?? themeKey[0].toUpperCase() + themeKey.slice(1);
  const supabaseProvider = inferSupabaseProvider(row);
  const storefrontRuntimeUrl =
    readOptionalString(storefront.runtimeUrl) ?? `https://${row.storefront_domain}`;
  const adminRuntimeUrl =
    readOptionalString(bootstrap.adminDeploymentRuntimeUrl) ?? `https://${row.admin_domain}`;
  const adminDeploymentBranch =
    readOptionalString(bootstrap.adminDeploymentBranch) ?? getDefaultAdminDeploymentBranch();
  const storefrontDeploymentBranch =
    readOptionalString(storefront.deploymentBranch) ?? getDefaultStorefrontDeploymentBranch(row.slug);

  return {
    name: row.name,
    slug: row.slug,
    status: row.status,
    theme: {
      key: themeKey,
      label: themeLabel,
      primaryColor: "#1f2937",
      accentColor: "#ea580c",
      surfaceColor: "#f8fafc",
      headingFont: "\"Times New Roman\", serif",
      bodyFont: "system-ui, sans-serif",
    },
    branding: {
      tagline: row.tagline ?? `${row.name} icin ortak Celebix commerce kurulumu`,
      supportEmail: row.support_email ?? `destek@${row.storefront_domain}`,
      supportPhone: row.support_phone ?? "+90 532 000 00 00",
      senderEmail: `noreply@${row.storefront_domain}`,
      smsSenderTitle: row.slug.replace(/-/g, "").slice(0, 11).toUpperCase(),
      defaultProductBrand: row.name,
    },
    domains: {
      storefront: row.storefront_domain,
      admin: row.admin_domain,
    },
    owner: {
      createdBy: "owner-panel",
      notes: "Owner authority kaydindan geri yuklendi.",
    },
    supabase: {
      projectRef: row.supabase_project_ref ?? "pending-owner-bootstrap",
      url: row.supabase_url ?? "configure-in-env",
      provider: supabaseProvider,
      storage: "separate-project-per-store",
      dashboardUrl: readOptionalString(bootstrap.supabaseDashboardUrl) ?? undefined,
    },
    r2: {
      bucketName: row.r2_bucket_name ?? undefined,
      publicUrl: row.r2_public_url ?? undefined,
      managedDomain: row.r2_managed_domain ?? undefined,
      provisionedAt: readOptionalString(bootstrap.provisionedAt) ?? row.updated_at,
      lastProvisionError: readOptionalString(bootstrap.lastProvisionError) ?? undefined,
      provisioning:
        (readOptionalString(bootstrap.r2Provisioning) as "pending-owner-env" | "configured" | "failed" | null) ??
        (row.r2_bucket_name ? "configured" : "pending-owner-env"),
    },
    bootstrap: {
      createdAt: readOptionalString(bootstrap.createdAt) ?? row.created_at,
      envTemplatePath: `stores/${row.slug}/admin.env.example`,
      adminEnvLocalPath: readOptionalString(bootstrap.adminEnvLocalPath) ?? `stores/${row.slug}/admin.env.local`,
      adminDeploymentProvider: "coolify",
      adminDeploymentName: readOptionalString(bootstrap.adminDeploymentName) ?? `${row.slug}-admin`,
      adminDeploymentBranch,
      adminDeploymentRuntimeUrl: adminRuntimeUrl,
      adminDeploymentResourceId: readOptionalString(bootstrap.adminDeploymentResourceId) ?? undefined,
      adminDeploymentStatus:
        (readOptionalString(bootstrap.adminDeploymentStatus) as
          | "pending-owner-env"
          | "prepared"
          | "configured"
          | "failed"
          | null) ?? "pending-owner-env",
      adminDeploymentPreparedAt: readOptionalString(bootstrap.adminDeploymentPreparedAt) ?? undefined,
      adminDeploymentDeployedAt: readOptionalString(bootstrap.adminDeploymentDeployedAt) ?? undefined,
      adminDeploymentLastError: readOptionalString(bootstrap.adminDeploymentLastError) ?? undefined,
      organizationSlug: readOptionalString(bootstrap.organizationSlug) ?? undefined,
      supabaseProvider,
      supabaseProjectName: readOptionalString(bootstrap.supabaseProjectName) ?? row.name,
      supabaseResourceId: readOptionalString(bootstrap.supabaseResourceId) ?? undefined,
      supabaseDashboardUrl: readOptionalString(bootstrap.supabaseDashboardUrl) ?? undefined,
      provisionedAt: readOptionalString(bootstrap.provisionedAt) ?? row.updated_at,
      lastProvisionError: readOptionalString(bootstrap.lastProvisionError) ?? undefined,
      supabaseProvisioning:
        (readOptionalString(bootstrap.supabaseProvisioning) as
          | "pending-owner-env"
          | "configured"
          | "failed"
          | null) ?? (row.supabase_project_ref ? "configured" : "pending-owner-env"),
    },
    storefront: {
      appDir: row.storefront_app_dir ?? undefined,
      status: row.storefront_status,
      lastScaffoldedAt: readOptionalString(storefront.lastScaffoldedAt) ?? row.updated_at,
      lastScaffoldError: readOptionalString(storefront.lastScaffoldError) ?? undefined,
      repoSyncStatus:
        (readOptionalString(storefront.repoSyncStatus) as "pending" | "synced" | "failed" | null) ?? "pending",
      repoSyncedAt: readOptionalString(storefront.repoSyncedAt) ?? undefined,
      repoCommitSha: readOptionalString(storefront.repoCommitSha) ?? undefined,
      lastRepoSyncError: readOptionalString(storefront.lastRepoSyncError) ?? undefined,
      deploymentProvider: "coolify",
      deploymentName: readOptionalString(storefront.deploymentName) ?? `${row.slug}-storefront`,
      deploymentBranch: storefrontDeploymentBranch,
      runtimeUrl: storefrontRuntimeUrl,
      resourceId: readOptionalString(storefront.resourceId) ?? undefined,
      deploymentStatus:
        (readOptionalString(storefront.deploymentStatus) as
          | "pending-owner-env"
          | "pending-repo-sync"
          | "prepared"
          | "configured"
          | "failed"
          | null) ?? "pending-owner-env",
      preparedAt: readOptionalString(storefront.preparedAt) ?? undefined,
      deployedAt: readOptionalString(storefront.deployedAt) ?? undefined,
      lastDeploymentError: readOptionalString(storefront.lastDeploymentError) ?? undefined,
    },
    features:
      features.length > 0
        ? features
        : ["catalog", "orders", "customers", "discounts", "cms", "frontend_from_existing_store"],
  };
}

function mergeRecoveredAuthorityIntoExistingConfig(
  existing: StoreConfig,
  recovered: StoreConfig,
): StoreConfig {
  return {
    ...existing,
    name: recovered.name,
    slug: recovered.slug,
    status: recovered.status,
    theme: {
      ...existing.theme,
      key: recovered.theme.key || existing.theme.key,
      label: recovered.theme.label || existing.theme.label,
    },
    branding: {
      ...(existing.branding ?? {}),
      supportEmail: recovered.branding?.supportEmail ?? existing.branding?.supportEmail,
      supportPhone: recovered.branding?.supportPhone ?? existing.branding?.supportPhone,
      tagline: recovered.branding?.tagline ?? existing.branding?.tagline,
      senderEmail: existing.branding?.senderEmail ?? recovered.branding?.senderEmail,
      smsSenderTitle: existing.branding?.smsSenderTitle ?? recovered.branding?.smsSenderTitle,
      defaultProductBrand:
        existing.branding?.defaultProductBrand ?? recovered.branding?.defaultProductBrand,
    },
    domains: recovered.domains,
    owner: existing.owner ?? recovered.owner,
    supabase: {
      ...existing.supabase,
      ...recovered.supabase,
      dashboardUrl: recovered.supabase.dashboardUrl ?? existing.supabase.dashboardUrl,
    },
    r2: {
      ...(existing.r2 ?? {}),
      ...(recovered.r2 ?? {}),
      bucketName: recovered.r2?.bucketName ?? existing.r2?.bucketName,
      publicUrl: recovered.r2?.publicUrl ?? existing.r2?.publicUrl,
      managedDomain: recovered.r2?.managedDomain ?? existing.r2?.managedDomain,
      provisionedAt: recovered.r2?.provisionedAt ?? existing.r2?.provisionedAt,
      lastProvisionError: recovered.r2?.lastProvisionError ?? existing.r2?.lastProvisionError,
      provisioning: recovered.r2?.provisioning ?? existing.r2?.provisioning,
    },
    bootstrap: recovered.bootstrap
      ? {
          ...(existing.bootstrap ?? {}),
          ...recovered.bootstrap,
          createdAt: existing.bootstrap?.createdAt ?? recovered.bootstrap.createdAt,
          envTemplatePath:
            existing.bootstrap?.envTemplatePath ?? recovered.bootstrap.envTemplatePath,
          adminEnvLocalPath:
            existing.bootstrap?.adminEnvLocalPath ?? recovered.bootstrap.adminEnvLocalPath,
          coolifyProjectName:
            existing.bootstrap?.coolifyProjectName ?? recovered.bootstrap.coolifyProjectName,
          adminDeploymentLastError:
            recovered.bootstrap.adminDeploymentLastError ??
            existing.bootstrap?.adminDeploymentLastError,
          lastProvisionError:
            recovered.bootstrap.lastProvisionError ?? existing.bootstrap?.lastProvisionError,
        }
      : existing.bootstrap,
    storefront: recovered.storefront
      ? {
          ...(existing.storefront ?? {}),
          ...recovered.storefront,
          appDir: recovered.storefront.appDir ?? existing.storefront?.appDir,
          lastScaffoldedAt:
            recovered.storefront.lastScaffoldedAt ?? existing.storefront?.lastScaffoldedAt,
          lastScaffoldError:
            recovered.storefront.lastScaffoldError ?? existing.storefront?.lastScaffoldError,
          lastRepoSyncError:
            recovered.storefront.lastRepoSyncError ?? existing.storefront?.lastRepoSyncError,
          lastDeploymentError:
            recovered.storefront.lastDeploymentError ?? existing.storefront?.lastDeploymentError,
        }
      : existing.storefront,
    features: existing.features.length > 0 ? existing.features : recovered.features,
  };
}

function ensureRegistryEntry(config: StoreConfig): void {
  const repoRoot = getRepoRoot();
  const registryPath = path.join(repoRoot, "stores", "registry.json");
  const currentRegistry = getStores();
  const nextEntry: StoreRegistryEntry = {
    slug: config.slug,
    name: config.name,
    domain: config.domains.storefront,
    theme: config.theme.key,
    status: config.status,
  };
  const nextRegistry = currentRegistry.filter((entry) => entry.slug !== config.slug);
  nextRegistry.push(nextEntry);
  nextRegistry.sort((left, right) => left.name.localeCompare(right.name, "tr"));
  fs.writeFileSync(registryPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, "utf8");
}

function ensureAdminEnvTemplate(config: StoreConfig): void {
  const repoRoot = getRepoRoot();
  const storeDirectory = path.join(repoRoot, "stores", config.slug);
  const envTemplatePath = path.join(storeDirectory, "admin.env.example");

  if (fs.existsSync(envTemplatePath)) {
    return;
  }

  const lines = [
    `STORE_SLUG=${config.slug}`,
    "NEXT_PUBLIC_SUPABASE_URL=configure-in-env",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=configure-in-env",
    "SUPABASE_SERVICE_ROLE_KEY=configure-in-env",
    `NEXT_PUBLIC_STORE_DOMAIN=${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_DOMAIN=${config.domains.admin}`,
    `NEXT_PUBLIC_SITE_URL=https://${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_URL=https://${config.domains.admin}`,
    "",
  ];
  fs.writeFileSync(envTemplatePath, lines.join("\n"), "utf8");
}

export async function ensureStoreConfigFromOwnerAuthority(slug: string): Promise<StoreConfig> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select(
      "slug, name, status, theme_key, theme_label, storefront_domain, admin_domain, support_email, support_phone, tagline, supabase_project_ref, supabase_url, r2_bucket_name, r2_public_url, r2_managed_domain, storefront_app_dir, storefront_status, metadata, created_at, updated_at",
    )
    .eq("slug", slug)
    .maybeSingle<OwnerStoreAuthorityRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`"${slug}" icin owner authority kaydi bulunamadi.`);
  }

  const existing = getStoreConfig(slug);
  const recovered = buildRecoveredStoreConfig(data);
  const config = existing
    ? mergeRecoveredAuthorityIntoExistingConfig(existing, recovered)
    : recovered;
  const repoRoot = getRepoRoot();
  const storeDirectory = path.join(repoRoot, "stores", slug);
  const configPath = path.join(storeDirectory, "store.config.json");

  fs.mkdirSync(storeDirectory, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  ensureRegistryEntry(config);
  ensureAdminEnvTemplate(config);

  return config;
}
