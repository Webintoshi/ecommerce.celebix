import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  getRepoRoot,
  type StoreConfig,
  upsertStoreAdminEnvLocal,
  updateStoreSupabaseConfig,
} from "@celebix/platform-config";
import { upsertStoreSupabaseSecret } from "@/lib/store-secrets";
import type { SupabaseBootstrapStatus, SupabaseOrganization, SupabaseProvisioningResult } from "@/lib/supabase-bootstrap.shared";

interface CoolifyProject {
  uuid?: string;
  name?: string;
}

interface CoolifyEnvironment {
  uuid?: string;
  name?: string;
}

interface CoolifyService {
  uuid?: string;
  service_uuid?: string;
  resource_uuid?: string;
  name?: string;
}

interface CoolifyEnvironmentVariable {
  key?: string;
  name?: string;
  value?: string | null;
}

interface CoolifyServer {
  ip?: string | null;
}

const COOLIFY_API_PREFIX = "/api/v1";
const ENV_POLL_DELAY_MS = 5000;
const ENV_POLL_ATTEMPTS = 24;
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

function getCoolifyProjectName(): string {
  return process.env.COOLIFY_PROJECT_NAME?.trim() || "CELEBIX E-COMMERCE YONETIM";
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

function getCoolifyServerPublicIp(): string | null {
  const value = process.env.COOLIFY_SERVER_PUBLIC_IP?.trim();
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

    if ("services" in payload && Array.isArray((payload as { services?: unknown }).services)) {
      return (payload as { services: T[] }).services;
    }

    if ("environments" in payload && Array.isArray((payload as { environments?: unknown }).environments)) {
      return (payload as { environments: T[] }).environments;
    }

    if ("projects" in payload && Array.isArray((payload as { projects?: unknown }).projects)) {
      return (payload as { projects: T[] }).projects;
    }
  }

  return [];
}

function buildSupabaseServiceName(store: StoreConfig): string {
  return `${sanitizeSupabaseHostLabel(store.slug)}-db`;
}

function buildSupabaseDashboardUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/project/default`;
}

function sanitizeSupabaseHostLabel(value: string): string {
  const normalized = value
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 40) || "store";
}

function pickSupabaseHostLabel(store: StoreConfig): string {
  return sanitizeSupabaseHostLabel(store.slug);
}

function parseEnvFile(contents: string): Record<string, string> {
  const envMap: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (key) {
      envMap[key] = value;
    }
  }

  return envMap;
}

function resolveAdminEnvLocalPath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
}

function buildLegacyAdminAuthEnvEntries(store: StoreConfig, nextSupabaseUrl: string): Record<string, string> {
  const envLocalPath = resolveAdminEnvLocalPath(store);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  const envMap = parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
  const legacyUrl = envMap.SUPABASE_LEGACY_URL?.trim();
  const legacyAnonKey = envMap.SUPABASE_LEGACY_ANON_KEY?.trim();

  if (legacyUrl && legacyAnonKey) {
    return {
      SUPABASE_LEGACY_URL: legacyUrl,
      SUPABASE_LEGACY_ANON_KEY: legacyAnonKey,
    };
  }

  const currentUrl = envMap.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const currentAnonKey = envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (
    currentUrl &&
    currentAnonKey &&
    currentUrl !== nextSupabaseUrl &&
    currentUrl !== "configure-in-env"
  ) {
    return {
      SUPABASE_LEGACY_URL: currentUrl,
      SUPABASE_LEGACY_ANON_KEY: currentAnonKey,
    };
  }

  return {};
}

function isIpv4Address(value: string): boolean {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value.trim());
}

async function resolveCoolifyPublicIp(): Promise<string> {
  const explicitIp = getCoolifyServerPublicIp();
  if (explicitIp) {
    if (!isIpv4Address(explicitIp)) {
      throw new Error("COOLIFY_SERVER_PUBLIC_IP gecersiz. IPv4 adresi bekleniyor.");
    }

    return explicitIp;
  }

  const server = await coolifyFetch<CoolifyServer>(`/servers/${getCoolifyServerUuid()}`);
  const serverIp = server.ip?.trim();

  if (serverIp && isIpv4Address(serverIp)) {
    return serverIp;
  }

  const apiHostname = new URL(getCoolifyApiUrl()).hostname;
  const resolved = await lookup(apiHostname, { family: 4 });

  if (!resolved.address || !isIpv4Address(resolved.address)) {
    throw new Error("Coolify public IPv4 adresi cozulmedi. COOLIFY_SERVER_PUBLIC_IP tanimlayin.");
  }

  return resolved.address;
}

async function buildSupabasePublicUrl(store: StoreConfig): Promise<string> {
  const publicIp = await resolveCoolifyPublicIp();
  const hostLabel = pickSupabaseHostLabel(store);
  return `https://supabasekong-${hostLabel}.${publicIp}.sslip.io`;
}

function buildAdminEnvEntries(store: StoreConfig, projectUrl: string, publicKey: string, serviceKey: string): Record<string, string> {
  return {
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SUPABASE_URL: projectUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
    NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${store.domains.admin}`,
    CLOUDFLARE_ACCOUNT_ID: "your-r2-account-id",
    R2_ACCESS_KEY_ID: "your-r2-access-key",
    R2_SECRET_ACCESS_KEY: "your-r2-secret",
    R2_BUCKET_NAME: "your-r2-bucket",
    R2_PUBLIC_URL: `https://cdn.${store.domains.storefront}`,
  };
}

function getSharedRedisEnvEntries(): Record<string, string> {
  const redisUrl =
    process.env.COOLIFY_SHARED_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    process.env.CELEBIX_REDIS_URL?.trim() ||
    "";
  const redisPrefix =
    process.env.COOLIFY_SHARED_REDIS_PREFIX?.trim() ||
    process.env.REDIS_PREFIX?.trim() ||
    process.env.CELEBIX_REDIS_PREFIX?.trim() ||
    "";

  const entries: Record<string, string> = {};
  if (redisUrl) {
    entries.REDIS_URL = redisUrl;
  }
  if (redisPrefix) {
    entries.REDIS_PREFIX = redisPrefix;
  }

  return entries;
}

function hasExistingProvisionedProject(store: StoreConfig): boolean {
  const projectRef = store.supabase.projectRef?.trim();
  return Boolean(projectRef && projectRef !== "pending-owner-bootstrap");
}

function resolveIdentifier(value: CoolifyProject | CoolifyEnvironment | CoolifyService): string {
  const identifier =
    value.uuid ||
    ("service_uuid" in value ? value.service_uuid : undefined) ||
    ("resource_uuid" in value ? value.resource_uuid : undefined);

  if (!identifier) {
    throw new Error("Coolify kaynagi icin UUID donmedi.");
  }

  return identifier;
}

async function listProjects(): Promise<CoolifyProject[]> {
  const payload = await coolifyFetch<unknown>("/projects");
  return normalizeArrayPayload<CoolifyProject>(payload);
}

async function ensureProject(): Promise<CoolifyProject> {
  const targetName = getCoolifyProjectName();
  const existing = (await listProjects()).find((project) => project.name === targetName);

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyProject>("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: targetName,
      description: "Celebix store-level self-hosted Supabase resources",
    }),
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
    body: JSON.stringify({
      name: targetName,
    }),
  });
}

async function createSupabaseService(store: StoreConfig, projectUuid: string, environmentUuid: string): Promise<CoolifyService> {
  const publicUrl = await buildSupabasePublicUrl(store);

  return coolifyFetch<CoolifyService>("/services", {
    method: "POST",
    body: JSON.stringify({
      type: "supabase",
      name: buildSupabaseServiceName(store),
      description: `Self-hosted Supabase for ${store.slug}`,
      project_uuid: projectUuid,
      environment_uuid: environmentUuid,
      server_uuid: getCoolifyServerUuid(),
      destination_uuid: getCoolifyDestinationUuid(),
      instant_deploy: true,
      urls: [
        {
          name: "supabase-kong",
          url: publicUrl,
        },
      ],
      force_domain_override: true,
    }),
  });
}

async function listServiceEnvs(serviceUuid: string): Promise<CoolifyEnvironmentVariable[]> {
  const payload = await coolifyFetch<unknown>(`/services/${serviceUuid}/envs`);
  return normalizeArrayPayload<CoolifyEnvironmentVariable>(payload);
}

function findEnvValue(variables: CoolifyEnvironmentVariable[], candidates: string[]): string | null {
  const candidateSet = new Set(candidates.map((value) => value.toUpperCase()));
  const match = variables.find((variable) => {
    const key = (variable.key || variable.name || "").toUpperCase();
    return key && candidateSet.has(key);
  });

  return match?.value?.trim() || null;
}

async function waitForSupabaseRuntime(serviceUuid: string): Promise<{
  dashboardUrl: string;
  publicKey: string;
  publicUrl: string;
  serviceKey: string;
}> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < ENV_POLL_ATTEMPTS; attempt += 1) {
    try {
      const variables = await listServiceEnvs(serviceUuid);
      const publicUrl = findEnvValue(variables, [
        "SERVICE_URL_SUPABASEKONG",
        "SUPABASE_URL",
      ])?.replace(/\/+$/, "") || null;
      const publicKey = findEnvValue(variables, [
        "SERVICE_SUPABASEANON_KEY",
        "SERVICE_SUPABASE_ANON_KEY",
        "SUPABASE_ANON_KEY",
      ]);
      const serviceKey = findEnvValue(variables, [
        "SERVICE_SUPABASESERVICE_KEY",
        "SERVICE_SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]);

      if (publicUrl && publicKey && serviceKey) {
        return {
          publicUrl,
          dashboardUrl: buildSupabaseDashboardUrl(publicUrl),
          publicKey,
          serviceKey,
        };
      }

      lastError = new Error("Coolify Supabase runtime env bilgileri henuz hazir degil.");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Coolify service env bilgileri okunamadi.");
    }

    await sleep(ENV_POLL_DELAY_MS);
  }

  throw lastError ?? new Error("Coolify Supabase runtime env bilgileri alinmadi.");
}

function buildProjectReference(store: StoreConfig, serviceUuid: string): string {
  return `coolify:${store.slug}:${serviceUuid}`;
}

function buildOrganization(): SupabaseOrganization {
  const projectName = getCoolifyProjectName();
  return {
    id: crypto.createHash("sha1").update(projectName).digest("hex").slice(0, 12),
    slug: projectName.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-"),
    name: projectName,
  };
}

export async function getSupabaseBootstrapStatus(): Promise<SupabaseBootstrapStatus> {
  const hasApiUrl = Boolean(process.env.COOLIFY_API_URL?.trim());
  const hasToken = Boolean(process.env.COOLIFY_API_TOKEN?.trim());
  const hasServer = Boolean(process.env.COOLIFY_SERVER_UUID?.trim());
  const hasDestination = Boolean(process.env.COOLIFY_DESTINATION_UUID?.trim());
  const configured = hasApiUrl && hasToken && hasServer && hasDestination;

  return {
    configured,
    provider: "self_hosted_coolify",
    hasAccessToken: hasToken,
    hasOrgId: Boolean(process.env.COOLIFY_PROJECT_NAME?.trim()),
    defaultRegion: "self-hosted",
    defaultPlan: "coolify",
    organizations: configured ? [buildOrganization()] : [],
    resolvedOrganizationSlug: configured ? buildOrganization().slug : null,
    lastError: configured
      ? undefined
      : "Self-hosted Supabase icin COOLIFY_API_URL, COOLIFY_API_TOKEN, COOLIFY_SERVER_UUID ve COOLIFY_DESTINATION_UUID gerekli.",
  };
}

export async function provisionSupabaseForStore(store: StoreConfig): Promise<SupabaseProvisioningResult> {
  if (hasExistingProvisionedProject(store)) {
    throw new Error(
      `Bu magaza icin zaten bir Supabase kaynagi olusturulmus: ${store.supabase.projectRef}. Yeni provisioning oncesi mevcut kaynagi temizleyin veya store kaydini sifirlayin.`,
    );
  }

  const organization = buildOrganization();
  const project = await ensureProject();
  const projectUuid = resolveIdentifier(project);
  const environment = await ensureEnvironment(projectUuid);
  const environmentUuid = resolveIdentifier(environment);

  try {
    const service = await createSupabaseService(store, projectUuid, environmentUuid);
    const serviceUuid = resolveIdentifier(service);
    const { publicUrl, dashboardUrl, publicKey, serviceKey } = await waitForSupabaseRuntime(serviceUuid);
    const legacyAdminAuthEntries = buildLegacyAdminAuthEnvEntries(store, publicUrl);
    const adminEnvLocalPath = upsertStoreAdminEnvLocal(store.slug, {
      ...legacyAdminAuthEntries,
      ...buildAdminEnvEntries(store, publicUrl, publicKey, serviceKey),
      ...getSharedRedisEnvEntries(),
    });
    await upsertStoreSupabaseSecret({
      slug: store.slug,
      supabaseUrl: publicUrl,
      supabaseServiceRoleKey: serviceKey,
      supabaseAnonKey: publicKey,
      supabaseLegacyUrl: legacyAdminAuthEntries.SUPABASE_LEGACY_URL ?? null,
      supabaseLegacyAnonKey: legacyAdminAuthEntries.SUPABASE_LEGACY_ANON_KEY ?? null,
    });

    updateStoreSupabaseConfig(store.slug, {
      projectRef: buildProjectReference(store, serviceUuid),
      url: publicUrl,
      provider: "self_hosted_coolify",
      organizationSlug: organization.slug,
      provisioningStatus: "configured",
      dashboardUrl,
      projectName: service.name || buildSupabaseServiceName(store),
      resourceId: serviceUuid,
      adminEnvLocalPath: path.relative(getRepoRoot(), adminEnvLocalPath).replace(/\\/g, "/"),
    });

    return {
      provider: "self_hosted_coolify",
      organization,
      projectRef: buildProjectReference(store, serviceUuid),
      projectUrl: publicUrl,
      adminEnvLocalPath,
      dashboardUrl,
      projectName: service.name || buildSupabaseServiceName(store),
      resourceId: serviceUuid,
    };
  } catch (error) {
    updateStoreSupabaseConfig(store.slug, {
      projectRef: store.supabase.projectRef || "pending-owner-bootstrap",
      url: store.supabase.url,
      provider: "self_hosted_coolify",
      organizationSlug: organization.slug,
      provisioningStatus: "failed",
      dashboardUrl: store.supabase.dashboardUrl,
      projectName: buildSupabaseServiceName(store),
      lastProvisionError: error instanceof Error ? error.message : "Coolify Supabase provisioning basarisiz oldu.",
    });

    throw error;
  }
}
