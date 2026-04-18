import "server-only";

import type { StoreConfig } from "@celebix/platform-config";
import {
  getStoreDeploymentBranches,
  requireStoreConfig,
  updateStoreAdminDeploymentConfig,
} from "@celebix/platform-config";
import { getStoreAdminDeploymentBlueprint, type StoreAdminDeploymentBlueprint } from "@/lib/admin-deployment";
import { prepareCoolifyEnvValue } from "@/lib/coolify-env";
import { normalizeCoolifyRepository } from "@/lib/coolify-repository";

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

type AdminApplicationPayload = ReturnType<typeof buildAdminAppPayload>;

interface EnsuredAdminApplication {
  application: CoolifyApplication;
  reusedExisting: boolean;
}

interface CoolifyBulkEnvEntry {
  key: string;
  value: string;
  is_literal?: boolean;
  is_build_time?: boolean;
  is_runtime?: boolean;
  is_multiline?: boolean;
}

export interface AdminDeploymentProvisioningResult {
  appName: string;
  resourceId: string | null;
  runtimeUrl: string;
  status: "prepared" | "configured" | "failed";
  runtimeConsistent: boolean;
  message: string | null;
  externallyManaged: boolean;
}

interface AdminDeploymentProvisioningOptions {
  waitForRuntime?: boolean;
}

const COOLIFY_API_PREFIX = "/api/v1";
const ADMIN_DEPLOYMENT_POLL_DELAY_MS = 5000;
const ADMIN_DEPLOYMENT_POLL_ATTEMPTS = 48;
const ADMIN_DEPLOYMENT_RETRY_DELAY_MS = 8000;
const COOLIFY_API_TIMEOUT_MS = 15000;
const APPLICATION_DELETE_POLL_DELAY_MS = 2000;
const APPLICATION_DELETE_POLL_ATTEMPTS = 15;

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
  return normalizeCoolifyRepository(
    process.env.COOLIFY_APPLICATION_REPOSITORY_URL?.trim() ||
    process.env.CELEBIX_GIT_REPOSITORY?.trim() ||
    "Webintoshi/ecommerce.celebix"
  );
}

function getRepositoryBranch(store: StoreConfig): string {
  return getStoreDeploymentBranches(store.slug, store).adminBranch;
}

function getCoolifyGithubAppUuid(): string | null {
  const value =
    process.env.COOLIFY_GITHUB_APP_UUID?.trim() ||
    process.env.COOLIFY_GITHUB_APP_SOURCE_UUID?.trim() ||
    "";

  return value || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCoolifyApiToken()}`,
    "Content-Type": "application/json"
  };
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        ...buildHeaders(),
        ...(init.headers ?? {})
      },
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(COOLIFY_API_TIMEOUT_MS)
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

    if ("applications" in payload && Array.isArray((payload as { applications?: unknown }).applications)) {
      return (payload as { applications: T[] }).applications;
    }

    if ("projects" in payload && Array.isArray((payload as { projects?: unknown }).projects)) {
      return (payload as { projects: T[] }).projects;
    }

    if ("environments" in payload && Array.isArray((payload as { environments?: unknown }).environments)) {
      return (payload as { environments: T[] }).environments;
    }
  }

  return [];
}

function resolveIdentifier(value: CoolifyProject | CoolifyEnvironment | CoolifyApplication): string {
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
      description: "Celebix shared admin and storefront applications"
    })
  });
}

async function listEnvironments(projectUuid: string): Promise<CoolifyEnvironment[]> {
  const payload = await coolifyFetch<unknown>(`/projects/${projectUuid}/environments`);
  return normalizeArrayPayload<CoolifyEnvironment>(payload);
}

async function ensureEnvironment(projectUuid: string): Promise<CoolifyEnvironment> {
  const targetName = getCoolifyEnvironmentName();
  const existing = (await listEnvironments(projectUuid)).find((environment) => environment.name === targetName);

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyEnvironment>(`/projects/${projectUuid}/environments`, {
    method: "POST",
    body: JSON.stringify({ name: targetName })
  });
}

async function listApplications(): Promise<CoolifyApplication[]> {
  const payload = await coolifyFetch<unknown>("/applications");
  return normalizeArrayPayload<CoolifyApplication>(payload);
}

function buildAdminAppPayload(store: StoreConfig, blueprint: StoreAdminDeploymentBlueprint, projectUuid: string, environmentUuid: string) {
  return {
    project_uuid: projectUuid,
    environment_uuid: environmentUuid,
    environment_name: getCoolifyEnvironmentName(),
    server_uuid: getCoolifyServerUuid(),
    destination_uuid: getCoolifyDestinationUuid(),
    git_repository: getRepositoryUrl(),
    git_branch: getRepositoryBranch(store),
    build_pack: "nixpacks",
    name: blueprint.appName,
    description: `Celebix shared admin deployment for ${store.slug}`,
    domains: blueprint.runtimeUrl,
    ports_exposes: "3000",
    base_directory: "/",
    install_command: blueprint.installCommand,
    build_command: blueprint.buildCommand,
    start_command: blueprint.startCommand,
    health_check_enabled: true,
    health_check_path: "/api/public/runtime",
    health_check_port: "3000",
    is_force_https_enabled: true,
    // Generated admin apps are deployed explicitly by owner orchestration.
    is_auto_deploy_enabled: false,
    instant_deploy: false
  };
}

function buildLegacyCompatibleAdminPayload(payload: AdminApplicationPayload) {
  const legacyPayload = { ...payload };
  delete (legacyPayload as Partial<AdminApplicationPayload>).project_uuid;
  delete (legacyPayload as Partial<AdminApplicationPayload>).environment_uuid;
  delete (legacyPayload as Partial<AdminApplicationPayload>).environment_name;
  delete (legacyPayload as Partial<AdminApplicationPayload>).server_uuid;
  delete (legacyPayload as Partial<AdminApplicationPayload>).destination_uuid;
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
    "destination_uuid"
  ];

  return (
    message.includes("Validation failed.") &&
    legacyFieldNames.some((fieldName) => message.includes(fieldName))
  );
}

async function ensureAdminApplication(
  store: StoreConfig,
  blueprint: StoreAdminDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string
): Promise<EnsuredAdminApplication> {
  const applications = await listApplications();
  const runtimeUrl = blueprint.runtimeUrl.replace(/\/+$/, "");
  const payload = buildAdminAppPayload(store, blueprint, projectUuid, environmentUuid);
  const existing =
    applications.find((application) => application.uuid === blueprint.resourceId) ||
    applications.find((application) => application.name === blueprint.appName) ||
    applications.find((application) => {
      const fqdn = application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "");
      return fqdn === runtimeUrl;
    });

  if (!existing) {
    const githubAppUuid = getCoolifyGithubAppUuid();

    if (githubAppUuid) {
      return {
        application: await coolifyFetch<CoolifyApplication>("/applications/private-github-app", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            github_app_uuid: githubAppUuid
          })
        }),
        reusedExisting: false
      };
    }

    try {
      return {
        application: await coolifyFetch<CoolifyApplication>("/applications/public", {
          method: "POST",
          body: JSON.stringify(payload)
        }),
        reusedExisting: false
      };
    } catch (error) {
      if (!isLegacyApplicationPayloadError(error)) {
        throw error;
      }

      return {
        application: await coolifyFetch<CoolifyApplication>("/applications/public", {
          method: "POST",
          body: JSON.stringify(buildLegacyCompatibleAdminPayload(payload))
        }),
        reusedExisting: false
      };
    }
  }

  const applicationUuid = resolveIdentifier(existing);

  try {
    await coolifyFetch(`/applications/${applicationUuid}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!isLegacyApplicationPayloadError(error)) {
      throw error;
    }

    await coolifyFetch(`/applications/${applicationUuid}`, {
      method: "PATCH",
      body: JSON.stringify(buildLegacyCompatibleAdminPayload(payload))
    });
  }

  return {
    application: existing,
    reusedExisting: true
  };
}

async function deleteAdminApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}`, {
    method: "DELETE"
  });
}

async function waitForAdminApplicationDeletion(applicationUuid: string): Promise<void> {
  for (let attempt = 0; attempt < APPLICATION_DELETE_POLL_ATTEMPTS; attempt += 1) {
    const applications = await listApplications();

    if (!applications.some((application) => application.uuid === applicationUuid)) {
      return;
    }

    await sleep(APPLICATION_DELETE_POLL_DELAY_MS);
  }

  throw new Error(`Admin application silinip kaybolmadi: ${applicationUuid}`);
}

async function recreateAdminApplication(
  store: StoreConfig,
  blueprint: StoreAdminDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string,
  staleApplicationUuid: string
): Promise<EnsuredAdminApplication> {
  await deleteAdminApplication(staleApplicationUuid);
  await waitForAdminApplicationDeletion(staleApplicationUuid);

  const payload = buildAdminAppPayload(store, blueprint, projectUuid, environmentUuid);
  const githubAppUuid = getCoolifyGithubAppUuid();

  if (githubAppUuid) {
    return {
      application: await coolifyFetch<CoolifyApplication>("/applications/private-github-app", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          github_app_uuid: githubAppUuid
        })
      }),
      reusedExisting: false
    };
  }

  try {
    return {
      application: await coolifyFetch<CoolifyApplication>("/applications/public", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
      reusedExisting: false
    };
  } catch (error) {
    if (!isLegacyApplicationPayloadError(error)) {
      throw error;
    }

    return {
      application: await coolifyFetch<CoolifyApplication>("/applications/public", {
        method: "POST",
        body: JSON.stringify(buildLegacyCompatibleAdminPayload(payload))
      }),
      reusedExisting: false
    };
  }
}

async function syncApplicationEnv(applicationUuid: string, envEntries: Record<string, string>): Promise<void> {
  const payload = {
    data: Object.entries(envEntries).map(([key, value]) => {
      const preparedValue = prepareCoolifyEnvValue(value);

      return {
        key,
        value: preparedValue.value,
        is_literal: preparedValue.isLiteral,
        is_build_time: true,
        is_runtime: true,
        is_multiline: preparedValue.isMultiline
      } satisfies CoolifyBulkEnvEntry;
    })
  };

  await coolifyFetch(`/applications/${applicationUuid}/envs/bulk`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

async function startApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/deploy?uuid=${encodeURIComponent(applicationUuid)}&force=true`, {
    method: "GET"
  });
}

async function waitForAdminRuntime(
  store: StoreConfig,
  deploymentMarker: string,
): Promise<StoreAdminDeploymentBlueprint> {
  let lastBlueprint: StoreAdminDeploymentBlueprint | null = null;

  for (let attempt = 0; attempt < ADMIN_DEPLOYMENT_POLL_ATTEMPTS; attempt += 1) {
    lastBlueprint = await getStoreAdminDeploymentBlueprint(store.slug, { deploymentMarker });

    if (lastBlueprint.runtimeConsistent) {
      return lastBlueprint;
    }

    await sleep(ADMIN_DEPLOYMENT_POLL_DELAY_MS);
  }

  return lastBlueprint ?? getStoreAdminDeploymentBlueprint(store.slug, { deploymentMarker });
}

async function reconcileConfiguredAdminRuntime(
  slug: string,
  options: {
    resourceId?: string | null;
    message?: string | null;
    externallyManaged?: boolean;
  } = {},
): Promise<AdminDeploymentProvisioningResult | null> {
  const currentBlueprint = await getStoreAdminDeploymentBlueprint(slug);

  if (!currentBlueprint.runtimeConsistent || currentBlueprint.status !== "configured") {
    return null;
  }

  updateStoreAdminDeploymentConfig(slug, {
    deploymentStatus: "configured",
    deploymentName: currentBlueprint.appName,
    runtimeUrl: currentBlueprint.runtimeUrl,
    resourceId: currentBlueprint.resourceId ?? options.resourceId ?? undefined,
    deployedAt: new Date().toISOString(),
    lastError: currentBlueprint.runtimeMessage ?? undefined,
  });

  return {
    appName: currentBlueprint.appName,
    resourceId: currentBlueprint.resourceId ?? options.resourceId ?? null,
    runtimeUrl: currentBlueprint.runtimeUrl,
    status: "configured",
    runtimeConsistent: true,
    message: options.message ?? currentBlueprint.runtimeMessage,
    externallyManaged: options.externallyManaged ?? false,
  };
}

export async function provisionAdminDeploymentForStore(
  slug: string,
  options: AdminDeploymentProvisioningOptions = {},
): Promise<AdminDeploymentProvisioningResult> {
  const store = requireStoreConfig(slug);
  const deploymentMarker = `admin-${Date.now()}`;
  let blueprint = await getStoreAdminDeploymentBlueprint(slug, { deploymentMarker });
  const shouldWaitForRuntime = options.waitForRuntime ?? true;
  let currentApplicationUuid = blueprint.resourceId ?? null;
  const hasCoolifyAuthority = Boolean(
    process.env.COOLIFY_API_URL?.trim() &&
    process.env.COOLIFY_API_TOKEN?.trim()
  );
  const alreadyHealthy = await reconcileConfiguredAdminRuntime(slug, {
    resourceId: blueprint.resourceId,
    message: "Admin deployment zaten healthy; owner tekrar deploy baslatmadi.",
    externallyManaged: !hasCoolifyAuthority && !blueprint.resourceId,
  });

  if (alreadyHealthy) {
    return alreadyHealthy;
  }

  if (
    blueprint.runtimeConsistent &&
    blueprint.status === "configured" &&
    !blueprint.resourceId &&
    !hasCoolifyAuthority
  ) {
    return {
      appName: blueprint.appName,
      resourceId: null,
      runtimeUrl: blueprint.runtimeUrl,
      status: "configured",
      runtimeConsistent: true,
      message: "Mevcut dis deployment bu store icin zaten tutarli calisiyor.",
      externallyManaged: true
    };
  }

  if (blueprint.status === "pending-owner-env") {
    updateStoreAdminDeploymentConfig(slug, {
      deploymentStatus: "pending-owner-env",
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: blueprint.resourceId ?? undefined,
      lastError: blueprint.runtimeMessage ?? "Admin env seti eksik."
    });

    return {
      appName: blueprint.appName,
      resourceId: blueprint.resourceId,
      runtimeUrl: blueprint.runtimeUrl,
      status: "prepared",
      runtimeConsistent: false,
      message: blueprint.runtimeMessage ?? "Admin env seti eksik.",
      externallyManaged: false
    };
  }

  try {
    const project = await ensureProject(store).catch((error) => {
      throw new Error(
        `Admin deployment için Coolify proje/erişim hazirlanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const projectUuid = resolveIdentifier(project);
    const environment = await ensureEnvironment(projectUuid).catch((error) => {
      throw new Error(
        `Admin deployment için Coolify environment hazirlanamadi: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    const environmentUuid = resolveIdentifier(environment);
    let ensuredApplication = await ensureAdminApplication(store, blueprint, projectUuid, environmentUuid);
    let applicationUuid = resolveIdentifier(ensuredApplication.application);
    currentApplicationUuid = applicationUuid;
    await syncApplicationEnv(applicationUuid, blueprint.envEntries).catch((error) => {
      throw new Error(
        `Admin deployment env senkronu basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    await startApplication(applicationUuid).catch((error) => {
      throw new Error(
        `Admin deployment start basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });

    if (!shouldWaitForRuntime) {
      updateStoreAdminDeploymentConfig(slug, {
        deploymentStatus: "prepared",
        deploymentName: blueprint.appName,
        runtimeUrl: blueprint.runtimeUrl,
        resourceId: applicationUuid,
        lastError: "Admin deployment tetiklendi. Runtime dogrulamasi owner health ekranindan izlenmeli.",
      });

      return {
        appName: blueprint.appName,
        resourceId: applicationUuid,
        runtimeUrl: blueprint.runtimeUrl,
        status: "prepared",
        runtimeConsistent: false,
        message: "Admin deployment tetiklendi. Runtime dogrulamasi daha sonra yapilacak.",
        externallyManaged: false,
      };
    }

    let runtimeBlueprint: StoreAdminDeploymentBlueprint;
    try {
      runtimeBlueprint = await waitForAdminRuntime(store, deploymentMarker);
    } catch (error) {
      const recoveredDeployment = await reconcileConfiguredAdminRuntime(slug, {
        resourceId: applicationUuid,
        message: "Admin runtime gec ayaga kalkti; owner durumu otomatik toparladi.",
      });

      if (recoveredDeployment) {
        return recoveredDeployment;
      }

      throw new Error(
        `Admin runtime smoke test basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    }

    if (!runtimeBlueprint.runtimeConsistent && ensuredApplication.reusedExisting) {
      ensuredApplication = await recreateAdminApplication(
        store,
        blueprint,
        projectUuid,
        environmentUuid,
        applicationUuid,
      );
      applicationUuid = resolveIdentifier(ensuredApplication.application);

      await syncApplicationEnv(applicationUuid, blueprint.envEntries).catch((error) => {
        throw new Error(
          `Admin deployment env senkronu (recreate) basarisiz: ${
            error instanceof Error ? error.message : "bilinmeyen hata"
          }`,
        );
      });

      await startApplication(applicationUuid).catch((error) => {
        throw new Error(
          `Admin deployment start (recreate) basarisiz: ${
            error instanceof Error ? error.message : "bilinmeyen hata"
          }`,
        );
      });
      currentApplicationUuid = applicationUuid;

      try {
        runtimeBlueprint = await waitForAdminRuntime(store, deploymentMarker);
      } catch (error) {
        const recoveredDeployment = await reconcileConfiguredAdminRuntime(slug, {
          resourceId: applicationUuid,
          message: "Admin runtime recreate sonrasinda gec ayaga kalkti; owner durumu otomatik toparladi.",
        });

        if (recoveredDeployment) {
          return recoveredDeployment;
        }

        throw new Error(
          `Admin runtime smoke test (recreate) basarisiz: ${
            error instanceof Error ? error.message : "bilinmeyen hata"
          }`,
        );
      }
    }

    if (!runtimeBlueprint.runtimeConsistent) {
      const recoveredDeployment = await reconcileConfiguredAdminRuntime(slug, {
        resourceId: applicationUuid,
        message: "Admin runtime son kontrolde healthy bulundu; owner durumu otomatik toparladi.",
      });

      if (recoveredDeployment) {
        return recoveredDeployment;
      }

      throw new Error(
        runtimeBlueprint.runtimeMessage || "Admin runtime beklenen sure icinde tutarli cevap vermedi.",
      );
    }

    const deploymentStatus = "configured";
    const deployedAt = new Date().toISOString();

    updateStoreAdminDeploymentConfig(slug, {
      deploymentStatus,
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: applicationUuid,
      deployedAt,
      lastError: runtimeBlueprint.runtimeMessage ?? undefined
    });

    return {
      appName: blueprint.appName,
      resourceId: applicationUuid,
      runtimeUrl: blueprint.runtimeUrl,
      status: deploymentStatus,
      runtimeConsistent: runtimeBlueprint.runtimeConsistent,
      message: runtimeBlueprint.runtimeMessage,
      externallyManaged: false
    };
  } catch (error) {
    if (shouldWaitForRuntime && currentApplicationUuid) {
      await sleep(ADMIN_DEPLOYMENT_RETRY_DELAY_MS);

      try {
        await startApplication(currentApplicationUuid);
        const retryBlueprint = await waitForAdminRuntime(store, deploymentMarker);

        if (retryBlueprint.runtimeConsistent) {
          const deploymentStatus = "configured";
          const deployedAt = new Date().toISOString();

          updateStoreAdminDeploymentConfig(slug, {
            deploymentStatus,
            deploymentName: blueprint.appName,
            runtimeUrl: blueprint.runtimeUrl,
            resourceId: currentApplicationUuid,
            deployedAt,
            lastError: "Admin deployment ilk denemede sapti; owner otomatik retry ile toparladi."
          });

          return {
            appName: blueprint.appName,
            resourceId: currentApplicationUuid,
            runtimeUrl: blueprint.runtimeUrl,
            status: deploymentStatus,
            runtimeConsistent: true,
            message: "Admin deployment ilk denemede sapti; owner otomatik retry ile toparladi.",
            externallyManaged: false
          };
        }
      } catch {
        // Retry also failed; normal recovery and failure handling below will decide the outcome.
      }
    }

    const recoveredDeployment = await reconcileConfiguredAdminRuntime(slug, {
      resourceId: currentApplicationUuid ?? blueprint.resourceId,
      message: "Admin runtime gecikmeli olarak healthy bulundu; owner failed durumunu temizledi.",
    }).catch(() => null);

    if (recoveredDeployment) {
      return recoveredDeployment;
    }

    updateStoreAdminDeploymentConfig(slug, {
      deploymentStatus: "failed",
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: currentApplicationUuid ?? blueprint.resourceId ?? undefined,
      lastError: error instanceof Error ? error.message : "Admin deployment otomasyonu basarisiz oldu."
    });

    throw error;
  }
}
