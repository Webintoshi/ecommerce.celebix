import "server-only";

import {
  getStoreConfig,
  repairStoreConfig,
  resolveDefaultDatabaseMode,
  type DatabaseMode,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  ensureOwnerStoreAuthorityForSlug,
  getStoreConsistencyForSlug,
  recordOwnerAuditLog,
  syncOwnerStoresAndMetrics,
  updateOwnerStoreBootstrapHealthAuthority,
  updateStoreManagementProfile,
} from "@/lib/control-plane";
import type { OwnerAuthContext } from "@/lib/owner-auth";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import {
  getStoreAdminDeploymentBlueprint,
  prepareStoreAdminDeployment,
} from "@/lib/admin-deployment";
import { provisionAdminDeploymentForStore } from "@/lib/admin-deployment-coolify";
import {
  releaseGeneratedDeploymentWindow,
  reserveGeneratedDeploymentWindow,
} from "@/lib/generated-deployment-guard";
import {
  checkLightPostgresReadinessForStore,
  getLightPostgresBootstrapStatus,
  provisionLightPostgresForStore,
} from "@/lib/light-postgres-provisioning";
import {
  getLogtoBootstrapStatus,
  provisionLogtoAppsForStore,
} from "@/lib/logto-provisioning";
import {
  getUmamiBootstrapStatus,
  provisionUmamiForStore,
} from "@/lib/umami-provisioning";
import { isOwnerActionDisabled } from "@/lib/preview-mode";
import {
  getR2MediaBootstrapStatus,
  provisionR2MediaForStore,
} from "@/lib/r2-provisioning";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import {
  createDefaultProvisioningSteps,
  deriveProvisioningState,
  getProvisioningBlockers,
  persistProvisioningSummary,
  PROVISIONING_STEP_KEYS,
  type ProvisioningState,
  type ProvisioningStepKey,
  type ProvisioningStepSummary,
  type ProvisioningSummary,
  upsertProvisioningStep,
  hasUnresolvedCleanupRun,
} from "@/lib/store-lifecycle";
import { readGeneratedRuntimeIssueCode } from "@/lib/generated-runtime-readiness";
import {
  getStorefrontDeploymentBlueprint,
  prepareStorefrontDeployment,
} from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import {
  isGitHubRepoSyncConfigured,
  syncStoreAuthorityRepoForStore,
  syncStorefrontRepoForStore,
  validateGitHubRepoSyncReadiness,
  verifyStorefrontBranchState,
} from "@/lib/storefront-repo-sync";
import {
  inspectStarterStorefrontContentHealth,
  seedStarterStorefrontContent,
} from "@/lib/starter-storefront-seed";
import { readStorefrontRuntimeReadiness } from "@/lib/storefront-runtime-readiness";
import { getSupabaseBootstrapStatus, provisionSupabaseForStore } from "@/lib/supabase-bootstrap";
import { ensureStoreConfigFromOwnerAuthority } from "@/lib/store-config-authority";
import { validateConfiguredStoreDeploymentBranches } from "@/lib/deployment-branch-guard";
import {
  releaseStoreProvisioningWindow,
  reserveStoreProvisioningWindow,
} from "@/lib/store-provisioning-guard";

type ProvisioningMode = "create" | "repair";

export interface StoreProvisioningWorkflowInput {
  auth: OwnerAuthContext;
  slug: string;
  mode: ProvisioningMode;
  packageStartDate?: string;
  packageDurationMonths?: number | null;
}

export interface StoreProvisioningWorkflowResult {
  store: StoreConfig;
  provisioningState: ProvisioningState;
  steps: ProvisioningStepSummary[];
  blockers: ProvisioningStepSummary[];
  repaired: boolean;
}

export interface ProvisioningEnvironmentReadiness {
  ready: boolean;
  errors: string[];
}

export interface ProvisioningEnvironmentReadinessInput {
  databaseMode?: DatabaseMode | null;
}

function shouldAutoProvisionGeneratedApps(): boolean {
  const raw = process.env.OWNER_AUTO_PROVISION_GENERATED_APPS?.trim().toLowerCase();

  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }

  return true;
}

const PREFLIGHT_STEP_KEYS: ProvisioningStepKey[] = [
  "owner_supabase_auth",
  "cleanup_guard",
  "deployment_branch_preflight",
  "supabase_preflight",
  "r2_preflight",
  "coolify_preflight",
  "github_preflight",
  "starter_source_preflight",
  "generated_apps_toggle",
];

function normalizeStarterSourceUrl(value: string): string {
  const trimmed = value.trim();
  const absolute = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
  return absolute.replace(/\/+$/, "");
}

function getStarterSourceBase(): string {
  return normalizeStarterSourceUrl(process.env.OWNER_STARTER_THEME_SOURCE_URL?.trim() || "https://derycraft.com");
}

function getCoolifyMissingEnv(): string[] {
  return [
    "COOLIFY_API_URL",
    "COOLIFY_API_TOKEN",
    "COOLIFY_SERVER_UUID",
    "COOLIFY_DESTINATION_UUID",
  ].filter((key) => !process.env[key]?.trim());
}

function hasExplicitManagementInput(input: StoreProvisioningWorkflowInput): boolean {
  return input.packageStartDate !== undefined || input.packageDurationMonths !== undefined;
}

function resolveRequestedDatabaseMode(
  input: ProvisioningEnvironmentReadinessInput = {},
): DatabaseMode {
  return resolveDefaultDatabaseMode(input.databaseMode);
}

function isPendingAuthSetup(store: StoreConfig): boolean {
  return store.auth?.status === "pending_auth_setup" && store.auth.blocking !== true;
}

function isPendingAnalyticsSetup(store: StoreConfig): boolean {
  return store.analytics?.status === "pending_analytics_setup" && store.analytics.blocking !== true;
}

function isPendingPaymentSetup(store: StoreConfig): boolean {
  return store.payments?.status === "pending_payment_setup" && store.payments.blocking !== true;
}

export async function validateProvisioningEnvironmentReadiness(
  input: ProvisioningEnvironmentReadinessInput = {},
): Promise<ProvisioningEnvironmentReadiness> {
  const errors: string[] = [];
  const databaseMode = resolveRequestedDatabaseMode(input);

  try {
    const serviceClient = createOwnerServiceClient();
    const { error } = await serviceClient
      .from("owner_profiles")
      .select("id", { head: true, count: "exact" });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    errors.push(
      `Owner Supabase authority hazir degil: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  try {
    if (databaseMode === "light_postgres") {
      const status = await getLightPostgresBootstrapStatus();

      if (!status.configured) {
        errors.push(status.lastError || `${status.cluster} light_postgres bootstrap authority eksik.`);
      }
    } else {
      const status = await getSupabaseBootstrapStatus();

      if (!status.configured) {
        errors.push(status.lastError || `${status.provider} Supabase bootstrap authority eksik.`);
      }
    }
  } catch (error) {
    errors.push(
      `${
        databaseMode === "light_postgres" ? "light_postgres" : "Supabase"
      } bootstrap authority dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  try {
    const r2Status = getR2MediaBootstrapStatus();

    if (!r2Status.configured) {
      errors.push(r2Status.lastError || "R2 media config authority eksik.");
    }
  } catch (error) {
    errors.push(
      `R2 media config dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  const coolifyMissing = getCoolifyMissingEnv();
  if (coolifyMissing.length > 0) {
    errors.push(`Coolify authority eksik: ${coolifyMissing.join(", ")}`);
  }

  try {
    const gitHubReadiness = await validateGitHubRepoSyncReadiness();

    if (!gitHubReadiness.ready) {
      errors.push(gitHubReadiness.message || "GitHub repo sync authority hazir degil.");
    }
  } catch (error) {
    errors.push(
      `GitHub repo sync authority dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  if (databaseMode === "full_supabase") {
    try {
      const sourceBase = getStarterSourceBase();
      const response = await fetch(`${sourceBase}/api/homepage`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        errors.push(`Starter source fetch failed (${response.status}) for ${sourceBase}`);
      }
    } catch (error) {
      errors.push(
        `Starter source dogrulanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    }
  }

  if (!shouldAutoProvisionGeneratedApps()) {
    errors.push("Generated app provisioning owner env tarafinda kapali.");
  }

  return {
    ready: errors.length === 0,
    errors,
  };
}

async function runGeneratedDeploymentStep<T>(
  input: { slug: string; target: "admin" | "storefront" },
  action: () => Promise<T>,
): Promise<T> {
  const deploymentWindow = await reserveGeneratedDeploymentWindow(input);

  try {
    return await action();
  } finally {
    await releaseGeneratedDeploymentWindow(deploymentWindow);
  }
}

class ProvisioningTracker {
  summary: ProvisioningSummary;
  readonly lastRunAt: string;

  constructor(
    readonly slug: string,
    readonly mode: ProvisioningMode,
    summary: ProvisioningSummary,
    lastRunAt: string,
  ) {
    this.summary = summary;
    this.lastRunAt = lastRunAt;
  }

  shouldRunStep(key: ProvisioningStepKey): boolean {
    if (this.mode === "create") {
      return true;
    }

    const current = this.summary.steps.find((step) => step.key === key);
    return (
      !current ||
      current.status === "pending" ||
      current.status === "running" ||
      current.status === "failed" ||
      current.status === "blocked"
    );
  }

  async start(key: ProvisioningStepKey): Promise<void> {
    this.summary = await upsertProvisioningStep(this.slug, key, {
      status: "running",
      message: null,
      blocking: true,
      state: "provisioning",
      lastError: null,
      lastRunAt: this.lastRunAt,
    });
  }

  async complete(key: ProvisioningStepKey, message: string | null = null): Promise<void> {
    this.summary = await upsertProvisioningStep(this.slug, key, {
      status: "completed",
      message,
      blocking: false,
      state: "provisioning",
      lastError: null,
      lastRunAt: this.lastRunAt,
    });
  }

  async fail(key: ProvisioningStepKey, error: unknown, blocking = true): Promise<void> {
    const message = error instanceof Error ? error.message : "Provisioning adimi basarisiz oldu.";
    const nextSummary = await upsertProvisioningStep(this.slug, key, {
      status: "failed",
      message,
      blocking,
      state: "pending_repair",
      lastError: message,
      lastRunAt: this.lastRunAt,
    });

    if (!blocking) {
      this.summary = nextSummary;
      return;
    }

    const failedIndex = nextSummary.steps.findIndex((step) => step.key === key);
    const blockedSteps = nextSummary.steps.map((step, index) => {
      if (index <= failedIndex || (step.status !== "pending" && step.status !== "running")) {
        return step;
      }

      return {
        ...step,
        status: "blocked" as const,
        blocking: true,
        message: `${nextSummary.steps[failedIndex]?.label ?? key} tamamlanmadan ilerlenemez.`,
        updatedAt: new Date().toISOString(),
      };
    });

    this.summary = await persistProvisioningSummary(this.slug, {
      state: "pending_repair",
      lastError: message,
      lastRunAt: this.lastRunAt,
      steps: blockedSteps,
    });
  }

  async block(key: ProvisioningStepKey, message: string): Promise<void> {
    const nextSummary = await upsertProvisioningStep(this.slug, key, {
      status: "blocked",
      message,
      blocking: true,
      state: "pending_repair",
      lastError: message,
      lastRunAt: this.lastRunAt,
    });

    const blockedIndex = nextSummary.steps.findIndex((step) => step.key === key);
    const blockedSteps = nextSummary.steps.map((step, index) => {
      if (index <= blockedIndex || (step.status !== "pending" && step.status !== "running")) {
        return step;
      }

      return {
        ...step,
        status: "blocked" as const,
        blocking: true,
        message: `${nextSummary.steps[blockedIndex]?.label ?? key} tamamlanmadan ilerlenemez.`,
        updatedAt: new Date().toISOString(),
      };
    });

    this.summary = await persistProvisioningSummary(this.slug, {
      state: "pending_repair",
      lastError: message,
      lastRunAt: this.lastRunAt,
      steps: blockedSteps,
    });
  }

  async finalize(): Promise<StoreProvisioningWorkflowResult> {
    this.summary = await reconcileProvisioningSummaryWithLiveState(this.slug, this.summary);
    const store = repairStoreConfig(this.slug);
    const blockers = getProvisioningBlockers(this.summary);
    const derivedIssueMessage =
      this.summary.steps.find((step) => readGeneratedRuntimeIssueCode(step.message))?.message ??
      this.summary.lastError;
    const lastError = blockers[0]?.message ?? derivedIssueMessage ?? this.summary.lastError;
    const state = deriveProvisioningState(this.summary.steps, lastError, {
      authPending: isPendingAuthSetup(store),
      analyticsPending: isPendingAnalyticsSetup(store),
      paymentPending: isPendingPaymentSetup(store),
    });
    this.summary = await persistProvisioningSummary(this.slug, {
      state,
      lastError:
        state === "pending_repair" || state === "failed" || state === "pending_dns"
          ? lastError
          : null,
      lastRunAt: this.lastRunAt,
      steps: this.summary.steps,
    });

    return {
      store,
      provisioningState: state,
      steps: this.summary.steps,
      blockers,
      repaired: this.mode === "repair" && blockers.length === 0,
    };
  }
}

async function initializeTracker(
  slug: string,
  mode: ProvisioningMode,
): Promise<ProvisioningTracker> {
  const now = new Date().toISOString();
  const existing = mode === "repair"
    ? await persistProvisioningSummary(slug, {
        state: "provisioning",
        lastError: null,
        lastRunAt: now,
      })
    : await persistProvisioningSummary(slug, {
        state: "provisioning",
        lastError: null,
        lastRunAt: now,
        steps: createDefaultProvisioningSteps(),
      });

  return new ProvisioningTracker(slug, mode, existing, now);
}

async function runPreflightStep(
  tracker: ProvisioningTracker,
  key: ProvisioningStepKey,
  action: () => Promise<string>,
): Promise<void> {
  if (!tracker.shouldRunStep(key)) {
    return;
  }

  await tracker.start(key);

  try {
    await tracker.complete(key, await action());
  } catch (error) {
    await tracker.fail(key, error);
  }
}

async function runWorkflowStep(
  tracker: ProvisioningTracker,
  key: ProvisioningStepKey,
  action: () => Promise<string>,
  options?: {
    blockingOnFailure?: boolean;
    continueOnFailure?: boolean;
  },
): Promise<boolean> {
  if (!tracker.shouldRunStep(key)) {
    return true;
  }

  await tracker.start(key);

  try {
    await tracker.complete(key, await action());
    return true;
  } catch (error) {
    await tracker.fail(key, error, options?.blockingOnFailure ?? true);
    return options?.continueOnFailure ?? false;
  }
}

async function runRepairAuthorityPreflight(input: StoreProvisioningWorkflowInput): Promise<void> {
  const consistency = await getStoreConsistencyForSlug(input.auth, input.slug);

  if (!consistency) {
    throw new Error("Repair authority preflight store consistency bilgisini okuyamadi.");
  }

  if (consistency.blocking) {
    const message = consistency.issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.message)
      .slice(0, 3)
      .join(" / ");

    throw new Error(`Repair authority preflight bloklandi: ${message || "store drift mevcut"}`);
  }

  const store = repairStoreConfig(input.slug);

  if (store.storefront?.lastScaffoldedAt && !store.storefront?.appDir) {
    throw new Error("Repair authority preflight bloklandi: lastScaffoldedAt var ama storefront appDir yok.");
  }

  if (
    store.storefront?.appDir &&
    (store.storefront.repoSyncStatus === "synced" ||
      store.storefront.deploymentStatus === "prepared" ||
      store.storefront.deploymentStatus === "configured")
  ) {
    const verification = await verifyStorefrontBranchState(input.slug);

    if (!verification.verified) {
      throw new Error(
        `Repair authority preflight bloklandi: ${verification.message || "storefront branch authority eksik."}`,
      );
    }
  }
}

async function runPreflights(input: StoreProvisioningWorkflowInput, tracker: ProvisioningTracker): Promise<void> {
  await runPreflightStep(tracker, "owner_supabase_auth", async () => {
    const serviceClient = createOwnerServiceClient();
    const { error } = await serviceClient
      .from("owner_profiles")
      .select("id", { head: true, count: "exact" });

    if (error) {
      throw new Error(error.message);
    }

    return "Owner Supabase authority hazir.";
  });

  await runPreflightStep(tracker, "cleanup_guard", async () => {
    if (await hasUnresolvedCleanupRun(input.slug)) {
      throw new Error("Bu slug icin cozulmemis bir cleanup tombstone kaydi var.");
    }

    return "Cleanup tombstone bulunmadi.";
  });

  await runPreflightStep(tracker, "deployment_branch_preflight", async () => {
    const store = repairStoreConfig(input.slug);
    const validation = validateConfiguredStoreDeploymentBranches(store);

    if (validation.errors.length > 0) {
      throw new Error(validation.errors.join(" "));
    }

    return `Deploy branch plani hazir: admin ${validation.adminBranch}, storefront ${validation.storefrontBranch}`;
  });

  await runPreflightStep(tracker, "supabase_preflight", async () => {
    const store = repairStoreConfig(input.slug);

    if (store.databaseMode === "light_postgres") {
      const status = await getLightPostgresBootstrapStatus();

      if (!status.configured) {
        throw new Error(status.lastError || "light_postgres bootstrap authority eksik.");
      }

      return `${status.cluster} light_postgres authority hazir.`;
    }

    const status = await getSupabaseBootstrapStatus();

    if (!status.configured) {
      throw new Error(status.lastError || `${status.provider} Supabase bootstrap authority eksik.`);
    }

    return `${status.provider} Supabase bootstrap hazir.`;
  });

  await runPreflightStep(tracker, "r2_preflight", async () => {
    const status = getR2MediaBootstrapStatus();
    return status.configured
      ? "R2 media authority hazir."
      : status.lastError || "R2 media config pending apply modunda hazirlanacak.";
  });

  await runPreflightStep(tracker, "coolify_preflight", async () => {
    const missing = getCoolifyMissingEnv();

    if (missing.length > 0) {
      throw new Error(`Coolify authority eksik: ${missing.join(", ")}`);
    }

    return "Coolify authority hazir.";
  });

  await runPreflightStep(tracker, "github_preflight", async () => {
    const readiness = await validateGitHubRepoSyncReadiness();

    if (!readiness.ready) {
      throw new Error(readiness.message || "GitHub repo sync authority hazir degil.");
    }

    if (input.mode === "repair") {
      await runRepairAuthorityPreflight(input);
      return "GitHub repo sync authority ve repair preflight hazir.";
    }

    return "GitHub repo sync authority hazir.";
  });

  await runPreflightStep(tracker, "starter_source_preflight", async () => {
    const store = repairStoreConfig(input.slug);

    if (store.databaseMode === "light_postgres") {
      return "Starter source fetch atlandi; light_postgres minimal bootstrap kullanir.";
    }

    const sourceBase = getStarterSourceBase();
    const response = await fetch(`${sourceBase}/api/homepage`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Starter source fetch failed (${response.status}) for ${sourceBase}`);
    }

    return `Starter source erisilebilir: ${sourceBase}`;
  });

  await runPreflightStep(tracker, "auth_setup", async () => {
    const store = repairStoreConfig(input.slug);

    if (store.databaseMode !== "light_postgres") {
      return "Legacy Supabase auth store runtime icinde ele alinir.";
    }

    const status = getLogtoBootstrapStatus();
    return status.configured
      ? "Logto management authority apply-ready durumda."
      : status.lastError || "Logto config generation pending apply modunda calisacak.";
  });

  await runPreflightStep(tracker, "analytics_setup", async () => {
    const store = repairStoreConfig(input.slug);

    if (store.databaseMode !== "light_postgres") {
      return "Legacy analytics setup store runtime icinde ele alinir.";
    }

    const status = getUmamiBootstrapStatus();
    return status.configured
      ? "Umami token authority apply-ready durumda."
      : status.lastError || "Umami config generation pending apply modunda calisacak.";
  });

  await runPreflightStep(tracker, "generated_apps_toggle", async () => {
    if (!shouldAutoProvisionGeneratedApps()) {
      throw new Error("Generated app provisioning owner env tarafinda kapali.");
    }

    return "Generated app provisioning acik.";
  });
}

function getPreflightBlockers(summary: ProvisioningSummary): ProvisioningStepSummary[] {
  const preflightKeys = new Set(PREFLIGHT_STEP_KEYS);
  return getProvisioningBlockers(summary).filter((step) => preflightKeys.has(step.key));
}

async function syncOwnerStoresAndMetricsBestEffort(context: string): Promise<void> {
  try {
    await syncOwnerStoresAndMetrics();
  } catch (error) {
    const message = error instanceof Error ? error.message : "bilinmeyen hata";
    console.warn(`Owner metrics sync skipped after ${context}: ${message}`);
  }
}

function updateSummaryStep(
  steps: ProvisioningStepSummary[],
  key: ProvisioningStepKey,
  patch: Partial<ProvisioningStepSummary>,
): { steps: ProvisioningStepSummary[]; changed: boolean } {
  let changed = false;
  const nextSteps = steps.map((step) => {
    if (step.key !== key) {
      return step;
    }

    const nextStep: ProvisioningStepSummary = {
      ...step,
      ...patch,
      updatedAt: patch.updatedAt ?? step.updatedAt ?? new Date().toISOString(),
    };

    if (JSON.stringify(nextStep) !== JSON.stringify(step)) {
      changed = true;
    }

    return nextStep;
  });

  return { steps: nextSteps, changed };
}

async function reconcileProvisioningSummaryWithLiveState(
  slug: string,
  summary: ProvisioningSummary,
): Promise<ProvisioningSummary> {
  const store = repairStoreConfig(slug);
  let nextSummary = summary;
  let changed = false;
  const now = new Date().toISOString();
  let adminRuntimeOk = false;
  let storefrontRuntimeOk = false;
  let homepageOk = false;
  let categoriesOk = false;
  let productsOk = false;
  let starterSeedOk = false;
  let settingsOk = false;
  let blogPostsOk = false;
  let readinessError: string | null = null;

  const markCompleted = (
    key: ProvisioningStepKey,
    message: string,
  ) => {
    const current = nextSummary.steps.find((step) => step.key === key);

    if (!current || current.status === "completed") {
      return;
    }

    const result = updateSummaryStep(nextSummary.steps, key, {
      status: "completed",
      blocking: false,
      message,
      updatedAt: now,
    });

    nextSummary = {
      ...nextSummary,
      steps: result.steps,
    };
    changed = changed || result.changed;
  };

  const markFailed = (
    key: ProvisioningStepKey,
    message: string,
    blocking = true,
  ) => {
    const result = updateSummaryStep(nextSummary.steps, key, {
      status: "failed",
      blocking,
      message,
      updatedAt: now,
    });

    nextSummary = {
      ...nextSummary,
      lastError: message,
      steps: result.steps,
    };
    changed = changed || result.changed;
  };

  const blockRemainingStepsAfter = (
    key: ProvisioningStepKey,
    message: string,
  ) => {
    const blockedIndex = nextSummary.steps.findIndex((step) => step.key === key);

    if (blockedIndex === -1) {
      return;
    }

    const nextSteps = nextSummary.steps.map((step, index) => {
      if (index <= blockedIndex || (step.status !== "pending" && step.status !== "running")) {
        return step;
      }

      return {
        ...step,
        status: "blocked" as const,
        blocking: true,
        message,
        updatedAt: now,
      };
    });

    if (JSON.stringify(nextSteps) !== JSON.stringify(nextSummary.steps)) {
      changed = true;
      nextSummary = {
        ...nextSummary,
        steps: nextSteps,
      };
    }
  };

  if (
    store.bootstrap?.supabaseProvisioning === "configured" &&
    store.supabase.projectRef &&
    store.supabase.projectRef !== "pending-owner-bootstrap" &&
    store.supabase.url &&
    store.supabase.url !== "configure-in-env"
  ) {
    markCompleted("supabase_provision", "Supabase authority canli durumda hazir.");
  }

  if (store.databaseMode === "light_postgres") {
    if (store.lightPostgres?.readinessStatus === "ready") {
      markCompleted("supabase_provision", "light_postgres schema, seed ve runtime role hazir.");
    } else if (store.lightPostgres?.provisioning === "configured") {
      try {
        const readiness = await checkLightPostgresReadinessForStore(store);

        if (readiness.ready) {
          markCompleted("supabase_provision", readiness.message);
        } else {
          readinessError = readinessError ?? readiness.message;
          markFailed("supabase_provision", readiness.message);
          blockRemainingStepsAfter("supabase_provision", readiness.nextRepairAction ?? readiness.message);
        }
      } catch (error) {
        const databaseError =
          error instanceof Error
            ? error.message
            : "light_postgres readiness kontrolu basarisiz oldu.";
        readinessError = readinessError ?? databaseError;
        markFailed("supabase_provision", databaseError);
        blockRemainingStepsAfter("supabase_provision", "light_postgres repair/retry gerekli.");
      }
    }
  }

  if (store.r2?.provisioning === "configured" && store.r2?.bucketName && store.r2?.publicUrl) {
    markCompleted("r2_provision", "R2 authority canli durumda hazir.");
  }

  if (store.storefront?.appDir?.trim()) {
    markCompleted("storefront_scaffold", "Storefront app dizini olusturulmus durumda.");
  }

  try {
    const adminBlueprint = await getStoreAdminDeploymentBlueprint(slug);

    if (adminBlueprint.status !== "pending-owner-env") {
      markCompleted("admin_blueprint", "Admin blueprint authority hazir.");
    }

    if (adminBlueprint.status === "configured" && adminBlueprint.runtimeConsistent) {
      adminRuntimeOk = true;
      markCompleted(
        "admin_deploy",
        adminBlueprint.runtimeMessage || "Admin runtime canli ve tutarli cevap veriyor.",
      );
      if (readGeneratedRuntimeIssueCode(adminBlueprint.runtimeMessage) === "pending_dns") {
        readinessError = readinessError ?? adminBlueprint.runtimeMessage;
      }
    } else if (store.bootstrap?.adminDeploymentStatus === "failed") {
      const adminFailureMessage =
        store.bootstrap?.adminDeploymentLastError ||
        adminBlueprint.runtimeMessage ||
        "Admin deployment basarisiz oldu.";
      readinessError = readinessError ?? adminFailureMessage;
      markFailed("admin_deploy", adminFailureMessage);
      blockRemainingStepsAfter("admin_deploy", "Admin deployment tamamlanmadan ilerlenemez.");
    }
  } catch {
    // Keep existing provisioning summary when admin runtime cannot be checked.
  }

  try {
    const storefrontBlueprint = await getStorefrontDeploymentBlueprint(slug);

    if (storefrontBlueprint.status !== "pending-owner-env") {
      markCompleted("storefront_blueprint", "Storefront blueprint authority hazir.");
    }

    if (storefrontBlueprint.repoSynced) {
      markCompleted("storefront_repo_sync", "Storefront branch ve app dizini repo ile senkron.");
    }

    if (storefrontBlueprint.status === "configured" && storefrontBlueprint.runtimeConsistent) {
      storefrontRuntimeOk = true;
      markCompleted(
        "storefront_deploy",
        storefrontBlueprint.runtimeMessage || "Storefront runtime canli ve tutarli cevap veriyor.",
      );
      if (readGeneratedRuntimeIssueCode(storefrontBlueprint.runtimeMessage) === "pending_dns") {
        readinessError = readinessError ?? storefrontBlueprint.runtimeMessage;
      }
    }
  } catch {
    // Keep existing provisioning summary when storefront runtime cannot be checked.
  }

  if (storefrontRuntimeOk) {
    const storefrontReadiness = await readStorefrontRuntimeReadiness(store.domains.storefront, {
      resourceId: store.storefront?.resourceId ?? null,
    }).catch((error) => ({
      checkedAt: now,
      storefrontRuntimeOk: false,
      homepageOk: false,
      categoriesOk: false,
      productsOk: false,
      dataApisOk: false,
      probeState: "runtime_unreachable" as const,
      lastError: error instanceof Error ? error.message : "Storefront smoke kontrolu yapilamadi.",
    }));

    storefrontRuntimeOk = storefrontReadiness.storefrontRuntimeOk;
    homepageOk = storefrontReadiness.homepageOk;
    categoriesOk = storefrontReadiness.categoriesOk;
    productsOk = storefrontReadiness.productsOk;

    if (storefrontReadiness.storefrontRuntimeOk && storefrontReadiness.dataApisOk) {
      markCompleted("storefront_deploy", "Storefront runtime ve veri API smoke kontrolleri saglikli.");
    } else if (
      storefrontReadiness.probeState === "pending_dns" ||
      storefrontReadiness.probeState === "proxy_not_ready"
    ) {
      storefrontRuntimeOk = true;
      readinessError = readinessError ?? storefrontReadiness.lastError;
      markCompleted(
        "storefront_deploy",
        storefrontReadiness.lastError || "Storefront runtime icerden healthy; public erisim hazirlaniyor.",
      );
    } else {
      const storefrontError =
        storefrontReadiness.lastError ||
        "Storefront veri API smoke kontrolleri basarisiz oldu.";
      readinessError = readinessError ?? storefrontError;
      markFailed("storefront_deploy", `Storefront smoke basarisiz: ${storefrontError}`);
    }
  }

  const canVerifyStarterContent =
    store.bootstrap?.supabaseProvisioning === "configured" &&
    Boolean(store.supabase.projectRef && store.supabase.projectRef !== "pending-owner-bootstrap") &&
    Boolean(store.supabase.url && store.supabase.url !== "configure-in-env");

  if (canVerifyStarterContent) {
    try {
      const starterHealth = await inspectStarterStorefrontContentHealth(store);
      starterSeedOk = starterHealth.ready;
      settingsOk = starterHealth.settingsOk;
      blogPostsOk = starterHealth.blogPostsOk;

      if (starterHealth.ready) {
        markCompleted("starter_seed", "Starter icerik cekirdek katalog ve ayar tablolarinda hazir.");
      } else {
        const starterError = "Starter content kontrolu basarisiz: cekirdek katalog tablolarinda eksik veri var.";
        readinessError = readinessError ?? starterError;
        markFailed("starter_seed", starterError);
      }
    } catch (error) {
      const starterError =
        error instanceof Error ? error.message : "Starter content kontrolu basarisiz oldu.";
      readinessError = readinessError ?? starterError;
      markFailed("starter_seed", starterError);
    }
  }

  await updateOwnerStoreBootstrapHealthAuthority(slug, {
    finalReadiness: {
      adminRuntimeOk,
      storefrontRuntimeOk,
      homepageOk,
      categoriesOk,
      productsOk,
      starterSeedOk,
      settingsOk,
      blogPostsOk,
      lastCheckedAt: now,
      lastError: readinessError,
    },
    firstReadyAt:
      adminRuntimeOk &&
      storefrontRuntimeOk &&
      homepageOk &&
      categoriesOk &&
      productsOk &&
      starterSeedOk &&
      settingsOk &&
      blogPostsOk
        ? now
        : null,
  }).catch(() => undefined);

  if (!changed) {
    return summary;
  }

  return nextSummary;
}

export async function runStoreProvisioningWorkflow(
  input: StoreProvisioningWorkflowInput,
): Promise<StoreProvisioningWorkflowResult> {
  if (isOwnerActionDisabled("provisioning")) {
    throw new Error("Preview ortaminda yazma/kurulum islemleri kapalidir.");
  }

  const provisioningWindow = await reserveStoreProvisioningWindow({
    slug: input.slug,
    mode: input.mode,
  });

  try {
    if (getStoreConfig(input.slug)) {
      repairStoreConfig(input.slug);
      await ensureOwnerStoreAuthorityForSlug(input.slug);
    }

    await ensureStoreConfigFromOwnerAuthority(input.slug);
    repairStoreConfig(input.slug);

    const tracker = await initializeTracker(input.slug, input.mode);
    await runPreflights(input, tracker);

    if (getPreflightBlockers(tracker.summary).length > 0) {
      return tracker.finalize();
    }

    const workflow: Array<[ProvisioningStepKey, () => Promise<string>]> = [
    [
      "authority_repo_sync",
      async () => {
        const result = await syncStoreAuthorityRepoForStore(input.slug);

        if (result.status !== "synced") {
          throw new Error(result.message || "Store authority repo senkronu tamamlanamadi.");
        }

        return result.message || "Store authority repo senkronlandi.";
      },
    ],
    [
      "management_profile",
      async () => {
        if (hasExplicitManagementInput(input)) {
          await updateStoreManagementProfile(input.auth, input.slug, {
            packageStartDate: input.packageStartDate,
            packageDurationMonths: input.packageDurationMonths,
          });
          return "Owner management authority guncellendi.";
        }

        return "Owner management authority zaten hazir.";
      },
    ],
    [
      "supabase_provision",
      async () => {
        const store = repairStoreConfig(input.slug);

        if (store.databaseMode === "light_postgres") {
          const result = await provisionLightPostgresForStore(store);
          await syncOwnerStoresAndMetricsBestEffort("light_postgres provisioning");
          return `light_postgres provision edildi: ${result.cluster}/${result.databaseName}; role=${result.roleName}; ${result.readiness.message}`;
        }

        const result = await provisionSupabaseForStore(store);
        await syncOwnerStoresAndMetricsBestEffort("Supabase provisioning");
        return `${result.provider} Supabase provision edildi: ${result.projectRef}`;
      },
    ],
    [
      "starter_seed",
      async () => {
        const store = repairStoreConfig(input.slug);

        if (store.databaseMode === "light_postgres") {
          return "Starter content seed atlandi; minimal settings light_postgres schema icine yazildi.";
        }

        const result = await seedStarterStorefrontContent(store);
        return result.message || "Starter storefront content yazildi.";
      },
    ],
    [
      "r2_provision",
      async () => {
        const store = repairStoreConfig(input.slug);
        const result = await provisionR2MediaForStore(store);
        await syncOwnerStoresAndMetricsBestEffort("R2 provisioning");
        return `R2 media config hazirlandi: ${result.configPath}; bucket=${result.bucketName ? "configured" : "pending"}`;
      },
    ],
    [
      "storefront_scaffold",
      async () => {
        const result = await scaffoldStorefrontApp(input.slug);
        repairStoreConfig(input.slug);
        return `Storefront scaffold hazir: ${result.relativeAppDirectory}`;
      },
    ],
    [
      "storefront_repo_sync",
      async () => {
        const result = await syncStorefrontRepoForStore(input.slug);

        if (result.status !== "synced") {
          throw new Error(result.message || "Storefront repo senkronu tamamlanamadi.");
        }

        return result.message || "Storefront repo senkronlandi.";
      },
    ],
    [
      "auth_setup",
      async () => {
        const store = repairStoreConfig(input.slug);

        if (store.databaseMode === "light_postgres") {
          const result = await provisionLogtoAppsForStore(store);
          await syncOwnerStoresAndMetricsBestEffort("Logto provisioning");

          return `Logto admin/customer app config hazirlandi: ${result.adminConfigPath}, ${result.customerConfigPath}`;
        }

        return "Supabase auth store ile birlikte hazir.";
      },
    ],
    [
      "analytics_setup",
      async () => {
        const store = repairStoreConfig(input.slug);

        if (store.databaseMode === "light_postgres") {
          const result = await provisionUmamiForStore(store);
          await syncOwnerStoresAndMetricsBestEffort("Umami provisioning");

          return `Umami website config hazirlandi: ${result.configPath}; websiteId=${result.websiteId ? "configured" : "pending"}`;
        }

        return "Legacy analytics setup store runtime icinde ele alinir.";
      },
    ],
    [
      "storefront_blueprint",
      async () => {
        const blueprint = await prepareStorefrontDeployment(input.slug);

        if (blueprint.status === "pending-owner-env" || blueprint.status === "failed") {
          throw new Error(blueprint.runtimeMessage || "Storefront blueprint hazirlanamadi.");
        }

        return blueprint.runtimeMessage || "Storefront blueprint hazirlandi.";
      },
    ],
    [
      "storefront_deploy",
      async () => {
        const blueprint = await prepareStorefrontDeployment(input.slug);

        if (blueprint.status === "pending-owner-env" || blueprint.status === "pending-repo-sync") {
          throw new Error(blueprint.runtimeMessage || "Storefront deployment icin authority hazir degil.");
        }

        const deployment = await runGeneratedDeploymentStep(
          { slug: input.slug, target: "storefront" },
          () => provisionStorefrontDeploymentForStore(input.slug, { waitForRuntime: true }),
        );

        if (
          deployment.status === "failed" ||
          deployment.status === "pending-owner-env" ||
          deployment.status === "pending-repo-sync" ||
          deployment.status !== "configured" ||
          !deployment.runtimeConsistent
        ) {
          throw new Error(deployment.message || "Storefront deployment basarisiz oldu.");
        }

        return deployment.message || "Storefront runtime dogrulandi.";
      },
    ],
    [
      "admin_blueprint",
      async () => {
        const blueprint = await prepareStoreAdminDeployment(input.slug);

        if (blueprint.status === "pending-owner-env" || blueprint.status === "failed") {
          throw new Error(blueprint.runtimeMessage || "Admin blueprint hazirlanamadi.");
        }

        return "Admin blueprint hazirlandi.";
      },
    ],
    [
      "admin_deploy",
      async () => {
        const deployment = await runGeneratedDeploymentStep(
          { slug: input.slug, target: "admin" },
          () => provisionAdminDeploymentForStore(input.slug, { waitForRuntime: true }),
        );

        if (deployment.status !== "configured" || !deployment.runtimeConsistent) {
          throw new Error(deployment.message || "Admin deployment basarisiz oldu.");
        }

        return deployment.message || "Admin runtime dogrulandi.";
      },
    ],
    [
      "payment_setup",
      async () => {
        const store = repairStoreConfig(input.slug);

        if (isPendingPaymentSetup(store)) {
          return "Odeme ayari bekleniyor; placeholder owner authority icinde kayitli.";
        }

        return "Odeme authority hazir.";
      },
    ],
  ];

  for (const [key, action] of workflow) {
    const succeeded = await runWorkflowStep(
      tracker,
      key,
      action,
      key === "starter_seed"
        ? {
            blockingOnFailure: false,
            continueOnFailure: true,
          }
        : undefined,
    );

    if (!succeeded) {
      break;
    }
  }

  if (getProvisioningBlockers(tracker.summary).length === 0) {
    await tracker.start("authority_repo_sync");

    try {
      const authoritySync = await syncStoreAuthorityRepoForStore(input.slug);

      if (authoritySync.status !== "synced") {
        throw new Error(authoritySync.message || "Store authority repo senkronu tamamlanamadi.");
      }

      await tracker.complete(
        "authority_repo_sync",
        authoritySync.message || "Store authority repo son durumla senkronlandi.",
      );
    } catch (error) {
      await tracker.fail("authority_repo_sync", error);
    }
  }

    await syncOwnerStoresAndMetricsBestEffort("store provisioning workflow");
    const result = await tracker.finalize();

    await recordOwnerAuditLog({
      actorId: input.auth.user.id,
      action: input.mode === "repair" ? "store_repair_run" : "store_provisioning_run",
      targetType: "store",
      targetId: input.slug,
      details: {
        provisioningState: result.provisioningState,
        blockers: result.blockers.map((step) => step.message).filter((value): value is string => Boolean(value)),
        steps: result.steps.map((step) => ({
          key: step.key,
          status: step.status,
          message: step.message,
        })),
      },
    });

    return result;
  } finally {
    await releaseStoreProvisioningWindow(provisioningWindow);
  }
}

export function predictPendingRepairStatus(steps: ProvisioningStepSummary[]): ProvisioningState {
  return steps.some((step) => step.status === "failed" || step.status === "blocked")
    ? "pending_repair"
    : "ready";
}

export function getProvisioningStepKeys(): ProvisioningStepKey[] {
  return [...PROVISIONING_STEP_KEYS];
}
