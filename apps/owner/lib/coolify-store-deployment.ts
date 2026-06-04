import "server-only";

import { getStores, requireStoreConfig } from "@celebix/platform-config";
import { getStoreAdminDeploymentBlueprint } from "@/lib/admin-deployment";
import { getStoreDeploymentBranches } from "@/lib/platform-config-owner";
import { isOwnerActionDisabled } from "@/lib/preview-mode";
import { getStorefrontDeploymentBlueprint } from "@/lib/storefront-deployment";

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  fqdn?: string | null;
  domain?: string | null;
  git_branch?: string | null;
  is_auto_deploy_enabled?: boolean | null;
}

interface DeploymentAuthorityTargetBlueprint {
  appName: string;
  resourceId: string | null;
  runtimeUrl: string;
}

export interface StoreDeploymentAuthorityTargetRepairResult {
  target: "admin" | "storefront";
  appName: string;
  resourceId: string | null;
  runtimeUrl: string;
  status: "repaired" | "already_configured" | "missing";
  changed: boolean;
  branchChanged: boolean;
  autoDeployChanged: boolean;
  currentBranch: string | null;
  currentAutoDeployEnabled: boolean | null;
  desiredBranch: string;
  desiredAutoDeployEnabled: boolean;
  deploymentTriggered: boolean;
}

export interface StoreDeploymentAuthorityRepairResult {
  slug: string;
  changed: boolean;
  deploymentTriggered: boolean;
  targets: StoreDeploymentAuthorityTargetRepairResult[];
}

export interface StoreDeploymentAuthorityBatchRepairResult {
  totalStores: number;
  changedStores: number;
  failedStores: number;
  results: StoreDeploymentAuthorityRepairResult[];
  failures: Array<{
    slug: string;
    error: string;
  }>;
}

const COOLIFY_API_PREFIX = "/api/v1";
const COOLIFY_API_TIMEOUT_MS = 15000;
const storeDeploymentSelfHealPromises = new Map<
  string,
  Promise<StoreDeploymentAuthorityRepairResult | null>
>();

function getCoolifyApiUrl(): string {
  const raw = process.env.COOLIFY_API_URL?.trim();

  if (!raw) {
    throw new Error("COOLIFY_API_URL tanimli degil.");
  }

  return raw.replace(/\/+$/, "");
}

function getCoolifyApiToken(): string {
  const token = process.env.COOLIFY_API_TOKEN?.trim();

  if (!token) {
    throw new Error("COOLIFY_API_TOKEN tanimli degil.");
  }

  return token;
}

function hasStoreDeploymentRepairEnv(): boolean {
  return Boolean(process.env.COOLIFY_API_URL?.trim() && process.env.COOLIFY_API_TOKEN?.trim());
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getCoolifyApiToken()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(COOLIFY_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Coolify API zaman asimina ugradi (${COOLIFY_API_TIMEOUT_MS}ms): ${pathname}`);
    }

    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Coolify API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of ["data", "applications", "result"] as const) {
      if (Array.isArray(record[key])) {
        return record[key] as T[];
      }
    }
  }

  return [];
}

async function listApplications(): Promise<CoolifyApplication[]> {
  const payload = await coolifyFetch<unknown>("/applications");
  return normalizeArrayPayload<CoolifyApplication>(payload);
}

async function patchApplicationDeploymentSettings(
  applicationUuid: string,
  options: {
    branch: string;
    autoDeployEnabled: boolean;
  },
): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}`, {
    method: "PATCH",
    body: JSON.stringify({
      git_branch: options.branch,
      is_auto_deploy_enabled: options.autoDeployEnabled,
    }),
  });
}

async function startApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}/start?force=true&instant_deploy=true`, {
    method: "POST",
  });
}

function findApplication(
  applications: CoolifyApplication[],
  blueprint: DeploymentAuthorityTargetBlueprint,
): CoolifyApplication | null {
  const runtimeUrl = blueprint.runtimeUrl.replace(/\/+$/, "");

  return (
    applications.find((application) => application.uuid === blueprint.resourceId) ||
    applications.find((application) => application.name === blueprint.appName) ||
    applications.find((application) => {
      const candidateUrl =
        application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "") || "";
      return candidateUrl === runtimeUrl;
    }) ||
    null
  );
}

async function repairDeploymentTarget(
  applications: CoolifyApplication[],
  options: {
    target: "admin" | "storefront";
    blueprint: DeploymentAuthorityTargetBlueprint;
    desiredBranch: string;
    triggerDeploy: boolean;
  },
): Promise<StoreDeploymentAuthorityTargetRepairResult> {
  const currentApplication = findApplication(applications, options.blueprint);
  const desiredAutoDeployEnabled = options.target === "admin" ? false : true;

  if (!currentApplication?.uuid) {
    return {
      target: options.target,
      appName: options.blueprint.appName,
      resourceId: options.blueprint.resourceId,
      runtimeUrl: options.blueprint.runtimeUrl,
      status: "missing",
      changed: false,
      branchChanged: false,
      autoDeployChanged: false,
      currentBranch: null,
      currentAutoDeployEnabled: null,
      desiredBranch: options.desiredBranch,
      desiredAutoDeployEnabled,
      deploymentTriggered: false,
    };
  }

  const currentBranch = currentApplication.git_branch?.trim() || null;
  const currentAutoDeployEnabled =
    typeof currentApplication.is_auto_deploy_enabled === "boolean"
      ? currentApplication.is_auto_deploy_enabled
      : null;
  const branchChanged = currentBranch !== options.desiredBranch;
  const autoDeployChanged = currentAutoDeployEnabled !== desiredAutoDeployEnabled;
  const changed = branchChanged || autoDeployChanged;

  if (changed) {
    await patchApplicationDeploymentSettings(currentApplication.uuid, {
      branch: options.desiredBranch,
      autoDeployEnabled: desiredAutoDeployEnabled,
    });
  }

  const deploymentTriggered = options.triggerDeploy && changed;

  if (deploymentTriggered) {
    await startApplication(currentApplication.uuid);
  }

  return {
    target: options.target,
    appName: options.blueprint.appName,
    resourceId: currentApplication.uuid,
    runtimeUrl: options.blueprint.runtimeUrl,
    status: changed ? "repaired" : "already_configured",
    changed,
    branchChanged,
    autoDeployChanged,
    currentBranch,
    currentAutoDeployEnabled,
    desiredBranch: options.desiredBranch,
    desiredAutoDeployEnabled,
    deploymentTriggered,
  };
}

export async function repairStoreDeploymentAuthority(
  slug: string,
  options?: {
    triggerDeploy?: boolean;
  },
): Promise<StoreDeploymentAuthorityRepairResult> {
  const store = requireStoreConfig(slug);
  const deploymentBranches = getStoreDeploymentBranches(store.slug, store);
  const triggerDeploy = options?.triggerDeploy ?? false;
  const [applications, storefrontBlueprint, adminBlueprint] = await Promise.all([
    listApplications(),
    getStorefrontDeploymentBlueprint(slug),
    getStoreAdminDeploymentBlueprint(slug),
  ]);
  const targets = await Promise.all([
    repairDeploymentTarget(applications, {
      target: "storefront",
      blueprint: storefrontBlueprint,
      desiredBranch: deploymentBranches.storefrontBranch,
      triggerDeploy,
    }),
    repairDeploymentTarget(applications, {
      target: "admin",
      blueprint: adminBlueprint,
      desiredBranch: deploymentBranches.adminBranch,
      triggerDeploy,
    }),
  ]);

  return {
    slug: store.slug,
    changed: targets.some((target) => target.changed),
    deploymentTriggered: targets.some((target) => target.deploymentTriggered),
    targets,
  };
}

export async function repairStoreDeploymentAuthorityOnce(
  slug: string,
): Promise<StoreDeploymentAuthorityRepairResult | null> {
  if (isOwnerActionDisabled("repair")) {
    return null;
  }

  if (!hasStoreDeploymentRepairEnv()) {
    return null;
  }

  const normalizedSlug = requireStoreConfig(slug).slug;

  if (!storeDeploymentSelfHealPromises.has(normalizedSlug)) {
    storeDeploymentSelfHealPromises.set(
      normalizedSlug,
      repairStoreDeploymentAuthority(normalizedSlug, { triggerDeploy: false }).catch((error) => {
        console.error(
          `Store deployment authority self-heal failed for ${normalizedSlug}:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      }),
    );
  }

  return storeDeploymentSelfHealPromises.get(normalizedSlug) ?? null;
}

export async function repairTrackedStoreDeploymentAuthorities(
  options?: {
    triggerDeploy?: boolean;
  },
): Promise<StoreDeploymentAuthorityBatchRepairResult> {
  const stores = getStores();
  const results: StoreDeploymentAuthorityRepairResult[] = [];
  const failures: StoreDeploymentAuthorityBatchRepairResult["failures"] = [];

  for (const store of stores) {
    try {
      results.push(
        await repairStoreDeploymentAuthority(store.slug, {
          triggerDeploy: options?.triggerDeploy ?? false,
        }),
      );
    } catch (error) {
      failures.push({
        slug: store.slug,
        error: error instanceof Error ? error.message : "Deployment authority onarimi basarisiz oldu.",
      });
    }
  }

  return {
    totalStores: stores.length,
    changedStores: results.filter((result) => result.changed).length,
    failedStores: failures.length,
    results,
    failures,
  };
}
