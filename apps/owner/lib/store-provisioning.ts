import "server-only";

import {
  getStoreConfig,
  repairStoreConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  ensureOwnerStoreAuthorityForSlug,
  recordOwnerAuditLog,
  syncOwnerStoresAndMetrics,
  updateOwnerStoreBootstrapHealthAuthority,
  updateOwnerStoreR2Authority,
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
import { getR2BootstrapStatus, provisionR2ForStore } from "@/lib/r2-bootstrap";
import { scaffoldStorefrontApp } from "@/lib/storefront-scaffold";
import {
  createDefaultProvisioningSteps,
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

export async function validateProvisioningEnvironmentReadiness(): Promise<ProvisioningEnvironmentReadiness> {
  const errors: string[] = [];

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
    const status = await getSupabaseBootstrapStatus();

    if (!status.configured) {
      errors.push(status.lastError || `${status.provider} Supabase bootstrap authority eksik.`);
    }
  } catch (error) {
    errors.push(
      `Supabase bootstrap authority dogrulanamadi: ${
        error instanceof Error ? error.message : "bilinmeyen hata"
      }`,
    );
  }

  try {
    const status = await getR2BootstrapStatus();

    if (!status.configured) {
      errors.push(status.lastError || "R2 bootstrap authority eksik.");
    }
  } catch (error) {
    errors.push(
      `R2 bootstrap authority dogrulanamadi: ${
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
    return !current || current.status === "pending" || current.status === "running" || current.status === "failed";
  }

  async start(key: ProvisioningStepKey): Promise<void> {
    this.summary = await upsertProvisioningStep(this.slug, key, {
      status: "running",
      message: null,
      blocking: true,
      state: "running",
      lastError: null,
      lastRunAt: this.lastRunAt,
    });
  }

  async complete(key: ProvisioningStepKey, message: string | null = null): Promise<void> {
    this.summary = await upsertProvisioningStep(this.slug, key, {
      status: "completed",
      message,
      blocking: false,
      state: "running",
      lastError: null,
      lastRunAt: this.lastRunAt,
    });
  }

  async fail(key: ProvisioningStepKey, error: unknown, blocking = true): Promise<void> {
    const message = error instanceof Error ? error.message : "Provisioning adimi basarisiz oldu.";
    this.summary = await upsertProvisioningStep(this.slug, key, {
      status: "failed",
      message,
      blocking,
      state: "pending_repair",
      lastError: message,
      lastRunAt: this.lastRunAt,
    });
  }

  async finalize(): Promise<StoreProvisioningWorkflowResult> {
    this.summary = await reconcileProvisioningSummaryWithLiveState(this.slug, this.summary);
    const blockers = getProvisioningBlockers(this.summary);
    const state: ProvisioningState = blockers.length > 0 ? "pending_repair" : "ready";
    this.summary = await persistProvisioningSummary(this.slug, {
      state,
      lastError: blockers.length > 0 ? blockers[0]?.message ?? this.summary.lastError : null,
      lastRunAt: this.lastRunAt,
      steps: this.summary.steps,
    });

    const store = repairStoreConfig(this.slug);

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
        state: "running",
        lastError: null,
        lastRunAt: now,
      })
    : await persistProvisioningSummary(slug, {
        state: "running",
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
    const status = await getSupabaseBootstrapStatus();

    if (!status.configured) {
      throw new Error(status.lastError || `${status.provider} Supabase bootstrap authority eksik.`);
    }

    return `${status.provider} Supabase bootstrap hazir.`;
  });

  await runPreflightStep(tracker, "r2_preflight", async () => {
    const status = await getR2BootstrapStatus();

    if (!status.configured) {
      throw new Error(status.lastError || "R2 bootstrap authority eksik.");
    }

    return "R2 bootstrap hazir.";
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

    return readiness.message || "GitHub repo sync authority hazir.";
  });

  await runPreflightStep(tracker, "starter_source_preflight", async () => {
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

  if (
    store.bootstrap?.supabaseProvisioning === "configured" &&
    store.supabase.projectRef &&
    store.supabase.projectRef !== "pending-owner-bootstrap" &&
    store.supabase.url &&
    store.supabase.url !== "configure-in-env"
  ) {
    markCompleted("supabase_provision", "Supabase authority canli durumda hazir.");
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
      markCompleted("admin_deploy", "Admin runtime canli ve tutarli cevap veriyor.");
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
      markCompleted("storefront_deploy", "Storefront runtime canli ve tutarli cevap veriyor.");
    }
  } catch {
    // Keep existing provisioning summary when storefront runtime cannot be checked.
  }

  if (storefrontRuntimeOk) {
    const storefrontReadiness = await readStorefrontRuntimeReadiness(store.domains.storefront).catch((error) => ({
      checkedAt: now,
      storefrontRuntimeOk: false,
      homepageOk: false,
      categoriesOk: false,
      productsOk: false,
      dataApisOk: false,
      lastError: error instanceof Error ? error.message : "Storefront smoke kontrolu yapilamadi.",
    }));

    storefrontRuntimeOk = storefrontReadiness.storefrontRuntimeOk;
    homepageOk = storefrontReadiness.homepageOk;
    categoriesOk = storefrontReadiness.categoriesOk;
    productsOk = storefrontReadiness.productsOk;

    if (storefrontReadiness.storefrontRuntimeOk && storefrontReadiness.dataApisOk) {
      markCompleted("storefront_deploy", "Storefront runtime ve veri API smoke kontrolleri saglikli.");
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
        const result = await provisionSupabaseForStore(store);
        await syncOwnerStoresAndMetrics();
        return `${result.provider} Supabase provision edildi: ${result.projectRef}`;
      },
    ],
    [
      "starter_seed",
      async () => {
        const store = repairStoreConfig(input.slug);
        const result = await seedStarterStorefrontContent(store);
        return result.message || "Starter storefront content yazildi.";
      },
    ],
    [
      "r2_provision",
      async () => {
        const store = repairStoreConfig(input.slug);
        const result = await provisionR2ForStore(store);
        await updateOwnerStoreR2Authority(input.slug, {
          bucketName: result.bucketName,
          publicUrl: result.publicUrl,
          managedDomain: result.managedDomain,
        });
        await syncOwnerStoresAndMetrics();
        return `R2 bucket hazir: ${result.bucketName}`;
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
      "storefront_scaffold",
      async () => {
        const result = await scaffoldStorefrontApp(input.slug);
        repairStoreConfig(input.slug);
        return `Storefront scaffold hazir: ${result.relativeAppDirectory}`;
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

  await syncOwnerStoresAndMetrics();
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
  return steps.some((step) => step.status === "failed") ? "pending_repair" : "ready";
}

export function getProvisioningStepKeys(): ProvisioningStepKey[] {
  return [...PROVISIONING_STEP_KEYS];
}
