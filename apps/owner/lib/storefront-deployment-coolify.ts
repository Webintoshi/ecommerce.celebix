import "server-only";

import type { StoreConfig } from "@celebix/platform-config";
import {
  requireStoreConfig,
  updateStoreStorefrontConfig,
  updateStoreStorefrontDeploymentConfig,
} from "@celebix/platform-config";
import {
  getStorefrontDeploymentBlueprint,
  type StorefrontDeploymentBlueprint,
} from "@/lib/storefront-deployment";

interface CoolifyProject {
  uuid?: string;
  name?: string;
}

interface CoolifyEnvironment {
  uuid?: string;
  name?: string;
}

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  fqdn?: string | null;
  domain?: string | null;
}

type StorefrontApplicationPayload = ReturnType<typeof buildStorefrontAppPayload>;

interface CoolifyBulkEnvEntry {
  key: string;
  value: string;
  is_literal?: boolean;
  is_build_time?: boolean;
  is_runtime?: boolean;
  is_multiline?: boolean;
}

export interface StorefrontDeploymentProvisioningResult {
  appName: string;
  resourceId: string | null;
  runtimeUrl: string;
  status: "pending-owner-env" | "pending-repo-sync" | "prepared" | "configured" | "failed";
  runtimeConsistent: boolean;
  message: string | null;
  repoSynced: boolean;
}

interface StorefrontDeploymentProvisioningOptions {
  waitForRuntime?: boolean;
}

const COOLIFY_API_PREFIX = "/api/v1";
const STOREFRONT_DEPLOYMENT_POLL_DELAY_MS = 5000;
const STOREFRONT_DEPLOYMENT_POLL_ATTEMPTS = 24;
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

function getDefaultCoolifyProjectName(): string {
  return process.env.COOLIFY_PROJECT_NAME?.trim() || "CELEBIX E-COMMERCE YONETIM";
}

function getCoolifyProjectName(store?: StoreConfig): string {
  return store?.bootstrap?.coolifyProjectName?.trim() || getDefaultCoolifyProjectName();
}

function getCoolifyEnvironmentName(): string {
  return process.env.COOLIFY_ENVIRONMENT_NAME?.trim() || "production";
}

function getCoolifyServerUuid(): string {
  const value = process.env.COOLIFY_SERVER_UUID?.trim();

  if (!value) {
    throw new Error("COOLIFY_SERVER_UUID tanimli degil.");
  }

  return value;
}

function getCoolifyDestinationUuid(): string {
  const value = process.env.COOLIFY_DESTINATION_UUID?.trim();

  if (!value) {
    throw new Error("COOLIFY_DESTINATION_UUID tanimli degil.");
  }

  return value;
}

function getRepositoryUrl(): string {
  return (
    process.env.COOLIFY_APPLICATION_REPOSITORY_URL?.trim() ||
    process.env.CELEBIX_GIT_REPOSITORY?.trim() ||
    "https://github.com/Webintoshi/ecommerce.celebix"
  );
}

function getRepositoryBranch(): string {
  return (
    process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH?.trim() ||
    process.env.CELEBIX_GIT_BRANCH?.trim() ||
    "main"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCoolifyApiToken()}`,
    "Content-Type": "application/json",
  };
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        ...buildHeaders(),
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
    if ("data" in payload && Array.isArray((payload as { data?: unknown }).data)) {
      return (payload as { data: T[] }).data;
    }

    if (
      "applications" in payload &&
      Array.isArray((payload as { applications?: unknown }).applications)
    ) {
      return (payload as { applications: T[] }).applications;
    }

    if ("projects" in payload && Array.isArray((payload as { projects?: unknown }).projects)) {
      return (payload as { projects: T[] }).projects;
    }

    if (
      "environments" in payload &&
      Array.isArray((payload as { environments?: unknown }).environments)
    ) {
      return (payload as { environments: T[] }).environments;
    }
  }

  return [];
}

function resolveIdentifier(
  value: CoolifyProject | CoolifyEnvironment | CoolifyApplication,
): string {
  if (!value.uuid) {
    throw new Error("Coolify kaynagi icin UUID donmedi.");
  }

  return value.uuid;
}

async function listProjects(): Promise<CoolifyProject[]> {
  const payload = await coolifyFetch<unknown>("/projects");
  return normalizeArrayPayload<CoolifyProject>(payload);
}

async function ensureProject(store?: StoreConfig): Promise<CoolifyProject> {
  const targetName = getCoolifyProjectName(store);
  const existing = (await listProjects()).find((project) => project.name === targetName);

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyProject>("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: targetName,
      description: "Celebix shared admin and storefront applications",
    }),
  });
}

async function listEnvironments(projectUuid: string): Promise<CoolifyEnvironment[]> {
  const payload = await coolifyFetch<unknown>(`/projects/${projectUuid}/environments`);
  return normalizeArrayPayload<CoolifyEnvironment>(payload);
}

async function ensureEnvironment(projectUuid: string): Promise<CoolifyEnvironment> {
  const targetName = getCoolifyEnvironmentName();
  const existing = (await listEnvironments(projectUuid)).find(
    (environment) => environment.name === targetName,
  );

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyEnvironment>(`/projects/${projectUuid}/environments`, {
    method: "POST",
    body: JSON.stringify({ name: targetName }),
  });
}

async function listApplications(): Promise<CoolifyApplication[]> {
  const payload = await coolifyFetch<unknown>("/applications");
  return normalizeArrayPayload<CoolifyApplication>(payload);
}

function isGeneratedAutoDeployEnabled(): boolean {
  const raw = process.env.COOLIFY_GENERATED_AUTO_DEPLOY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function buildStorefrontAppPayload(
  store: StoreConfig,
  blueprint: StorefrontDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string,
) {
  return {
    project_uuid: projectUuid,
    environment_uuid: environmentUuid,
    environment_name: getCoolifyEnvironmentName(),
    server_uuid: getCoolifyServerUuid(),
    destination_uuid: getCoolifyDestinationUuid(),
    git_repository: getRepositoryUrl(),
    git_branch: getRepositoryBranch(),
    build_pack: "nixpacks",
    name: blueprint.appName,
    description: `Celebix storefront deployment for ${store.slug}`,
    domains: blueprint.runtimeUrl,
    ports_exposes: blueprint.serverPort,
    base_directory: "/",
    install_command: blueprint.installCommand,
    build_command: blueprint.buildCommand,
    start_command: blueprint.startCommand,
    health_check_enabled: true,
    health_check_path: "/api/public/runtime",
    health_check_port: blueprint.serverPort,
    is_force_https_enabled: true,
    // Generated store apps should not redeploy on every repo push by default.
    is_auto_deploy_enabled: isGeneratedAutoDeployEnabled(),
    instant_deploy: false,
  };
}

function buildLegacyCompatibleStorefrontPayload(payload: StorefrontApplicationPayload) {
  const legacyPayload = { ...payload };
  delete (legacyPayload as Partial<StorefrontApplicationPayload>).project_uuid;
  delete (legacyPayload as Partial<StorefrontApplicationPayload>).environment_uuid;
  delete (legacyPayload as Partial<StorefrontApplicationPayload>).environment_name;
  delete (legacyPayload as Partial<StorefrontApplicationPayload>).server_uuid;
  delete (legacyPayload as Partial<StorefrontApplicationPayload>).destination_uuid;
  return legacyPayload;
}

function isLegacyApplicationPayloadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  const legacyFieldNames = [
    "project_uuid",
    "environment_uuid",
    "environment_name",
    "server_uuid",
    "destination_uuid",
  ];

  return (
    message.includes("Validation failed.") &&
    legacyFieldNames.some((fieldName) => message.includes(fieldName))
  );
}

async function ensureStorefrontApplication(
  store: StoreConfig,
  blueprint: StorefrontDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string,
): Promise<CoolifyApplication> {
  const applications = await listApplications();
  const runtimeUrl = blueprint.runtimeUrl.replace(/\/+$/, "");
  const payload = buildStorefrontAppPayload(store, blueprint, projectUuid, environmentUuid);
  const existing =
    applications.find((application) => application.uuid === blueprint.resourceId) ||
    applications.find((application) => application.name === blueprint.appName) ||
    applications.find((application) => {
      const fqdn =
        application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "");
      return fqdn === runtimeUrl;
    });

  if (!existing) {
    try {
      return await coolifyFetch<CoolifyApplication>("/applications/public", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (!isLegacyApplicationPayloadError(error)) {
        throw error;
      }

      return coolifyFetch<CoolifyApplication>("/applications/public", {
        method: "POST",
        body: JSON.stringify(buildLegacyCompatibleStorefrontPayload(payload)),
      });
    }
  }

  const applicationUuid = resolveIdentifier(existing);

  try {
    await coolifyFetch(`/applications/${applicationUuid}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (!isLegacyApplicationPayloadError(error)) {
      throw error;
    }

    await coolifyFetch(`/applications/${applicationUuid}`, {
      method: "PATCH",
      body: JSON.stringify(buildLegacyCompatibleStorefrontPayload(payload)),
    });
  }

  return existing;
}

async function syncApplicationEnv(
  applicationUuid: string,
  envEntries: Record<string, string>,
): Promise<void> {
  const payload = {
    data: Object.entries(envEntries).map(
      ([key, value]) =>
        ({
          key,
          value,
          is_literal: true,
          is_build_time: true,
          is_runtime: true,
          is_multiline: false,
        }) satisfies CoolifyBulkEnvEntry,
    ),
  };

  await coolifyFetch(`/applications/${applicationUuid}/envs/bulk`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function startApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}/start?force=true&instant_deploy=true`, {
    method: "POST",
  });
}

async function waitForStorefrontRuntime(
  store: StoreConfig,
): Promise<StorefrontDeploymentBlueprint> {
  let lastBlueprint: StorefrontDeploymentBlueprint | null = null;

  for (let attempt = 0; attempt < STOREFRONT_DEPLOYMENT_POLL_ATTEMPTS; attempt += 1) {
    lastBlueprint = await getStorefrontDeploymentBlueprint(store.slug);

    if (lastBlueprint.runtimeConsistent) {
      return lastBlueprint;
    }

    await sleep(STOREFRONT_DEPLOYMENT_POLL_DELAY_MS);
  }

  return lastBlueprint ?? getStorefrontDeploymentBlueprint(store.slug);
}

export async function provisionStorefrontDeploymentForStore(
  slug: string,
  options: StorefrontDeploymentProvisioningOptions = {},
): Promise<StorefrontDeploymentProvisioningResult> {
  const store = requireStoreConfig(slug);
  const blueprint = await getStorefrontDeploymentBlueprint(slug);
  const shouldWaitForRuntime = options.waitForRuntime ?? true;

  if (blueprint.status === "pending-owner-env" || blueprint.status === "pending-repo-sync") {
    updateStoreStorefrontDeploymentConfig(slug, {
      deploymentStatus: blueprint.status,
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: blueprint.resourceId ?? undefined,
      lastError: blueprint.runtimeMessage ?? undefined,
    });

    return {
      appName: blueprint.appName,
      resourceId: blueprint.resourceId,
      runtimeUrl: blueprint.runtimeUrl,
      status: blueprint.status,
      runtimeConsistent: false,
      message: blueprint.runtimeMessage,
      repoSynced: blueprint.repoSynced,
    };
  }

  try {
    const project = await ensureProject(store).catch((error) => {
      throw new Error(
        `Storefront deployment için Coolify proje/erişim hazirlanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const projectUuid = resolveIdentifier(project);
    const environment = await ensureEnvironment(projectUuid).catch((error) => {
      throw new Error(
        `Storefront deployment için Coolify environment hazirlanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const environmentUuid = resolveIdentifier(environment);
    const application = await ensureStorefrontApplication(
      store,
      blueprint,
      projectUuid,
      environmentUuid,
    ).catch((error) => {
      throw new Error(
        `Storefront application create/update basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const applicationUuid = resolveIdentifier(application);
    await syncApplicationEnv(applicationUuid, blueprint.envEntries).catch((error) => {
      throw new Error(
        `Storefront env senkronu basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    await startApplication(applicationUuid).catch((error) => {
      throw new Error(
        `Storefront deployment start basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });

    if (!shouldWaitForRuntime) {
      updateStoreStorefrontConfig(slug, {
        appDir: store.storefront?.appDir ?? "",
        status: store.storefront?.status ?? "scaffolded",
        lastScaffoldError: store.storefront?.lastScaffoldError,
      });
      updateStoreStorefrontDeploymentConfig(slug, {
        deploymentStatus: "prepared",
        deploymentName: blueprint.appName,
        runtimeUrl: blueprint.runtimeUrl,
        resourceId: applicationUuid,
        lastError: "Storefront deployment tetiklendi. Runtime dogrulamasi owner health ekranindan izlenmeli.",
      });

      return {
        appName: blueprint.appName,
        resourceId: applicationUuid,
        runtimeUrl: blueprint.runtimeUrl,
        status: "prepared",
        runtimeConsistent: false,
        message: "Storefront deployment tetiklendi. Runtime dogrulamasi daha sonra yapilacak.",
        repoSynced: blueprint.repoSynced,
      };
    }

    const runtimeBlueprint = await waitForStorefrontRuntime(store).catch((error) => {
      throw new Error(
        `Storefront runtime smoke test basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const deploymentStatus = runtimeBlueprint.runtimeConsistent ? "configured" : "prepared";
    const deployedAt = runtimeBlueprint.runtimeConsistent
      ? new Date().toISOString()
      : undefined;

    updateStoreStorefrontConfig(slug, {
      appDir: store.storefront?.appDir ?? "",
      status: runtimeBlueprint.runtimeConsistent
        ? "active"
        : store.storefront?.status ?? "scaffolded",
      lastScaffoldError: store.storefront?.lastScaffoldError,
    });
    updateStoreStorefrontDeploymentConfig(slug, {
      deploymentStatus,
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: applicationUuid,
      deployedAt,
      lastError: runtimeBlueprint.runtimeMessage ?? undefined,
    });

    return {
      appName: blueprint.appName,
      resourceId: applicationUuid,
      runtimeUrl: blueprint.runtimeUrl,
      status: deploymentStatus,
      runtimeConsistent: runtimeBlueprint.runtimeConsistent,
      message: runtimeBlueprint.runtimeMessage,
      repoSynced: runtimeBlueprint.repoSynced,
    };
  } catch (error) {
    updateStoreStorefrontDeploymentConfig(slug, {
      deploymentStatus: "failed",
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: blueprint.resourceId ?? undefined,
      lastError:
        error instanceof Error
          ? error.message
          : "Storefront deployment otomasyonu basarisiz oldu.",
    });

    throw error;
  }
}
