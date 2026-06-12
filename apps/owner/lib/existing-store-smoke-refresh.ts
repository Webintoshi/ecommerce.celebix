import "server-only";

import {
  requireStoreConfig,
  updateStoreConfig,
  type StoreConfig,
  type StoreReadinessStatus,
  type StoreSmokeCheckResult,
  type StoreSmokeReport,
} from "@celebix/platform-config";
import { validateAcceptanceRunnerSlug } from "@/lib/acceptance-runner-auth";
import { runNewStoreSmokeRunner } from "@/lib/new-store-smoke-runner";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";

export interface ExistingStoreSmokeRefreshOptions {
  dryRun?: boolean;
  updateMetadata?: boolean;
  timeoutMs?: number;
}

export interface ExistingStoreSmokeRefreshResult {
  slug: string;
  dryRun: boolean;
  metadataUpdated: boolean;
  ownerRowUpdated: boolean;
  report: StoreSmokeReport;
  readinessPreview: StoreConfig["readiness"];
}

type JsonRecord = Record<string, unknown>;
type StoreReadiness = NonNullable<StoreConfig["readiness"]>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function checkById(report: StoreSmokeReport, id: string): StoreSmokeCheckResult | null {
  return report.checks.find((check) => check.id === id) ?? null;
}

function hasFailedCheck(report: StoreSmokeReport, predicate: (check: StoreSmokeCheckResult) => boolean): boolean {
  return report.checks.some((check) => predicate(check) && check.status === "failed");
}

function hasPassedCheck(report: StoreSmokeReport, id: string): boolean {
  return checkById(report, id)?.status === "passed";
}

function statusFromChecks(report: StoreSmokeReport, ids: string[]): StoreReadinessStatus {
  if (ids.some((id) => checkById(report, id)?.status === "failed")) {
    return "failed";
  }

  if (ids.every((id) => hasPassedCheck(report, id))) {
    return "ready";
  }

  return "pending";
}

function smokeReadiness(report: StoreSmokeReport): StoreReadinessStatus {
  if (report.overallStatus === "passed") {
    return "ready";
  }

  if (report.overallStatus === "failed") {
    return "failed";
  }

  return "pending";
}

function buildDefaultReadiness(): StoreReadiness {
  return {
    database: "pending",
    storage: "pending",
    auth: "pending",
    analytics: "pending",
    admin: "pending",
    storefront: "pending",
    smoke: "pending",
  };
}

function deriveReadiness(current: Pick<StoreConfig, "readiness">, report: StoreSmokeReport): StoreReadiness {
  const previous = current.readiness ?? buildDefaultReadiness();

  return {
    ...previous,
    storefront: statusFromChecks(report, [
      "storefront_home_200",
      "storefront_products_200",
      "storefront_checkout_200",
      "storefront_blog_200",
      "storefront_runtime_200",
      "storefront_runtime_standard",
    ]),
    admin: statusFromChecks(report, [
      "admin_login_200",
      "admin_runtime_200",
      "admin_runtime_standard",
      "admin_sign_in_307",
    ]),
    auth: statusFromChecks(report, [
      "customer_email_sign_in_307",
      "customer_google_sign_in_307",
      "customer_reset_password_307",
      "admin_sign_in_307",
    ]),
    analytics: hasPassedCheck(report, "umami_metadata")
      ? "ready"
      : hasFailedCheck(report, (check) => check.category === "analytics")
        ? "failed"
        : previous.analytics,
    smoke: smokeReadiness(report),
  };
}

function shouldMarkStorefrontConfigured(report: StoreSmokeReport): boolean {
  return deriveReadiness({ readiness: undefined }, report).storefront === "ready";
}

function shouldMarkAdminConfigured(report: StoreSmokeReport): boolean {
  return deriveReadiness({ readiness: undefined }, report).admin === "ready";
}

function shouldMarkAuthConfigured(report: StoreSmokeReport): boolean {
  return deriveReadiness({ readiness: undefined }, report).auth === "ready";
}

function shouldMarkAnalyticsConfigured(report: StoreSmokeReport): boolean {
  return hasPassedCheck(report, "umami_metadata");
}

function shouldMarkPaymentConfigured(report: StoreSmokeReport): boolean {
  return hasPassedCheck(report, "storefront_payments_200");
}

function firstFailedMessage(report: StoreSmokeReport, category?: StoreSmokeCheckResult["category"]): string | null {
  const failed = report.checks.find((check) => check.status === "failed" && (!category || check.category === category));
  return failed?.message || failed?.actual || failed?.label || null;
}

function applySmokeRefreshMetadata(current: StoreConfig, report: StoreSmokeReport): StoreConfig {
  const finishedAt = report.finishedAt ?? new Date().toISOString();
  const readiness = deriveReadiness(current, report);
  const storefrontConfigured = shouldMarkStorefrontConfigured(report);
  const adminConfigured = shouldMarkAdminConfigured(report);
  const authConfigured = shouldMarkAuthConfigured(report);
  const analyticsConfigured = shouldMarkAnalyticsConfigured(report);
  const paymentConfigured = shouldMarkPaymentConfigured(report);
  const allCoreReady =
    report.overallStatus === "passed" &&
    readiness.storefront === "ready" &&
    readiness.admin === "ready" &&
    readiness.auth === "ready" &&
    readiness.smoke === "ready";

  return {
    ...current,
    status: allCoreReady ? "active" : current.status,
    auth: current.auth
      ? {
          ...current.auth,
          status: authConfigured ? "configured" : current.auth.status,
          requiredAction: authConfigured ? undefined : current.auth.requiredAction,
          blocking: authConfigured ? false : current.auth.blocking,
        }
      : current.auth,
    analytics: current.analytics
      ? {
          ...current.analytics,
          status: analyticsConfigured ? "configured" : current.analytics.status,
          requiredAction: analyticsConfigured ? undefined : current.analytics.requiredAction,
          blocking: analyticsConfigured ? false : current.analytics.blocking,
        }
      : current.analytics,
    payments: current.payments
      ? {
          ...current.payments,
          status: paymentConfigured ? "configured" : current.payments.status,
          blocking: paymentConfigured ? false : current.payments.blocking,
        }
      : current.payments,
    readiness,
    smoke: report,
    bootstrap: current.bootstrap
      ? {
          ...current.bootstrap,
          adminDeploymentStatus: adminConfigured ? "configured" : current.bootstrap.adminDeploymentStatus,
          adminDeploymentDeployedAt: adminConfigured
            ? current.bootstrap.adminDeploymentDeployedAt ?? finishedAt
            : current.bootstrap.adminDeploymentDeployedAt,
          adminDeploymentLastError: adminConfigured
            ? undefined
            : firstFailedMessage(report, "admin") ?? current.bootstrap.adminDeploymentLastError,
        }
      : current.bootstrap,
    storefront: current.storefront
      ? {
          ...current.storefront,
          status: storefrontConfigured ? "active" : current.storefront.status,
          deploymentStatus: storefrontConfigured ? "configured" : current.storefront.deploymentStatus,
          deployedAt: storefrontConfigured ? current.storefront.deployedAt ?? finishedAt : current.storefront.deployedAt,
          lastDeploymentError: storefrontConfigured
            ? undefined
            : firstFailedMessage(report, "storefront") ?? current.storefront.lastDeploymentError,
        }
      : current.storefront,
  };
}

function mergeOwnerMetadata(existing: JsonRecord, nextConfig: StoreConfig, report: StoreSmokeReport): JsonRecord {
  const bootstrap = asRecord(existing.bootstrap);
  const storefront = asRecord(existing.storefront);
  const finishedAt = report.finishedAt ?? new Date().toISOString();

  return {
    ...existing,
    databaseMode: nextConfig.databaseMode,
    authProvider: nextConfig.authProvider,
    customerAuthProvider: nextConfig.customerAuthProvider,
    analyticsProvider: nextConfig.analyticsProvider,
    storageProvider: nextConfig.storageProvider,
    supabaseStatus: nextConfig.supabaseStatus,
    auth: nextConfig.auth ?? existing.auth ?? null,
    analytics: nextConfig.analytics ?? existing.analytics ?? null,
    payments: nextConfig.payments ?? existing.payments ?? null,
    readiness: nextConfig.readiness ?? existing.readiness ?? null,
    smoke: report,
    bootstrap: {
      ...bootstrap,
      ...(nextConfig.bootstrap ?? {}),
      adminDeploymentStatus: nextConfig.bootstrap?.adminDeploymentStatus ?? bootstrap.adminDeploymentStatus,
      adminDeploymentDeployedAt: nextConfig.bootstrap?.adminDeploymentDeployedAt ?? bootstrap.adminDeploymentDeployedAt ?? finishedAt,
      adminDeploymentLastError: nextConfig.bootstrap?.adminDeploymentLastError ?? null,
      smokeLastRefreshedAt: finishedAt,
    },
    storefront: {
      ...storefront,
      ...(nextConfig.storefront ?? {}),
      deploymentStatus: nextConfig.storefront?.deploymentStatus ?? storefront.deploymentStatus,
      deployedAt: nextConfig.storefront?.deployedAt ?? storefront.deployedAt ?? finishedAt,
      lastDeploymentError: nextConfig.storefront?.lastDeploymentError ?? null,
    },
  };
}

async function updateOwnerStoreRowMetadata(slug: string, nextConfig: StoreConfig, report: StoreSmokeReport): Promise<boolean> {
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
    return false;
  }

  const nextMetadata = mergeOwnerMetadata(asRecord(data.metadata), nextConfig, report);
  const { error: updateError } = await serviceClient
    .from("owner_stores")
    .update({
      metadata: nextMetadata,
      storefront_app_dir: nextConfig.storefront?.appDir ?? null,
      storefront_status: nextConfig.storefront?.status ?? "scaffolded",
      status: nextConfig.status,
    })
    .eq("slug", slug);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return true;
}

export async function runExistingStoreSmokeRefresh(
  slug: string,
  options: ExistingStoreSmokeRefreshOptions = {},
): Promise<ExistingStoreSmokeRefreshResult> {
  const slugPolicy = validateAcceptanceRunnerSlug(slug);

  if (!slugPolicy.ok) {
    throw new Error(slugPolicy.message);
  }

  const dryRun = options.dryRun === true;
  const updateMetadata = options.updateMetadata !== false && !dryRun;
  const current = requireStoreConfig(slugPolicy.slug);
  const report = await runNewStoreSmokeRunner(current, {
    mode: "execute",
    persist: false,
    timeoutMs: options.timeoutMs,
  });
  const previewConfig = applySmokeRefreshMetadata(current, report);

  if (!updateMetadata) {
    return {
      slug: slugPolicy.slug,
      dryRun,
      metadataUpdated: false,
      ownerRowUpdated: false,
      report,
      readinessPreview: previewConfig.readiness,
    };
  }

  const nextConfig = updateStoreConfig(slugPolicy.slug, () => previewConfig);
  const ownerRowUpdated = await updateOwnerStoreRowMetadata(slugPolicy.slug, nextConfig, report);

  return {
    slug: slugPolicy.slug,
    dryRun,
    metadataUpdated: true,
    ownerRowUpdated,
    report,
    readinessPreview: nextConfig.readiness,
  };
}
