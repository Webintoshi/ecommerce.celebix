import "server-only";

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  fqdn?: string | null;
  domain?: string | null;
  git_branch?: string | null;
  watch_paths?: string | null;
}

const COOLIFY_API_PREFIX = "/api/v1";
const COOLIFY_API_TIMEOUT_MS = 15000;

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

function getOwnerApplicationUuid(): string {
  const value = process.env.COOLIFY_RESOURCE_UUID?.trim();

  if (!value) {
    throw new Error("COOLIFY_RESOURCE_UUID tanimli degil.");
  }

  return value;
}

function getOwnerRuntimeUrl(): string | null {
  const explicitUrl = process.env.COOLIFY_URL?.trim();

  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, "");
  }

  const fqdn = process.env.COOLIFY_FQDN?.trim();
  return fqdn ? `https://${fqdn.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}` : null;
}

function getDesiredOwnerBranch(): string {
  return (
    process.env.COOLIFY_OWNER_REPOSITORY_BRANCH?.trim() ||
    process.env.COOLIFY_ADMIN_REPOSITORY_BRANCH?.trim() ||
    process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH?.trim() ||
    process.env.CELEBIX_GIT_BRANCH?.trim() ||
    "deploy/owner"
  );
}

function getDesiredOwnerWatchPaths(): string {
  return ["apps/owner/**", "packages/**"].join(",");
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

async function patchApplicationBranch(
  applicationUuid: string,
  branch: string,
  watchPaths: string,
): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}`, {
    method: "PATCH",
    body: JSON.stringify({
      git_branch: branch,
      watch_paths: watchPaths,
    }),
  });
}

async function startApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}/start?force=true&instant_deploy=true`, {
    method: "POST",
  });
}

export interface OwnerDeploymentBranchRepairResult {
  changed: boolean;
  currentBranch: string | null;
  deploymentTriggered: boolean;
  desiredBranch: string;
  resourceId: string;
  runtimeUrl: string | null;
}

export async function repairOwnerDeploymentBranch(options?: {
  triggerDeploy?: boolean;
}): Promise<OwnerDeploymentBranchRepairResult> {
  const resourceId = getOwnerApplicationUuid();
  const desiredBranch = getDesiredOwnerBranch();
  const desiredWatchPaths = getDesiredOwnerWatchPaths();
  const runtimeUrl = getOwnerRuntimeUrl();
  const applications = await listApplications();
  const currentApplication =
    applications.find((application) => application.uuid === resourceId) ||
    applications.find((application) => {
      const candidateUrl =
        application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "") || "";
      return Boolean(runtimeUrl && candidateUrl === runtimeUrl);
    }) ||
    null;

  const currentBranch =
    currentApplication?.git_branch?.trim() || process.env.COOLIFY_BRANCH?.trim() || null;
  const currentWatchPaths = currentApplication?.watch_paths?.trim() || null;
  const shouldUpdate = currentBranch !== desiredBranch || currentWatchPaths !== desiredWatchPaths;

  if (shouldUpdate) {
    await patchApplicationBranch(resourceId, desiredBranch, desiredWatchPaths);
  }

  const triggerDeploy = options?.triggerDeploy ?? false;

  if (triggerDeploy) {
    await startApplication(resourceId);
  }

  return {
    changed: shouldUpdate,
    currentBranch,
    desiredBranch,
    resourceId,
    runtimeUrl,
    deploymentTriggered: triggerDeploy,
  };
}
