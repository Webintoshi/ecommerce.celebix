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
import { prepareCoolifyEnvValue } from "@/lib/coolify-env";
import { normalizeCoolifyRepository } from "@/lib/coolify-repository";
import { getStoreDeploymentBranches } from "@/lib/platform-config-owner";

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

interface CoolifyApplicationLogsPayload {
  logs?: string | null;
}

interface CoolifyDeploymentSummary {
  deployment_uuid?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  logs?: string | null;
}

interface CoolifyStartApplicationResponse {
  message?: string | null;
  deployment_uuid?: string | null;
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

interface EnsuredStorefrontApplication {
  application: CoolifyApplication;
  reusedExisting: boolean;
}

const COOLIFY_API_PREFIX = "/api/v1";
const STOREFRONT_DEPLOYMENT_POLL_DELAY_MS = 5000;
const STOREFRONT_DEPLOYMENT_POLL_ATTEMPTS = 60;
const STOREFRONT_DEPLOYMENT_RETRY_DELAY_MS = 8000;
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
    "Webintoshi/ecommerce.celebix",
  );
}

function getRepositoryBranch(store: StoreConfig): string {
  return getStoreDeploymentBranches(store.slug, store).storefrontBranch;
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

  if (!raw) {
    return true;
  }

  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
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
    git_branch: getRepositoryBranch(store),
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
    // Generated store apps should follow their dedicated deploy branches by default.
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

function findMatchingStorefrontApplication(
  applications: CoolifyApplication[],
  blueprint: StorefrontDeploymentBlueprint,
): CoolifyApplication | null {
  const runtimeUrl = blueprint.runtimeUrl.replace(/\/+$/, "");

  return (
    applications.find((application) => application.uuid === blueprint.resourceId) ||
    applications.find((application) => application.name === blueprint.appName) ||
    applications.find((application) => {
      const fqdn =
        application.fqdn?.replace(/\/+$/, "") || application.domain?.replace(/\/+$/, "");
      return fqdn === runtimeUrl;
    }) ||
    null
  );
}

async function createStorefrontApplication(
  payload: StorefrontApplicationPayload,
): Promise<CoolifyApplication> {
  const githubAppUuid = getCoolifyGithubAppUuid();

  if (githubAppUuid) {
    return coolifyFetch<CoolifyApplication>("/applications/private-github-app", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        github_app_uuid: githubAppUuid,
      }),
    });
  }

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

async function updateStorefrontApplication(
  applicationUuid: string,
  payload: StorefrontApplicationPayload,
): Promise<void> {
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
}

async function ensureStorefrontApplication(
  store: StoreConfig,
  blueprint: StorefrontDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string,
): Promise<EnsuredStorefrontApplication> {
  const applications = await listApplications();
  const payload = buildStorefrontAppPayload(store, blueprint, projectUuid, environmentUuid);
  const existing = findMatchingStorefrontApplication(applications, blueprint);

  if (!existing) {
    return {
      application: await createStorefrontApplication(payload),
      reusedExisting: false,
    };
  }

  const applicationUuid = resolveIdentifier(existing);
  await updateStorefrontApplication(applicationUuid, payload);

  return {
    application: existing,
    reusedExisting: true,
  };
}

async function deleteStorefrontApplication(applicationUuid: string): Promise<void> {
  await coolifyFetch(`/applications/${applicationUuid}`, {
    method: "DELETE",
  });
}

async function waitForStorefrontApplicationDeletion(applicationUuid: string): Promise<void> {
  for (let attempt = 0; attempt < APPLICATION_DELETE_POLL_ATTEMPTS; attempt += 1) {
    const applications = await listApplications();

    if (!applications.some((application) => application.uuid === applicationUuid)) {
      return;
    }

    await sleep(APPLICATION_DELETE_POLL_DELAY_MS);
  }

  throw new Error(`Storefront application silinip kaybolmadi: ${applicationUuid}`);
}

async function recreateStorefrontApplication(
  store: StoreConfig,
  blueprint: StorefrontDeploymentBlueprint,
  projectUuid: string,
  environmentUuid: string,
  staleApplicationUuid: string,
): Promise<EnsuredStorefrontApplication> {
  await deleteStorefrontApplication(staleApplicationUuid);
  await waitForStorefrontApplicationDeletion(staleApplicationUuid);

  const payload = buildStorefrontAppPayload(store, blueprint, projectUuid, environmentUuid);

  return {
    application: await createStorefrontApplication(payload),
    reusedExisting: false,
  };
}

async function syncApplicationEnv(
  applicationUuid: string,
  envEntries: Record<string, string>,
): Promise<void> {
  const payload = {
    data: Object.entries(envEntries).map(
      ([key, value]) => {
        const preparedValue = prepareCoolifyEnvValue(value);

        return {
          key,
          value: preparedValue.value,
          is_literal: preparedValue.isLiteral,
          is_build_time: true,
          is_runtime: true,
          is_multiline: preparedValue.isMultiline,
        } satisfies CoolifyBulkEnvEntry;
      },
    ),
  };

  await coolifyFetch(`/applications/${applicationUuid}/envs/bulk`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function startApplication(applicationUuid: string): Promise<string | null> {
  const payload = await coolifyFetch<{ deployments?: CoolifyStartApplicationResponse[] }>(
    `/deploy?uuid=${encodeURIComponent(applicationUuid)}&force=true`,
    {
      method: "GET",
    },
  );

  const deployment = Array.isArray(payload.deployments) ? payload.deployments[0] : null;
  return deployment?.deployment_uuid?.trim() || null;
}

async function readDeploymentSummaryByUuid(deploymentUuid: string): Promise<string | null> {
  const payload = await coolifyFetch<CoolifyDeploymentSummary>(`/deployments/${deploymentUuid}`);
  const summaryParts = [
    payload.status?.trim() ? `status=${payload.status.trim()}` : null,
    payload.updated_at?.trim() ? `updated_at=${payload.updated_at.trim()}` : null,
    summarizeCoolifyLogs(payload.logs),
  ].filter(Boolean);

  return summaryParts.length > 0 ? summaryParts.join(" | ") : null;
}

async function readApplicationLogSummary(applicationUuid: string): Promise<string | null> {
  const payload = await coolifyFetch<CoolifyApplicationLogsPayload>(
    `/applications/${applicationUuid}/logs?lines=120`,
  );

  return summarizeCoolifyLogs(payload.logs);
}

async function readApplicationConfigSummary(applicationUuid: string): Promise<string | null> {
  const payload = await coolifyFetch<{
    status?: string | null;
    git_branch?: string | null;
    base_directory?: string | null;
    install_command?: string | null;
    build_command?: string | null;
    start_command?: string | null;
  }>(`/applications/${applicationUuid}`);

  const parts = [
    payload.status?.trim() ? `status=${payload.status.trim()}` : null,
    payload.git_branch?.trim() ? `branch=${payload.git_branch.trim()}` : null,
    payload.base_directory?.trim() ? `base=${payload.base_directory.trim()}` : null,
    payload.install_command?.trim() ? `install=${payload.install_command.trim()}` : null,
    payload.build_command?.trim() ? `build=${payload.build_command.trim()}` : null,
    payload.start_command?.trim() ? `start=${payload.start_command.trim()}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ").slice(0, 1200) : null;
}

async function readLatestDeploymentSummary(applicationUuid: string): Promise<string | null> {
  const payload = await coolifyFetch<unknown>(
    `/deployments/applications/${applicationUuid}?take=1&skip=0`,
  );

  const deployments = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "deployments" in payload && Array.isArray((payload as { deployments?: unknown }).deployments)
      ? (payload as { deployments: unknown[] }).deployments
      : [];

  if (deployments.length > 0) {
    const latest = deployments[0] as {
      status?: string | null;
      updated_at?: string | null;
      git_branch?: string | null;
      base_directory?: string | null;
      build_command?: string | null;
      start_command?: string | null;
    };
    const summaryParts = [
      latest.status?.trim() ? `status=${latest.status.trim()}` : null,
      latest.updated_at?.trim() ? `updated_at=${latest.updated_at.trim()}` : null,
      latest.git_branch?.trim() ? `branch=${latest.git_branch.trim()}` : null,
      latest.base_directory?.trim() ? `base=${latest.base_directory.trim()}` : null,
      latest.build_command?.trim() ? `build=${latest.build_command.trim()}` : null,
      latest.start_command?.trim() ? `start=${latest.start_command.trim()}` : null,
    ].filter(Boolean);

    return summaryParts.length > 0 ? summaryParts.join(" | ").slice(0, 1200) : null;
  }

  return null;
}

function summarizeCoolifyLogs(logs: string | null | undefined): string | null {
  const trimmedLogs = logs?.trim();

  if (!trimmedLogs) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmedLogs) as Array<{
      output?: string | null;
      command?: string | null;
      type?: string | null;
      timestamp?: string | null;
    }>;

    if (Array.isArray(parsed)) {
      const entries = parsed
        .map((entry) => {
          const output = entry.output?.replace(/\u001b\[[0-9;]*m/g, "").trim();
          const command = entry.command?.replace(/\u001b\[[0-9;]*m/g, "").trim();

          if (output) {
            return output;
          }

          if (command) {
            return command;
          }

          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      const interestingEntries = entries.filter((entry) =>
        /(ERR!|error|failed|cannot find|not found|exit code|ELIFECYCLE|Module not found|Traceback|panic|E[A-Z]{3,}|TypeError|ReferenceError|SyntaxError)/i.test(
          entry,
        ),
      );

      if (interestingEntries.length > 0) {
        return interestingEntries
          .slice(-12)
          .map(extractRelevantLogTail)
          .join(" | ")
          .slice(0, 2200);
      }

      if (entries.length > 0) {
        return entries
          .slice(-14)
          .map(extractRelevantLogTail)
          .join(" | ")
          .slice(0, 2200);
      }
    }
  } catch {
    // fall back to plain-text log summarization
  }

  const lines = trimmedLogs
    .split(/\r?\n/)
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trim())
    .filter(Boolean);

  const interestingLines = lines.filter((line) =>
    /(ERR!|error|failed|cannot find|not found|exit code|ELIFECYCLE|Module not found|Traceback|panic|E[A-Z]{3,}|TypeError|ReferenceError|SyntaxError)/i.test(
      line,
    ),
  );

  if (interestingLines.length > 0) {
    return interestingLines
      .slice(-12)
      .map(extractRelevantLogTail)
      .join(" | ")
      .slice(0, 2200);
  }

  if (lines.length === 0) {
    return null;
  }

  return lines
    .slice(-12)
    .map(extractRelevantLogTail)
    .join(" | ")
    .slice(0, 2200);
}

function extractRelevantLogTail(value: string): string {
  const normalized = value.replace(/\u001b\[[0-9;]*m/g, "").trim();

  if (normalized.length <= 900) {
    return normalized;
  }

  const codeFrameMatches = Array.from(normalized.matchAll(/\n\s*\d+\s+\|/g));

  if (codeFrameMatches.length > 0) {
    const lastCodeFrame = codeFrameMatches[codeFrameMatches.length - 1];
    const index = lastCodeFrame.index ?? -1;

    if (index >= 0) {
      const start = Math.max(0, index - 700);
      return `...${normalized.slice(start).slice(0, 2200)}`;
    }
  }

  const patterns = [
    /npm ERR!/gi,
    /error:/gi,
    /\bfailed\b/gi,
    /cannot find/gi,
    /not found/gi,
    /exit code/gi,
    /ELIFECYCLE/gi,
    /Module not found/gi,
    /TypeError/gi,
    /ReferenceError/gi,
    /SyntaxError/gi,
  ];
  let lastMatchIndex = -1;

  for (const pattern of patterns) {
    const matches = normalized.matchAll(pattern);

    for (const match of matches) {
      if (typeof match.index === "number") {
        lastMatchIndex = Math.max(lastMatchIndex, match.index);
      }
    }
  }

  if (lastMatchIndex >= 0) {
    const start = Math.max(0, lastMatchIndex - 220);
    return `...${normalized.slice(start).slice(0, 1400)}`;
  }

  return `...${normalized.slice(-1400)}`;
}

async function buildStorefrontRuntimeFailureDiagnostics(
  applicationUuid: string | null,
  deploymentUuid: string | null,
): Promise<string | null> {
  if (!applicationUuid) {
    return "Coolify uygulama UUID bilinmiyor.";
  }

  const [deploymentUuidResult, deploymentListResult, configResult, logResult] = await Promise.allSettled([
    deploymentUuid ? readDeploymentSummaryByUuid(deploymentUuid) : Promise.resolve("Coolify deployment UUID yok"),
    readLatestDeploymentSummary(applicationUuid),
    readApplicationConfigSummary(applicationUuid),
    readApplicationLogSummary(applicationUuid),
  ]);
  const parts = [
    deploymentUuidResult.status === "fulfilled"
      ? deploymentUuidResult.value
        ? `Coolify deployment ${deploymentUuidResult.value}`
        : "Coolify deployment UUID ozeti bos dondu"
      : `Coolify deployment UUID ozeti okunamadi: ${deploymentUuidResult.reason instanceof Error ? deploymentUuidResult.reason.message : "bilinmeyen hata"}`,
    deploymentListResult.status === "fulfilled"
      ? deploymentListResult.value
        ? `Coolify deployment listesi ${deploymentListResult.value}`
        : "Coolify deployment listesi bos dondu"
      : `Coolify deployment listesi okunamadi: ${deploymentListResult.reason instanceof Error ? deploymentListResult.reason.message : "bilinmeyen hata"}`,
    configResult.status === "fulfilled"
      ? configResult.value
        ? `Coolify app ${configResult.value}`
        : "Coolify app ozeti bos dondu"
      : `Coolify app ozeti okunamadi: ${configResult.reason instanceof Error ? configResult.reason.message : "bilinmeyen hata"}`,
    logResult.status === "fulfilled"
      ? logResult.value
        ? `Coolify logs ${logResult.value}`
        : "Coolify log ozeti bos dondu"
      : `Coolify log ozeti okunamadi: ${logResult.reason instanceof Error ? logResult.reason.message : "bilinmeyen hata"}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" || ") : null;
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

async function reconcileConfiguredStorefrontRuntime(
  slug: string,
  options: {
    resourceId?: string | null;
    message?: string | null;
  } = {},
): Promise<StorefrontDeploymentProvisioningResult | null> {
  const store = requireStoreConfig(slug);
  const currentBlueprint = await getStorefrontDeploymentBlueprint(slug);

  if (!currentBlueprint.runtimeConsistent || currentBlueprint.status !== "configured") {
    return null;
  }

  updateStoreStorefrontConfig(slug, {
    appDir: store.storefront?.appDir ?? "",
    status: "active",
    lastScaffoldError: store.storefront?.lastScaffoldError,
  });
  updateStoreStorefrontDeploymentConfig(slug, {
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
    repoSynced: currentBlueprint.repoSynced,
  };
}

export async function provisionStorefrontDeploymentForStore(
  slug: string,
  options: StorefrontDeploymentProvisioningOptions = {},
): Promise<StorefrontDeploymentProvisioningResult> {
  const store = requireStoreConfig(slug);
  const blueprint = await getStorefrontDeploymentBlueprint(slug);
  const shouldWaitForRuntime = options.waitForRuntime ?? true;
  let currentApplicationUuid = blueprint.resourceId ?? null;
  let currentDeploymentUuid: string | null = null;
  const alreadyHealthy = await reconcileConfiguredStorefrontRuntime(slug, {
    resourceId: blueprint.resourceId,
    message: "Storefront deployment zaten healthy; owner tekrar deploy baslatmadi.",
  });

  if (alreadyHealthy) {
    return alreadyHealthy;
  }

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
    let ensuredApplication = await ensureStorefrontApplication(
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
    currentApplicationUuid = resolveIdentifier(ensuredApplication.application);
    await syncApplicationEnv(currentApplicationUuid, blueprint.envEntries).catch((error) => {
      throw new Error(
        `Storefront env senkronu basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    });
    currentDeploymentUuid = await startApplication(currentApplicationUuid).catch((error) => {
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
        resourceId: currentApplicationUuid,
        lastError: "Storefront deployment tetiklendi. Runtime dogrulamasi owner health ekranindan izlenmeli.",
      });

      return {
        appName: blueprint.appName,
        resourceId: currentApplicationUuid,
        runtimeUrl: blueprint.runtimeUrl,
        status: "prepared",
        runtimeConsistent: false,
        message: "Storefront deployment tetiklendi. Runtime dogrulamasi daha sonra yapilacak.",
        repoSynced: blueprint.repoSynced,
      };
    }

    let runtimeBlueprint: StorefrontDeploymentBlueprint;
    try {
      runtimeBlueprint = await waitForStorefrontRuntime(store);
    } catch (error) {
      const recoveredDeployment = await reconcileConfiguredStorefrontRuntime(slug, {
        resourceId: currentApplicationUuid,
        message: "Storefront runtime gec ayaga kalkti; owner durumu otomatik toparladi.",
      });

      if (recoveredDeployment) {
        return recoveredDeployment;
      }

      throw new Error(
        `Storefront runtime smoke test basarisiz: ${
          error instanceof Error ? error.message : "bilinmeyen hata"
        }`,
      );
    }
    if (!runtimeBlueprint.runtimeConsistent) {
      if (ensuredApplication.reusedExisting && currentApplicationUuid) {
        ensuredApplication = await recreateStorefrontApplication(
          store,
          blueprint,
          projectUuid,
          environmentUuid,
          currentApplicationUuid,
        ).catch((error) => {
          throw new Error(
            `Storefront stale application recreate basarisiz: ${
              error instanceof Error ? error.message : "bilinmeyen hata"
            }`,
          );
        });
        currentApplicationUuid = resolveIdentifier(ensuredApplication.application);

        await syncApplicationEnv(currentApplicationUuid, blueprint.envEntries).catch((error) => {
          throw new Error(
            `Storefront env senkronu basarisiz: ${
              error instanceof Error ? error.message : "bilinmeyen hata"
            }`,
          );
        });
        currentDeploymentUuid = await startApplication(currentApplicationUuid).catch((error) => {
          throw new Error(
            `Storefront deployment start basarisiz: ${
              error instanceof Error ? error.message : "bilinmeyen hata"
            }`,
          );
        });
        try {
          runtimeBlueprint = await waitForStorefrontRuntime(store);
        } catch (error) {
          const recoveredDeployment = await reconcileConfiguredStorefrontRuntime(slug, {
            resourceId: currentApplicationUuid,
            message: "Storefront runtime recreate sonrasinda gec ayaga kalkti; owner durumu otomatik toparladi.",
          });

          if (recoveredDeployment) {
            return recoveredDeployment;
          }

          throw new Error(
            `Storefront runtime smoke test basarisiz: ${
              error instanceof Error ? error.message : "bilinmeyen hata"
            }`,
          );
        }
      }

      if (!runtimeBlueprint.runtimeConsistent) {
        const recoveredDeployment = await reconcileConfiguredStorefrontRuntime(slug, {
          resourceId: currentApplicationUuid,
          message: "Storefront runtime son kontrolde healthy bulundu; owner durumu otomatik toparladi.",
        });

        if (recoveredDeployment) {
          return recoveredDeployment;
        }

        const diagnostics = await buildStorefrontRuntimeFailureDiagnostics(
          currentApplicationUuid,
          currentDeploymentUuid,
        );

        throw new Error(
          diagnostics
            ? `${runtimeBlueprint.runtimeMessage || "Storefront runtime beklenen sure icinde tutarli cevap vermedi."} | ${diagnostics}`
            : runtimeBlueprint.runtimeMessage ||
                "Storefront runtime beklenen sure icinde tutarli cevap vermedi.",
        );
      }
    }

    const deploymentStatus = "configured";
    const deployedAt = new Date().toISOString();

    updateStoreStorefrontConfig(slug, {
      appDir: store.storefront?.appDir ?? "",
      status: "active",
      lastScaffoldError: store.storefront?.lastScaffoldError,
    });
    updateStoreStorefrontDeploymentConfig(slug, {
      deploymentStatus,
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: currentApplicationUuid ?? undefined,
      deployedAt,
      lastError: runtimeBlueprint.runtimeMessage ?? undefined,
    });

    return {
      appName: blueprint.appName,
      resourceId: currentApplicationUuid,
      runtimeUrl: blueprint.runtimeUrl,
      status: deploymentStatus,
      runtimeConsistent: runtimeBlueprint.runtimeConsistent,
      message: runtimeBlueprint.runtimeMessage,
      repoSynced: runtimeBlueprint.repoSynced,
    };
  } catch (error) {
    if (shouldWaitForRuntime && currentApplicationUuid) {
      await sleep(STOREFRONT_DEPLOYMENT_RETRY_DELAY_MS);

      try {
        currentDeploymentUuid = await startApplication(currentApplicationUuid);
        const retryBlueprint = await waitForStorefrontRuntime(store);

        if (retryBlueprint.runtimeConsistent) {
          const deploymentStatus = "configured";
          const deployedAt = new Date().toISOString();

          updateStoreStorefrontConfig(slug, {
            appDir: store.storefront?.appDir ?? "",
            status: "active",
            lastScaffoldError: store.storefront?.lastScaffoldError,
          });
          updateStoreStorefrontDeploymentConfig(slug, {
            deploymentStatus,
            deploymentName: blueprint.appName,
            runtimeUrl: blueprint.runtimeUrl,
            resourceId: currentApplicationUuid ?? undefined,
            deployedAt,
            lastError: "Storefront deployment ilk denemede sapti; owner otomatik retry ile toparladi.",
          });

          return {
            appName: blueprint.appName,
            resourceId: currentApplicationUuid,
            runtimeUrl: blueprint.runtimeUrl,
            status: deploymentStatus,
            runtimeConsistent: true,
            message: "Storefront deployment ilk denemede sapti; owner otomatik retry ile toparladi.",
            repoSynced: retryBlueprint.repoSynced,
          };
        }
      } catch {
        // Retry also failed; normal recovery and failure handling below will decide the outcome.
      }
    }

    const recoveredDeployment = await reconcileConfiguredStorefrontRuntime(slug, {
      resourceId: currentApplicationUuid ?? blueprint.resourceId,
      message: "Storefront runtime gecikmeli olarak healthy bulundu; owner failed durumunu temizledi.",
    }).catch(() => null);

    if (recoveredDeployment) {
      return recoveredDeployment;
    }

    updateStoreStorefrontDeploymentConfig(slug, {
      deploymentStatus: "failed",
      deploymentName: blueprint.appName,
      runtimeUrl: blueprint.runtimeUrl,
      resourceId: currentApplicationUuid ?? undefined,
      lastError:
        error instanceof Error
          ? error.message
          : "Storefront deployment otomasyonu basarisiz oldu.",
    });

    throw error;
  }
}
