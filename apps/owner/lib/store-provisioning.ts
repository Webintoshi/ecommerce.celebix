import "server-only";

import {
  getStoreConfig,
  repairStoreConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  recordOwnerAuditLog,
  syncOwnerStoresAndMetrics,
  updateOwnerStoreR2Authority,
  updateStoreManagementProfile,
} from "@/lib/control-plane";
import type { OwnerAuthContext } from "@/lib/owner-auth";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { prepareStoreAdminDeployment } from "@/lib/admin-deployment";
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
import { prepareStorefrontDeployment } from "@/lib/storefront-deployment";
import { provisionStorefrontDeploymentForStore } from "@/lib/storefront-deployment-coolify";
import {
  isGitHubRepoSyncConfigured,
  syncStoreAuthorityRepoForStore,
  syncStorefrontRepoForStore,
} from "@/lib/storefront-repo-sync";
import { seedStarterStorefrontContent } from "@/lib/starter-storefront-seed";
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

function shouldAutoProvisionGeneratedApps(): boolean {
  const raw = process.env.OWNER_AUTO_PROVISION_GENERATED_APPS?.trim().toLowerCase();

  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }

  return true;
}

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
): Promise<boolean> {
  if (!tracker.shouldRunStep(key)) {
    return true;
  }

  await tracker.start(key);

  try {
    await tracker.complete(key, await action());
    return true;
  } catch (error) {
    await tracker.fail(key, error);
    return false;
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
    if (!isGitHubRepoSyncConfigured()) {
      throw new Error("GitHub repo write-back authority eksik.");
    }

    return "GitHub repo sync authority hazir.";
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

export async function runStoreProvisioningWorkflow(
  input: StoreProvisioningWorkflowInput,
): Promise<StoreProvisioningWorkflowResult> {
  const provisioningWindow = await reserveStoreProvisioningWindow({
    slug: input.slug,
    mode: input.mode,
  });

  try {
    await ensureStoreConfigFromOwnerAuthority(input.slug);
    repairStoreConfig(input.slug);
    await syncOwnerStoresAndMetrics();

    const tracker = await initializeTracker(input.slug, input.mode);
    await runPreflights(input, tracker);

    if (getProvisioningBlockers(tracker.summary).length > 0) {
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
          () => provisionAdminDeploymentForStore(input.slug, { waitForRuntime: false }),
        );

        if (deployment.status === "failed") {
          throw new Error(deployment.message || "Admin deployment basarisiz oldu.");
        }

        return deployment.message || "Admin deployment tetiklendi.";
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
          () => provisionStorefrontDeploymentForStore(input.slug, { waitForRuntime: false }),
        );

        if (
          deployment.status === "failed" ||
          deployment.status === "pending-owner-env" ||
          deployment.status === "pending-repo-sync"
        ) {
          throw new Error(deployment.message || "Storefront deployment basarisiz oldu.");
        }

        return deployment.message || "Storefront deployment tetiklendi.";
      },
    ],
    ];

    for (const [key, action] of workflow) {
      const succeeded = await runWorkflowStep(tracker, key, action);

      if (!succeeded) {
        break;
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
