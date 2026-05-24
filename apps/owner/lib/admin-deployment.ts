import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getConfiguredImageTransformationUrl,
  getRepoRoot,
  requireStoreConfig,
  resolveProvisionedNextBuildCpuCap,
  type StoreConfig,
  updateStoreAdminDeploymentConfig
} from "@celebix/platform-config";
import { readCoolifySupabaseRuntimeAuthority } from "@/lib/coolify-runtime-authority";
import { diagnoseGeneratedRuntimeFailure } from "@/lib/generated-runtime-readiness";
import { resolveLightPostgresDeploymentEnv } from "@/lib/light-postgres-deployment-env";
import { resolveR2DeploymentEnv } from "@/lib/r2-deployment-env";
import { getStoreSupabaseSecret } from "@/lib/store-secrets";

export interface StoreAdminDeploymentBlueprint {
  storeSlug: string;
  appName: string;
  runtimeUrl: string;
  resourceId: string | null;
  deploymentStrategy: string;
  dockerImage: string;
  dockerImageTag: string;
  useBuildServer: boolean;
  buildServer: string;
  watchPaths: string[];
  deploymentMarker: string | null;
  workspace: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  envLocalPath: string;
  envTemplatePath: string;
  envEntries: Record<string, string>;
  status: "pending-owner-env" | "prepared" | "configured" | "failed";
  runtimeConsistent: boolean;
  runtimeMessage: string | null;
}

interface RuntimePayload {
  slug?: string | null;
  storefrontDomain?: string | null;
  adminDomain?: string | null;
  storefrontUrl?: string | null;
  adminUrl?: string | null;
  deploymentMarker?: string | null;
}

function toAbsoluteUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    return new URL(toAbsoluteUrl(value.trim())).hostname.toLocaleLowerCase("tr");
  } catch {
    return value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLocaleLowerCase("tr");
  }
}

function resolveRuntimeDomain(
  domainValue: string | null | undefined,
  urlValue: string | null | undefined,
): string | null {
  const domain = normalizeDomain(domainValue);
  const urlDomain = normalizeDomain(urlValue);

  if (
    domain &&
    !domain.includes("localhost") &&
    !domain.endsWith(".local")
  ) {
    return domain;
  }

  return urlDomain ?? domain;
}

function resolveEnvLocalPath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
}

function resolveEnvTemplatePath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.envTemplatePath || `stores/${store.slug}/admin.env.example`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
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

function readExistingAdminEnvMap(store: StoreConfig): Record<string, string> {
  const envLocalPath = resolveEnvLocalPath(store);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
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

async function readAdminEnvEntries(
  store: StoreConfig,
  options?: { deploymentMarker?: string | null },
): Promise<Record<string, string>> {
  const runtimeUrl = store.bootstrap?.adminDeploymentRuntimeUrl || `https://${store.domains.admin}`;
  const existingEnv = readExistingAdminEnvMap(store);

  if (store.databaseMode === "light_postgres") {
    const {
      runtimeDatabaseUrl,
      runtimeDatabaseName,
      runtimeSslMode,
    } = resolveLightPostgresDeploymentEnv(store, existingEnv);
    const envEntries: Record<string, string> = {
      CELEBIX_NEXT_BUILD_CPUS: resolveProvisionedNextBuildCpuCap(2, ["CELEBIX_ADMIN_BUILD_CPUS"]),
      CELEBIX_ADMIN_DEPLOYMENT_MARKER:
        options?.deploymentMarker?.trim() ||
        existingEnv.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() ||
        "",
      STORE_SLUG: store.slug,
      ADMIN_DATABASE_MODE: "light_postgres",
      DATABASE_MODE: "light_postgres",
      LIGHT_POSTGRES_DATABASE_NAME: runtimeDatabaseName,
      LIGHT_POSTGRES_DATABASE_SSLMODE: runtimeSslMode,
      NEXT_PUBLIC_RUNTIME_DATABASE_MODE: "light_postgres",
      AUTH_SETUP_STATUS: "blocked_auth_setup",
      NEXT_PUBLIC_AUTH_SETUP_STATUS: "blocked_auth_setup",
      NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
      NEXT_PUBLIC_ADMIN_URL: runtimeUrl,
      NEXT_PUBLIC_STORE_NAME: store.name,
      NEXT_PUBLIC_STORE_TAGLINE: store.branding?.tagline?.trim() || "",
      NEXT_PUBLIC_DEFAULT_PRODUCT_BRAND:
        store.branding?.defaultProductBrand?.trim() || store.name,
      NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
      NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
      NEXT_PUBLIC_DEMO_DOMAIN: store.domains.demo,
      NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL:
        existingEnv.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL?.trim() ||
        process.env.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL?.trim() ||
        getConfiguredImageTransformationUrl(),
      ...getSharedRedisEnvEntries(),
    };

    if (runtimeDatabaseUrl) {
      envEntries.LIGHT_POSTGRES_DATABASE_URL = runtimeDatabaseUrl;
      envEntries.DATABASE_URL = envEntries.DATABASE_URL || runtimeDatabaseUrl;
      envEntries.DATABASE_DIRECT_URL = envEntries.DATABASE_DIRECT_URL || runtimeDatabaseUrl;
    }

    for (const key of [
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
      "DATABASE_POOL_MODE",
      "DATABASE_SSLMODE",
    ] as const) {
      const value = existingEnv[key]?.trim();

      if (value) {
        envEntries[key] = value;
      }
    }

    const r2EnvEntries = await resolveR2DeploymentEnv(store, existingEnv);

    for (const [key, value] of Object.entries(r2EnvEntries)) {
      if (value.trim()) {
        envEntries[key] = value;
      }
    }

    if (envEntries.DATABASE_SSLMODE && !envEntries.LIGHT_POSTGRES_DATABASE_SSLMODE) {
      envEntries.LIGHT_POSTGRES_DATABASE_SSLMODE = envEntries.DATABASE_SSLMODE;
    }

    return envEntries;
  }

  const secretRecord = await getStoreSupabaseSecret(store.slug).catch(() => null);
  const runtimeAuthority =
    store.supabase.provider === "self_hosted_coolify" && store.bootstrap?.supabaseResourceId
      ? await readCoolifySupabaseRuntimeAuthority(store.bootstrap.supabaseResourceId).catch(() => null)
      : null;
  const supabaseUrl =
    runtimeAuthority?.publicUrl?.trim() ||
    secretRecord?.supabase_url?.trim() ||
    existingEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    (store.supabase.url !== "configure-in-env" ? store.supabase.url : "");
  const anonKey =
    runtimeAuthority?.publicKey?.trim() ||
    secretRecord?.supabase_anon_key?.trim() ||
    existingEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  const serviceRoleKey =
    runtimeAuthority?.serviceKey?.trim() ||
    secretRecord?.supabase_service_role_key?.trim() ||
    existingEnv.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";

  const envEntries: Record<string, string> = {
    CELEBIX_NEXT_BUILD_CPUS: resolveProvisionedNextBuildCpuCap(2, ["CELEBIX_ADMIN_BUILD_CPUS"]),
    CELEBIX_ADMIN_DEPLOYMENT_MARKER:
      options?.deploymentMarker?.trim() ||
      existingEnv.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() ||
      "",
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: runtimeUrl,
    NEXT_PUBLIC_STORE_NAME: store.name,
    NEXT_PUBLIC_STORE_TAGLINE: store.branding?.tagline?.trim() || "",
    NEXT_PUBLIC_DEFAULT_PRODUCT_BRAND:
      store.branding?.defaultProductBrand?.trim() || store.name,
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
    NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL:
      existingEnv.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL?.trim() ||
      process.env.NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL?.trim() ||
      getConfiguredImageTransformationUrl(),
    ...getSharedRedisEnvEntries(),
  };

  if (anonKey) {
    envEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  }

  if (serviceRoleKey) {
    envEntries.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  }

  const derivedSelfHostedServerUrl =
    store.supabase.provider === "self_hosted_coolify"
      ? (runtimeAuthority?.publicUrl?.trim() || supabaseUrl || "")
      : "";
  const serverUrl =
    derivedSelfHostedServerUrl ||
    existingEnv.SUPABASE_SERVER_URL?.trim() ||
    existingEnv.SUPABASE_INTERNAL_URL?.trim() ||
    runtimeAuthority?.internalApiUrl?.trim() ||
    "";

  if (serverUrl) {
    envEntries.SUPABASE_SERVER_URL = serverUrl;
  }

  if (secretRecord?.supabase_legacy_url?.trim() || existingEnv.SUPABASE_LEGACY_URL?.trim()) {
    envEntries.SUPABASE_LEGACY_URL =
      secretRecord?.supabase_legacy_url?.trim() || existingEnv.SUPABASE_LEGACY_URL.trim();
  }

  if (secretRecord?.supabase_legacy_anon_key?.trim() || existingEnv.SUPABASE_LEGACY_ANON_KEY?.trim()) {
    envEntries.SUPABASE_LEGACY_ANON_KEY =
      secretRecord?.supabase_legacy_anon_key?.trim() || existingEnv.SUPABASE_LEGACY_ANON_KEY.trim();
  }

  const r2EnvEntries = await resolveR2DeploymentEnv(store, existingEnv);

  for (const [key, value] of Object.entries(r2EnvEntries)) {
    if (value.trim()) {
      envEntries[key] = value;
    }
  }

  return envEntries;
}

async function readRuntimeConsistency(
  store: StoreConfig,
  runtimeUrl: string,
  expectedDeploymentMarker?: string | null,
  resourceId?: string | null,
): Promise<{
  configured: boolean;
  consistent: boolean;
  message: string | null;
}> {
  const buildFallbackResult = async (
    responseStatus?: number | null,
    errorMessage?: string | null,
  ): Promise<{
    configured: boolean;
    consistent: boolean;
    message: string | null;
  }> => {
    const diagnosis = await diagnoseGeneratedRuntimeFailure({
      runtimeUrl,
      resourceId,
      responseStatus,
      errorMessage,
    });

    if (diagnosis?.internalHealthy) {
      return {
        configured: true,
        consistent: true,
        message: diagnosis.message,
      };
    }

    return {
      configured: false,
      consistent: false,
      message: diagnosis?.message ?? errorMessage ?? "Admin runtime erisilemiyor.",
    };
  };

  try {
    const response = await fetch(`${runtimeUrl.replace(/\/+$/, "")}/api/public/runtime`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return buildFallbackResult(response.status, `Admin runtime okunamadi (${response.status})`);
    }

    const payload = (await response.json()) as RuntimePayload;
    const mismatches: string[] = [];
    const expectedStorefront = normalizeDomain(store.domains.storefront);
    const expectedAdmin = normalizeDomain(store.domains.admin);
    const runtimeStorefront = resolveRuntimeDomain(payload.storefrontDomain, payload.storefrontUrl);
    const runtimeAdmin = resolveRuntimeDomain(payload.adminDomain, payload.adminUrl);

    if (payload.slug && payload.slug !== store.slug) {
      mismatches.push(`slug ${payload.slug}`);
    }

    if (expectedStorefront && runtimeStorefront && expectedStorefront !== runtimeStorefront) {
      mismatches.push(`storefront ${runtimeStorefront}`);
    }

    if (expectedAdmin && runtimeAdmin && expectedAdmin !== runtimeAdmin) {
      mismatches.push(`admin ${runtimeAdmin}`);
    }

    if (
      expectedDeploymentMarker?.trim() &&
      payload.deploymentMarker?.trim() !== expectedDeploymentMarker.trim()
    ) {
      mismatches.push(`marker ${payload.deploymentMarker?.trim() || "missing"}`);
    }

    return {
      configured: true,
      consistent: mismatches.length === 0,
      message: mismatches.length > 0 ? `Runtime drift: ${mismatches.join(" / ")}` : null
    };
  } catch (error) {
    return buildFallbackResult(
      null,
      error instanceof Error ? error.message : "Admin runtime erisilemiyor.",
    );
  }
}

export async function getStoreAdminDeploymentBlueprint(
  slug: string,
  options?: { deploymentMarker?: string | null },
): Promise<StoreAdminDeploymentBlueprint> {
  const store = requireStoreConfig(slug);
  const envEntries = await readAdminEnvEntries(store, options);
  const runtimeUrl = store.bootstrap?.adminDeploymentRuntimeUrl || `https://${store.domains.admin}`;
  const deploymentConfig = store.bootstrap?.adminDeployment;
  const dockerImage = deploymentConfig?.image ?? `ghcr.io/celebixco/${store.slug}-admin`;
  const dockerImageTag = deploymentConfig?.imageTag ?? "production";
  const useBuildServer = deploymentConfig?.useBuildServer ?? true;
  const buildServer = deploymentConfig?.buildServer ?? "celebix-build-01";
  const deploymentMarker = envEntries.CELEBIX_ADMIN_DEPLOYMENT_MARKER?.trim() || null;
  const hasRequiredEnv = store.databaseMode === "light_postgres"
    ? Boolean(
        envEntries.LIGHT_POSTGRES_DATABASE_URL &&
          envEntries.LIGHT_POSTGRES_DATABASE_NAME &&
          envEntries.NEXT_PUBLIC_STORE_DOMAIN &&
          envEntries.NEXT_PUBLIC_ADMIN_DOMAIN,
      )
    : Boolean(
        envEntries.NEXT_PUBLIC_SUPABASE_URL &&
          envEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          envEntries.SUPABASE_SERVICE_ROLE_KEY,
      );
  const buildServerReady = Boolean(
    dockerImage.trim() &&
      dockerImageTag.trim() &&
      useBuildServer &&
      buildServer.trim(),
  );

  let status: "pending-owner-env" | "prepared" | "configured" | "failed" = hasRequiredEnv ? "prepared" : "pending-owner-env";
  let runtimeMessage: string | null = hasRequiredEnv ? null : "Admin deployment authority henuz yazilmamis.";
  let runtimeConsistent = false;

  if (!buildServerReady) {
    status = "failed";
    runtimeMessage =
      "Admin deploy authority build-server/GHCR zorunlulugunu karsilamiyor.";
  } else {
    const runtime = await readRuntimeConsistency(
      store,
      runtimeUrl,
      deploymentMarker,
      store.bootstrap?.adminDeploymentResourceId ?? null,
    );
    runtimeConsistent = runtime.consistent;
    runtimeMessage = runtime.message ?? runtimeMessage;
    status = runtime.configured && runtime.consistent ? "configured" : hasRequiredEnv ? "prepared" : "pending-owner-env";
  }

  return {
    storeSlug: store.slug,
    appName: store.bootstrap?.adminDeploymentName || `${store.slug}-admin`,
    runtimeUrl,
    resourceId: store.bootstrap?.adminDeploymentResourceId ?? null,
    deploymentStrategy: deploymentConfig?.strategy ?? "build_server_ghcr",
    dockerImage,
    dockerImageTag,
    useBuildServer,
    buildServer,
    watchPaths: deploymentConfig?.watchPaths ?? ["apps/admin/**", "packages/**"],
    deploymentMarker,
    workspace: "@celebix/admin",
    installCommand: "npm ci --include=optional --no-audit --no-fund",
    buildCommand:
      "npm run build --workspace @celebix/admin && node ./apps/admin/scripts/prepare-standalone-runtime.cjs",
    startCommand: "node ./apps/admin/scripts/start-standalone.cjs",
    envLocalPath: path.relative(getRepoRoot(), resolveEnvLocalPath(store)).replace(/\\/g, "/"),
    envTemplatePath: path.relative(getRepoRoot(), resolveEnvTemplatePath(store)).replace(/\\/g, "/"),
    envEntries,
    status,
    runtimeConsistent,
    runtimeMessage
  };
}

export async function prepareStoreAdminDeployment(slug: string): Promise<StoreAdminDeploymentBlueprint> {
  const blueprint = await getStoreAdminDeploymentBlueprint(slug);

  updateStoreAdminDeploymentConfig(slug, {
    deploymentStatus: blueprint.status,
    deploymentName: blueprint.appName,
    runtimeUrl: blueprint.runtimeUrl,
    lastError: blueprint.runtimeMessage ?? undefined
  });

  return blueprint;
}
