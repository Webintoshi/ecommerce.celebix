import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  getStoreConfig,
  requireStoreConfig,
  getStores,
  resolveLightPostgresDefaultSslMode,
  updateStoreConfig,
} from "@celebix/platform-config";
import {
  buildDefaultStoreAnalyticsConfig,
  buildDefaultStoreAuthConfig,
  buildDefaultStorePaymentsConfig,
  applyStorefrontAuthorityPatchToConfig,
  getDefaultAdminDeploymentBranch,
  getExpectedStorefrontAppDir,
  resolveAuthorityRepositoryBranch,
  resolveStorefrontRepositoryBranch,
  type StoreConfig,
  type StoreSmokeReport,
  type StorefrontStatus,
  type StoreRegistryEntry,
  type StorefrontAuthorityPatchInput,
} from "../../../packages/platform-config/src/index";
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

function readStorefrontStatus(value: unknown): StorefrontStatus | null {
  return value === "not_started" || value === "scaffolded" || value === "active" ? value : null;
}

function scoreStorefrontStatus(value: StorefrontStatus | null | undefined): number {
  switch (value) {
    case "active":
      return 2;
    case "scaffolded":
      return 1;
    default:
      return 0;
  }
}

function resolveRecoveredStorefrontAppDir(
  row: Pick<OwnerStoreAuthorityRow, "slug" | "storefront_app_dir">,
  storefrontMetadata: Record<string, unknown>,
): string | null {
  return (
    readOptionalString(row.storefront_app_dir) ??
    readOptionalString(storefrontMetadata.appDir) ??
    (readStorefrontStatus(storefrontMetadata.status) === "scaffolded" ||
    readStorefrontStatus(storefrontMetadata.status) === "active"
      ? getExpectedStorefrontAppDir(row.slug)
      : null)
  );
}

function resolveRecoveredStorefrontStatus(
  row: Pick<OwnerStoreAuthorityRow, "storefront_status">,
  storefrontMetadata: Record<string, unknown>,
): StorefrontStatus {
  const metadataStatus = readStorefrontStatus(storefrontMetadata.status);
  return scoreStorefrontStatus(metadataStatus) > scoreStorefrontStatus(row.storefront_status)
    ? (metadataStatus ?? row.storefront_status)
    : row.storefront_status;
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

function inferDatabaseMode(row: OwnerStoreAuthorityRow, metadata: Record<string, unknown>): "light_postgres" | "full_supabase" {
  const explicit = readOptionalString(metadata.databaseMode);

  if (explicit === "full_supabase") {
    return "full_supabase";
  }

  if (explicit === "light_postgres") {
    return "light_postgres";
  }

  return row.supabase_project_ref || row.supabase_url ? "full_supabase" : "light_postgres";
}

function buildRecoveredStoreConfig(row: OwnerStoreAuthorityRow): StoreConfig {
  const metadata = asRecord(row.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const storefront = asRecord(metadata.storefront);
  const lightPostgres = asRecord(metadata.lightPostgres);
  const features = readStringArray(metadata.features);
  const themeKey = readOptionalString(row.theme_key) ?? "atelier";
  const themeLabel = readOptionalString(row.theme_label) ?? themeKey[0].toUpperCase() + themeKey.slice(1);
  const supabaseProvider = inferSupabaseProvider(row);
  const databaseMode = inferDatabaseMode(row, metadata);
  const recoveredStorefrontAppDir = resolveRecoveredStorefrontAppDir(row, storefront);
  const recoveredStorefrontStatus = resolveRecoveredStorefrontStatus(row, storefront);
  const storefrontRuntimeUrl =
    readOptionalString(storefront.runtimeUrl) ?? `https://${row.storefront_domain}`;
  const adminRuntimeUrl =
    readOptionalString(bootstrap.adminDeploymentRuntimeUrl) ?? `https://${row.admin_domain}`;
  const auth = asRecord(metadata.auth);
  const analytics = asRecord(metadata.analytics);
  const logto = asRecord(metadata.logto);
  const umami = asRecord(metadata.umami);
  const r2 = asRecord(metadata.r2);
  const media = asRecord(metadata.media);
  const readiness = asRecord(metadata.readiness);
  const smoke = asRecord(metadata.smoke);
  const payments = asRecord(metadata.payments);
  const defaultAuth = buildDefaultStoreAuthConfig(databaseMode);
  const defaultAnalytics = buildDefaultStoreAnalyticsConfig();
  const defaultPayments = buildDefaultStorePaymentsConfig();
  const newStandardSelected = databaseMode === "light_postgres";

  return {
    name: row.name,
    slug: row.slug,
    status: row.status,
    databaseMode,
    authProvider: newStandardSelected ? "logto" : "supabase",
    customerAuthProvider: newStandardSelected ? "logto" : "supabase",
    analyticsProvider: "umami",
    storageProvider: newStandardSelected ? "r2" : "supabase",
    supabaseStatus: newStandardSelected ? "none" : "legacy",
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
      demo: readOptionalString(asRecord(metadata.domains).demo) ?? `${row.slug}.demo.celebix.co`,
    },
    owner: {
      createdBy: "owner-panel",
      notes: "Owner authority kaydindan geri yuklendi.",
      legacyModeSelected:
        typeof asRecord(metadata.owner).legacyModeSelected === "boolean"
          ? Boolean(asRecord(metadata.owner).legacyModeSelected)
          : databaseMode === "full_supabase",
      standardProfile:
        readOptionalString(asRecord(metadata.owner).standardProfile) === "legacy_supabase"
          ? "legacy_supabase"
          : databaseMode === "full_supabase"
            ? "legacy_supabase"
            : "celebix_new_standard",
    },
    lightPostgres: {
      cluster: readOptionalString(lightPostgres.cluster) ?? "celebix-light-postgres",
      databaseName: readOptionalString(lightPostgres.databaseName) ?? row.slug,
      schemaProfile: "storefront_core",
      provisioning:
        (readOptionalString(lightPostgres.provisioning) as
          | "pending-owner-env"
          | "configured"
          | "failed"
          | null) ??
        (databaseMode === "light_postgres" ? "pending-owner-env" : "configured"),
      provisionedAt: readOptionalString(lightPostgres.provisionedAt) ?? undefined,
      lastProvisionError: readOptionalString(lightPostgres.lastProvisionError) ?? undefined,
      umamiReady:
        typeof lightPostgres.umamiReady === "boolean"
          ? Boolean(lightPostgres.umamiReady)
          : true,
    },
    auth: {
      provider:
        readOptionalString(auth.provider) === "supabase"
          ? "supabase"
          : defaultAuth.provider,
      status:
        readOptionalString(auth.status) === "configured"
          ? "configured"
          : defaultAuth.status,
      mode:
        readOptionalString(auth.mode) === "legacy_supabase_auth"
          ? "legacy_supabase_auth"
          : defaultAuth.mode,
      requiredAction:
        readOptionalString(auth.requiredAction) ?? defaultAuth.requiredAction,
      blocking:
        typeof auth.blocking === "boolean" ? Boolean(auth.blocking) : false,
    },
    analytics: {
      provider: defaultAnalytics.provider,
      status:
        readOptionalString(analytics.status) === "configured"
          ? "configured"
          : defaultAnalytics.status,
      mode: defaultAnalytics.mode,
      websiteId: readOptionalString(analytics.websiteId) ?? undefined,
      requiredAction:
        readOptionalString(analytics.requiredAction) ?? defaultAnalytics.requiredAction,
      blocking:
        typeof analytics.blocking === "boolean" ? Boolean(analytics.blocking) : false,
    },
    logto: {
      adminAppStatus:
        readOptionalString(logto.adminAppStatus) === "configured" ||
        readOptionalString(logto.adminAppStatus) === "failed"
          ? (readOptionalString(logto.adminAppStatus) as "configured" | "failed")
          : newStandardSelected
            ? "pending"
            : "skipped",
      customerAppStatus:
        readOptionalString(logto.customerAppStatus) === "configured" ||
        readOptionalString(logto.customerAppStatus) === "failed"
          ? (readOptionalString(logto.customerAppStatus) as "configured" | "failed")
          : newStandardSelected
            ? "pending"
            : "skipped",
      adminAppId: readOptionalString(logto.adminAppId),
      adminClientId: readOptionalString(logto.adminClientId),
      customerAppId: readOptionalString(logto.customerAppId),
      customerClientId: readOptionalString(logto.customerClientId),
      adminIssuer: readOptionalString(logto.adminIssuer) ?? "https://auth.celebix.co/oidc",
      customerIssuer: readOptionalString(logto.customerIssuer) ?? "https://auth.celebix.co/oidc",
      adminRedirectUris: readStringArray(logto.adminRedirectUris),
      adminPostLogoutRedirectUris: readStringArray(logto.adminPostLogoutRedirectUris),
      adminOrigins: readStringArray(logto.adminOrigins),
      customerRedirectUris: readStringArray(logto.customerRedirectUris),
      customerPostLogoutRedirectUris: readStringArray(logto.customerPostLogoutRedirectUris),
      customerOrigins: readStringArray(logto.customerOrigins),
      googleSignIn:
        readOptionalString(logto.googleSignIn) === "enabled" ||
        readOptionalString(logto.googleSignIn) === "unavailable"
          ? (readOptionalString(logto.googleSignIn) as "enabled" | "unavailable")
          : "pending",
      emailRecovery:
        readOptionalString(logto.emailRecovery) === "enabled" ||
        readOptionalString(logto.emailRecovery) === "unavailable"
          ? (readOptionalString(logto.emailRecovery) as "enabled" | "unavailable")
          : "pending",
      adminBootstrapConfigPath: readOptionalString(logto.adminBootstrapConfigPath) ?? undefined,
      customerBootstrapConfigPath: readOptionalString(logto.customerBootstrapConfigPath) ?? undefined,
      bootstrapApplyState:
        readOptionalString(logto.bootstrapApplyState) === "applied" ||
        readOptionalString(logto.bootstrapApplyState) === "failed"
          ? (readOptionalString(logto.bootstrapApplyState) as "applied" | "failed")
          : "pending",
      lastProvisionError: readOptionalString(logto.lastProvisionError) ?? undefined,
    },
    umami: {
      websiteStatus:
        readOptionalString(umami.websiteStatus) === "configured" ||
        readOptionalString(umami.websiteStatus) === "failed"
          ? (readOptionalString(umami.websiteStatus) as "configured" | "failed")
          : "pending",
      websiteId:
        readOptionalString(umami.websiteId) ??
        readOptionalString(analytics.websiteId),
      websiteName: readOptionalString(umami.websiteName) ?? `${row.name} Storefront`,
      domain: readOptionalString(umami.domain) ?? row.storefront_domain,
      canonicalDomain: readOptionalString(umami.canonicalDomain) ?? row.storefront_domain,
      host: readOptionalString(umami.host) ?? "https://analytics.celebix.co",
      apiUrl: readOptionalString(umami.apiUrl) ?? "https://analytics.celebix.co/api",
      scriptUrl: readOptionalString(umami.scriptUrl) ?? "https://analytics.celebix.co/script.js",
      timezone: readOptionalString(umami.timezone) ?? "Europe/Istanbul",
      storefrontTrackingStatus:
        readOptionalString(umami.storefrontTrackingStatus) === "configured" ||
        readOptionalString(umami.storefrontTrackingStatus) === "failed"
          ? (readOptionalString(umami.storefrontTrackingStatus) as "configured" | "failed")
          : "pending",
      adminAnalyticsStatus:
        readOptionalString(umami.adminAnalyticsStatus) === "configured" ||
        readOptionalString(umami.adminAnalyticsStatus) === "failed"
          ? (readOptionalString(umami.adminAnalyticsStatus) as "configured" | "failed")
          : "pending",
      serverTokenStatus:
        readOptionalString(umami.serverTokenStatus) === "configured" ||
        readOptionalString(umami.serverTokenStatus) === "not-required"
          ? (readOptionalString(umami.serverTokenStatus) as "configured" | "not-required")
          : "pending-owner-env",
      adminSummaryEndpoint:
        readOptionalString(umami.adminSummaryEndpoint) ?? "/api/admin/analytics/summary",
      metrics: readStringArray(umami.metrics),
      bootstrapConfigPath: readOptionalString(umami.bootstrapConfigPath) ?? undefined,
      bootstrapApplyState:
        readOptionalString(umami.bootstrapApplyState) === "applied" ||
        readOptionalString(umami.bootstrapApplyState) === "failed"
          ? (readOptionalString(umami.bootstrapApplyState) as "applied" | "failed")
          : "pending",
      lastProvisionError: readOptionalString(umami.lastProvisionError) ?? undefined,
    },
    readiness: {
      database:
        readOptionalString(readiness.database) === "ready" ||
        readOptionalString(readiness.database) === "failed"
          ? (readOptionalString(readiness.database) as "ready" | "failed")
          : "pending",
      storage:
        readOptionalString(readiness.storage) === "ready" ||
        readOptionalString(readiness.storage) === "failed"
          ? (readOptionalString(readiness.storage) as "ready" | "failed")
          : "pending",
      auth:
        readOptionalString(readiness.auth) === "ready" ||
        readOptionalString(readiness.auth) === "failed"
          ? (readOptionalString(readiness.auth) as "ready" | "failed")
          : "pending",
      analytics:
        readOptionalString(readiness.analytics) === "ready" ||
        readOptionalString(readiness.analytics) === "failed"
          ? (readOptionalString(readiness.analytics) as "ready" | "failed")
          : "pending",
      admin:
        readOptionalString(readiness.admin) === "ready" ||
        readOptionalString(readiness.admin) === "failed"
          ? (readOptionalString(readiness.admin) as "ready" | "failed")
          : "pending",
      storefront:
        readOptionalString(readiness.storefront) === "ready" ||
        readOptionalString(readiness.storefront) === "failed"
          ? (readOptionalString(readiness.storefront) as "ready" | "failed")
          : "pending",
      smoke:
        readOptionalString(readiness.smoke) === "ready" ||
        readOptionalString(readiness.smoke) === "failed"
          ? (readOptionalString(readiness.smoke) as "ready" | "failed")
          : "pending",
    },
    smoke: Object.keys(smoke).length > 0 ? (smoke as unknown as StoreSmokeReport) : undefined,
    payments: {
      status:
        readOptionalString(payments.status) === "configured"
          ? "configured"
          : defaultPayments.status,
      defaultProvider:
        readOptionalString(payments.defaultProvider) === "none"
          ? "none"
          : defaultPayments.defaultProvider,
      requiredAction:
        readOptionalString(payments.requiredAction) ?? defaultPayments.requiredAction,
      blocking:
        typeof payments.blocking === "boolean" ? Boolean(payments.blocking) : false,
    },
    supabase: {
      projectRef: row.supabase_project_ref ?? "pending-owner-bootstrap",
      url: row.supabase_url ?? "configure-in-env",
      provider: supabaseProvider,
      storage:
        databaseMode === "full_supabase"
          ? "separate-project-per-store"
          : "disabled-by-database-mode",
      dashboardUrl: readOptionalString(bootstrap.supabaseDashboardUrl) ?? undefined,
    },
    r2: {
      status: row.r2_bucket_name ? "configured" : newStandardSelected ? "pending" : "skipped",
      bucketName: row.r2_bucket_name ?? readOptionalString(r2.bucketName) ?? undefined,
      publicUrl: row.r2_public_url ?? readOptionalString(r2.publicUrl) ?? undefined,
      managedDomain: row.r2_managed_domain ?? readOptionalString(r2.managedDomain) ?? undefined,
      endpoint: readOptionalString(r2.endpoint) ?? undefined,
      region: readOptionalString(r2.region) ?? "auto",
      prefix: readOptionalString(r2.prefix) ?? `stores/${row.slug}/`,
      uploadPrefix: readOptionalString(r2.uploadPrefix) ?? `stores/${row.slug}/uploads/`,
      productImagesPrefix:
        readOptionalString(r2.productImagesPrefix) ?? `stores/${row.slug}/products/`,
      pageImagesPrefix: readOptionalString(r2.pageImagesPrefix) ?? `stores/${row.slug}/pages/`,
      brandingPrefix: readOptionalString(r2.brandingPrefix) ?? `stores/${row.slug}/branding/`,
      publicUrlTemplate:
        readOptionalString(r2.publicUrlTemplate) ??
        (row.r2_public_url ? `${row.r2_public_url.replace(/\/+$/, "")}/{key}` : undefined),
      adminUploadStatus:
        readOptionalString(r2.adminUploadStatus) === "configured" ||
        readOptionalString(r2.adminUploadStatus) === "failed"
          ? (readOptionalString(r2.adminUploadStatus) as "configured" | "failed")
          : "pending",
      storefrontReadStatus:
        readOptionalString(r2.storefrontReadStatus) === "configured" ||
        readOptionalString(r2.storefrontReadStatus) === "failed"
          ? (readOptionalString(r2.storefrontReadStatus) as "configured" | "failed")
          : "pending",
      credentialsStatus:
        readOptionalString(r2.credentialsStatus) === "configured" ||
        readOptionalString(r2.credentialsStatus) === "not-required"
          ? (readOptionalString(r2.credentialsStatus) as "configured" | "not-required")
          : "pending-owner-env",
      bootstrapConfigPath:
        readOptionalString(r2.bootstrapConfigPath) ?? `infra/r2/bootstrap/generated/${row.slug}.storage.json`,
      bootstrapApplyState:
        readOptionalString(r2.bootstrapApplyState) === "applied" ||
        readOptionalString(r2.bootstrapApplyState) === "failed"
          ? (readOptionalString(r2.bootstrapApplyState) as "applied" | "failed")
          : "pending",
      noSupabaseStorage:
        typeof r2.noSupabaseStorage === "boolean" ? Boolean(r2.noSupabaseStorage) : newStandardSelected,
      provisionedAt: readOptionalString(bootstrap.provisionedAt) ?? row.updated_at,
      lastProvisionError: readOptionalString(bootstrap.lastProvisionError) ?? undefined,
      provisioning:
        (readOptionalString(bootstrap.r2Provisioning) as "pending-owner-env" | "configured" | "failed" | null) ??
        (row.r2_bucket_name ? "configured" : "pending-owner-env"),
    },
    media: {
      provider: "r2",
      status: row.r2_bucket_name ? "configured" : newStandardSelected ? "pending" : "skipped",
      publicBaseUrl:
        row.r2_public_url ?? readOptionalString(media.publicBaseUrl) ?? readOptionalString(r2.publicUrl),
      prefix: readOptionalString(media.prefix) ?? readOptionalString(r2.prefix) ?? `stores/${row.slug}/`,
      uploadPrefix:
        readOptionalString(media.uploadPrefix) ??
        readOptionalString(r2.uploadPrefix) ??
        `stores/${row.slug}/uploads/`,
      productImagesPrefix:
        readOptionalString(media.productImagesPrefix) ??
        readOptionalString(r2.productImagesPrefix) ??
        `stores/${row.slug}/products/`,
      pageImagesPrefix:
        readOptionalString(media.pageImagesPrefix) ??
        readOptionalString(r2.pageImagesPrefix) ??
        `stores/${row.slug}/pages/`,
      brandingPrefix:
        readOptionalString(media.brandingPrefix) ??
        readOptionalString(r2.brandingPrefix) ??
        `stores/${row.slug}/branding/`,
      publicUrlTemplate:
        readOptionalString(media.publicUrlTemplate) ?? readOptionalString(r2.publicUrlTemplate),
      adminUploadStatus:
        readOptionalString(media.adminUploadStatus) === "configured" ||
        readOptionalString(media.adminUploadStatus) === "failed"
          ? (readOptionalString(media.adminUploadStatus) as "configured" | "failed")
          : "pending",
      storefrontReadStatus:
        readOptionalString(media.storefrontReadStatus) === "configured" ||
        readOptionalString(media.storefrontReadStatus) === "failed"
          ? (readOptionalString(media.storefrontReadStatus) as "configured" | "failed")
          : "pending",
      noSupabaseStorage:
        typeof media.noSupabaseStorage === "boolean" ? Boolean(media.noSupabaseStorage) : newStandardSelected,
    },
    bootstrap: {
      createdAt: readOptionalString(bootstrap.createdAt) ?? row.created_at,
      envTemplatePath: `stores/${row.slug}/admin.env.example`,
      adminEnvLocalPath: readOptionalString(bootstrap.adminEnvLocalPath) ?? `stores/${row.slug}/admin.env.local`,
      authorityBranch: readOptionalString(bootstrap.authorityBranch) ?? "stores/authority",
      adminDeploymentProvider: "coolify",
      adminDeploymentName: readOptionalString(bootstrap.adminDeploymentName) ?? `${row.slug}-admin`,
      adminDeploymentBranch:
        readOptionalString(bootstrap.adminDeploymentBranch) ?? getDefaultAdminDeploymentBranch(row.slug),
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
          | null) ??
        (databaseMode === "full_supabase"
          ? row.supabase_project_ref
            ? "configured"
            : "pending-owner-env"
          : "configured"),
      adminDeployment: {
        strategy:
          (readOptionalString(asRecord(bootstrap.adminDeployment).strategy) as
            | "build_server_ghcr"
            | "legacy_git_push"
            | null) ?? "build_server_ghcr",
        image:
          readOptionalString(asRecord(bootstrap.adminDeployment).image) ??
          `ghcr.io/celebixco/${row.slug}-admin`,
        imageTag:
          readOptionalString(asRecord(bootstrap.adminDeployment).imageTag) ?? "production",
        useBuildServer:
          typeof asRecord(bootstrap.adminDeployment).useBuildServer === "boolean"
            ? Boolean(asRecord(bootstrap.adminDeployment).useBuildServer)
            : true,
        buildServer:
          readOptionalString(asRecord(bootstrap.adminDeployment).buildServer) ??
          "celebix-build-01",
        watchPaths: readStringArray(asRecord(bootstrap.adminDeployment).watchPaths).length > 0
          ? readStringArray(asRecord(bootstrap.adminDeployment).watchPaths)
          : ["apps/admin/**", "packages/**"],
      },
    },
    storefront: {
      appDir: recoveredStorefrontAppDir ?? undefined,
      packageName:
        readOptionalString(storefront.packageName) ?? `@celebix/storefront-${row.slug}`,
      status: recoveredStorefrontStatus,
      lastScaffoldedAt: readOptionalString(storefront.lastScaffoldedAt) ?? row.updated_at,
      lastScaffoldError: readOptionalString(storefront.lastScaffoldError) ?? undefined,
      repoSyncStatus:
        (readOptionalString(storefront.repoSyncStatus) as "pending" | "synced" | "failed" | null) ?? "pending",
      repoSyncedAt: readOptionalString(storefront.repoSyncedAt) ?? undefined,
      lastRepoSyncedAt:
        readOptionalString(storefront.lastRepoSyncedAt) ??
        readOptionalString(storefront.repoSyncedAt) ??
        undefined,
      repoCommitSha: readOptionalString(storefront.repoCommitSha) ?? undefined,
      lastRepoSyncError: readOptionalString(storefront.lastRepoSyncError) ?? undefined,
      deploymentProvider: "coolify",
      deploymentName: readOptionalString(storefront.deploymentName) ?? `${row.slug}-storefront`,
      deploymentBranch:
        readOptionalString(storefront.deploymentBranch) ?? resolveStorefrontRepositoryBranch(row.slug),
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
      preparedAt:
        readOptionalString(storefront.preparedAt) ??
        readOptionalString(storefront.lastDeploymentPreparedAt) ??
        undefined,
      lastDeploymentPreparedAt:
        readOptionalString(storefront.lastDeploymentPreparedAt) ??
        readOptionalString(storefront.preparedAt) ??
        undefined,
      deployedAt: readOptionalString(storefront.deployedAt) ?? undefined,
      lastDeploymentError: readOptionalString(storefront.lastDeploymentError) ?? undefined,
      deployment: {
        strategy:
          (readOptionalString(asRecord(storefront.deployment).strategy) as
            | "build_server_ghcr"
            | "legacy_git_push"
            | null) ?? "build_server_ghcr",
        image:
          readOptionalString(asRecord(storefront.deployment).image) ??
          `ghcr.io/celebixco/${row.slug}-storefront`,
        imageTag:
          readOptionalString(asRecord(storefront.deployment).imageTag) ?? "production",
        useBuildServer:
          typeof asRecord(storefront.deployment).useBuildServer === "boolean"
            ? Boolean(asRecord(storefront.deployment).useBuildServer)
            : true,
        buildServer:
          readOptionalString(asRecord(storefront.deployment).buildServer) ??
          "celebix-build-01",
        watchPaths: readStringArray(asRecord(storefront.deployment).watchPaths).length > 0
          ? readStringArray(asRecord(storefront.deployment).watchPaths)
          : [`apps/storefront-${row.slug}/**`, "packages/**"],
      },
    },
    features:
      features.length > 0
        ? features
        : ["catalog", "orders", "customers", "discounts", "cms", "frontend_from_existing_store"],
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
  const lightPostgresSslMode = resolveLightPostgresDefaultSslMode();

  if (fs.existsSync(envTemplatePath)) {
    return;
  }

  const lines = [
    `STORE_SLUG=${config.slug}`,
    `DATABASE_MODE=${config.databaseMode}`,
    ...(config.databaseMode === "full_supabase"
      ? [
          "NEXT_PUBLIC_SUPABASE_URL=configure-in-env",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY=configure-in-env",
          "SUPABASE_SERVICE_ROLE_KEY=configure-in-env",
        ]
      : [
          "ADMIN_DATABASE_MODE=light_postgres",
          "DATABASE_URL=configure-per-store-database",
          "DATABASE_DIRECT_URL=configure-per-store-admin-database",
          `LIGHT_POSTGRES_DATABASE_NAME=${config.lightPostgres?.databaseName || config.slug}`,
          "LIGHT_POSTGRES_DATABASE_URL=configure-per-store-database",
          `LIGHT_POSTGRES_DATABASE_SSLMODE=${lightPostgresSslMode}`,
          `DATABASE_SSLMODE=${lightPostgresSslMode}`,
          "NEXT_PUBLIC_RUNTIME_DATABASE_MODE=light_postgres",
          "AUTH_SETUP_STATUS=blocked_auth_setup",
          "NEXT_PUBLIC_AUTH_SETUP_STATUS=blocked_auth_setup",
        ]),
    `NEXT_PUBLIC_STORE_DOMAIN=${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_DOMAIN=${config.domains.admin}`,
    `NEXT_PUBLIC_DEMO_DOMAIN=${config.domains.demo}`,
    `NEXT_PUBLIC_SITE_URL=https://${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_URL=https://${config.domains.admin}`,
    "",
  ];
  fs.writeFileSync(envTemplatePath, lines.join("\n"), "utf8");
}

export async function ensureStoreConfigFromOwnerAuthority(slug: string): Promise<StoreConfig> {
  const existing = getStoreConfig(slug);

  if (existing) {
    return existing;
  }

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

  const config = buildRecoveredStoreConfig(data);
  const repoRoot = getRepoRoot();
  const storeDirectory = path.join(repoRoot, "stores", slug);
  const configPath = path.join(storeDirectory, "store.config.json");

  fs.mkdirSync(storeDirectory, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  ensureRegistryEntry(config);
  ensureAdminEnvTemplate(config);

  return config;
}

interface StorefrontAuthorityRowSnapshot {
  storefront_app_dir: string | null;
  storefront_status: StorefrontStatus;
  metadata: Record<string, unknown> | null;
}

export async function applyStorefrontAuthorityPatch(
  slug: string,
  patch: StorefrontAuthorityPatchInput,
): Promise<StoreConfig> {
  const originalConfig = requireStoreConfig(slug);
  const serviceClient = createOwnerServiceClient();
  const { data: existingRow, error: readError } = await serviceClient
    .from("owner_stores")
    .select("storefront_app_dir, storefront_status, metadata")
    .eq("slug", slug)
    .maybeSingle<StorefrontAuthorityRowSnapshot>();

  if (readError) {
    throw new Error(readError.message);
  }

  if (!existingRow) {
    throw new Error(`"${slug}" icin owner store authority satiri bulunamadi.`);
  }

  const nextConfig = applyStorefrontAuthorityPatchToConfig(slug, patch);
  const currentMetadata = asRecord(existingRow.metadata);
  const currentStorefrontMetadata = asRecord(currentMetadata.storefront);
  const nextStorefront = nextConfig.storefront;
  const recoveredAppDir =
    nextStorefront?.appDir ??
    readOptionalString(existingRow.storefront_app_dir) ??
    readOptionalString(currentStorefrontMetadata.appDir) ??
    null;
  const nextStatus =
    nextStorefront?.status ??
    readStorefrontStatus(currentStorefrontMetadata.status) ??
    existingRow.storefront_status;
  const nextStorefrontMetadata = nextStorefront
    ? {
        ...currentStorefrontMetadata,
        ...nextStorefront,
        appDir: recoveredAppDir ?? undefined,
        status: nextStatus,
        lastRepoSyncedAt:
          nextStorefront.lastRepoSyncedAt ??
          nextStorefront.repoSyncedAt ??
          readOptionalString(currentStorefrontMetadata.lastRepoSyncedAt) ??
          readOptionalString(currentStorefrontMetadata.repoSyncedAt) ??
          undefined,
        lastDeploymentPreparedAt:
          nextStorefront.lastDeploymentPreparedAt ??
          nextStorefront.preparedAt ??
          readOptionalString(currentStorefrontMetadata.lastDeploymentPreparedAt) ??
          readOptionalString(currentStorefrontMetadata.preparedAt) ??
          undefined,
      }
    : currentStorefrontMetadata;

  try {
    const { error: updateError } = await serviceClient
      .from("owner_stores")
      .update({
        storefront_app_dir: recoveredAppDir,
        storefront_status: nextStatus,
        metadata: {
          ...currentMetadata,
          storefront: nextStorefrontMetadata,
        },
      })
      .eq("slug", slug);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return nextConfig;
  } catch (error) {
    updateStoreConfig(slug, () => originalConfig);
    throw error;
  }
}
