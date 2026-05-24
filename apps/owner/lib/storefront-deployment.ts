import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getConfiguredImageTransformationUrl,
  getRepoRoot,
  requireStoreConfig,
  resolveProvisionedNextBuildCpuCap,
  type StoreConfig,
} from "@celebix/platform-config";
import { readCoolifySupabaseRuntimeAuthority } from "@/lib/coolify-runtime-authority";
import {
  getExpectedStorefrontAppDir,
  getExpectedStorefrontPackageName,
} from "../../../packages/platform-config/src/index";
import { diagnoseGeneratedRuntimeFailure } from "@/lib/generated-runtime-readiness";
import { getStoreSupabaseSecret } from "@/lib/store-secrets";
import { verifyStorefrontBranchState } from "@/lib/storefront-repo-sync";
import { resolveR2DeploymentEnv } from "@/lib/r2-deployment-env";
import { applyStorefrontAuthorityPatch } from "@/lib/store-config-authority";
import { resolveLightPostgresDeploymentEnv } from "@/lib/light-postgres-deployment-env";

export interface StorefrontDeploymentBlueprint {
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
  serverPort: string;
  workspace: string;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  appDirectory: string | null;
  envLocalPath: string | null;
  envTemplatePath: string | null;
  envEntries: Record<string, string>;
  status: "pending-owner-env" | "pending-repo-sync" | "prepared" | "configured" | "failed";
  repoSynced: boolean;
  runtimeConsistent: boolean;
  runtimeMessage: string | null;
}

interface RuntimePayload {
  slug?: string | null;
  storefrontDomain?: string | null;
  adminDomain?: string | null;
  storefrontUrl?: string | null;
  adminUrl?: string | null;
}

const SHARED_STOREFRONT_ENV_KEYS = [
  "ACCOUNTING_CREDENTIALS_KEY",
  "DEEPL_API_KEY",
  "GA4_CLIENT_EMAIL",
  "GA4_PRIVATE_KEY",
  "GA4_PROJECT_ID",
  "GA4_PROPERTY_ID",
  "GEMINI_API_KEY",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_PROJECT_ID",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "MARKETPLACE_AMAZON_BASE_URL",
  "MARKETPLACE_CREDENTIALS_KEY",
  "MARKETPLACE_HEPSIBURADA_LISTING_BASE_URL",
  "MARKETPLACE_HEPSIBURADA_ORDER_BASE_URL",
  "MARKETPLACE_INTEGRATION_NAME",
  "MARKETPLACE_N11_BASE_URL",
  "MARKETPLACE_TRENDYOL_BASE_URL",
  "NEXT_PUBLIC_FREE_SHIPPING_TEXT",
  "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
  "NEXT_PUBLIC_GTM_ID",
];

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

function resolveAdminEnvEntries(store: StoreConfig): Record<string, string> {
  const repoRoot = getRepoRoot();
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  const envLocalPath = path.isAbsolute(relativePath) ? relativePath : path.join(repoRoot, relativePath);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
}

function resolveAppDirectory(store: StoreConfig): string | null {
  const relativePath = store.storefront?.appDir?.trim();

  if (!relativePath) {
    return null;
  }

  return path.join(getRepoRoot(), relativePath);
}

function resolvePackageJsonPath(store: StoreConfig): string | null {
  const appDirectory = resolveAppDirectory(store);

  if (!appDirectory) {
    return null;
  }

  const packageJsonPath = path.join(appDirectory, "package.json");
  return fs.existsSync(packageJsonPath) ? packageJsonPath : null;
}

function readWorkspaceName(store: StoreConfig): string {
  const packageJsonPath = resolvePackageJsonPath(store);

  if (!packageJsonPath) {
    return `@celebix/storefront-${store.slug}`;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
    return packageJson.name?.trim() || `@celebix/storefront-${store.slug}`;
  } catch {
    return `@celebix/storefront-${store.slug}`;
  }
}

function readWorkspaceServerPort(store: StoreConfig): string {
  const packageJsonPath = resolvePackageJsonPath(store);

  if (!packageJsonPath) {
    return "3000";
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const startScript = packageJson.scripts?.start?.trim() || "";
    const explicitPort = startScript.match(/--port\s+(\d{2,5})/i)?.[1];

    if (explicitPort) {
      return explicitPort;
    }
  } catch {
    // fall through to the default port
  }

  return "3000";
}

function buildPublicEnvEntries(store: StoreConfig): Record<string, string> {
  const socialHandle = store.slug.replace(/-/g, "");

  return {
    CELEBIX_NEXT_BUILD_CPUS: resolveProvisionedNextBuildCpuCap(3, ["CELEBIX_STOREFRONT_BUILD_CPUS"]),
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${store.domains.admin}`,
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
    NEXT_PUBLIC_DEMO_DOMAIN: store.domains.demo,
    NEXT_PUBLIC_STORE_NAME: store.name,
    NEXT_PUBLIC_STORE_TAGLINE:
      store.branding?.tagline || `${store.name} icin Celebix storefront referansi`,
    NEXT_PUBLIC_STORE_DESCRIPTION: `${store.name} icin ortak Celebix storefront temasi.`,
    NEXT_PUBLIC_STORE_SUPPORT_EMAIL:
      store.branding?.supportEmail || `destek@${store.domains.storefront}`,
    NEXT_PUBLIC_STORE_SUPPORT_PHONE: store.branding?.supportPhone || "+90 532 000 00 00",
    NEXT_PUBLIC_STORE_LOGO: "/placeholder-storefront-logo.svg",
    NEXT_PUBLIC_STORE_INSTAGRAM: `https://instagram.com/${socialHandle}`,
    NEXT_PUBLIC_STORE_FACEBOOK: `https://facebook.com/${socialHandle}`,
    NEXT_PUBLIC_STORE_TWITTER: `https://x.com/${socialHandle}`,
    NEXT_PUBLIC_FREE_SHIPPING_TEXT:
      process.env.NEXT_PUBLIC_FREE_SHIPPING_TEXT?.trim() || "500 TL uzeri siparislerde ucretsiz kargo",
    NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL: getConfiguredImageTransformationUrl(),
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

function getSharedOptionalEnvEntries(): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const key of SHARED_STOREFRONT_ENV_KEYS) {
    const value = process.env[key]?.trim();

    if (value) {
      entries[key] = value;
    }
  }

  return entries;
}

async function buildEnvEntries(store: StoreConfig): Promise<Record<string, string>> {
  const adminEnvEntries = resolveAdminEnvEntries(store);

  if (store.databaseMode === "light_postgres") {
    const {
      runtimeDatabaseUrl,
      runtimeDatabaseName,
      runtimeSslMode,
    } = resolveLightPostgresDeploymentEnv(store, adminEnvEntries);
    const entries: Record<string, string> = {
      ...buildPublicEnvEntries(store),
      DATABASE_MODE: "light_postgres",
      LIGHT_POSTGRES_DATABASE_NAME: runtimeDatabaseName,
      LIGHT_POSTGRES_DATABASE_SSLMODE: runtimeSslMode,
      NEXT_PUBLIC_RUNTIME_DATABASE_MODE: "light_postgres",
      ...getSharedRedisEnvEntries(),
      ...getSharedOptionalEnvEntries(),
    };

    if (runtimeDatabaseUrl) {
      entries.LIGHT_POSTGRES_DATABASE_URL = runtimeDatabaseUrl;
      entries.DATABASE_URL = entries.DATABASE_URL || runtimeDatabaseUrl;
      entries.DATABASE_DIRECT_URL = entries.DATABASE_DIRECT_URL || runtimeDatabaseUrl;
    }

    for (const key of [
      "DATABASE_URL",
      "DATABASE_DIRECT_URL",
      "DATABASE_POOL_MODE",
      "DATABASE_SSLMODE",
    ] as const) {
      const value = adminEnvEntries[key]?.trim();

      if (value) {
        entries[key] = value;
      }
    }

    const r2EnvEntries = await resolveR2DeploymentEnv(store, adminEnvEntries);

    for (const [key, value] of Object.entries(r2EnvEntries)) {
      if (value.trim()) {
        entries[key] = value;
      }
    }

    if (r2EnvEntries.R2_PUBLIC_URL?.trim()) {
      entries.NEXT_PUBLIC_R2_PUBLIC_URL = r2EnvEntries.R2_PUBLIC_URL.trim();
    }

    if (entries.DATABASE_SSLMODE && !entries.LIGHT_POSTGRES_DATABASE_SSLMODE) {
      entries.LIGHT_POSTGRES_DATABASE_SSLMODE = entries.DATABASE_SSLMODE;
    }

    return entries;
  }

  const secretRecord = await getStoreSupabaseSecret(store.slug).catch(() => null);
  const runtimeAuthority =
    store.supabase.provider === "self_hosted_coolify" && store.bootstrap?.supabaseResourceId
      ? await readCoolifySupabaseRuntimeAuthority(store.bootstrap.supabaseResourceId).catch(() => null)
      : null;
  const configuredStoreUrl =
    store.supabase.url !== "configure-in-env" ? store.supabase.url : "";
  const supabaseUrl =
    runtimeAuthority?.publicUrl?.trim() ||
    secretRecord?.supabase_url?.trim() ||
    adminEnvEntries.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    configuredStoreUrl;
  const anonKey =
    runtimeAuthority?.publicKey?.trim() ||
    secretRecord?.supabase_anon_key?.trim() ||
    adminEnvEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  const serviceRoleKey =
    runtimeAuthority?.serviceKey?.trim() ||
    secretRecord?.supabase_service_role_key?.trim() ||
    adminEnvEntries.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  const entries: Record<string, string> = {
    ...buildPublicEnvEntries(store),
    ...getSharedRedisEnvEntries(),
    ...getSharedOptionalEnvEntries(),
  };

  if (supabaseUrl) {
    entries.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  }
  if (anonKey) {
    entries.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  }
  if (serviceRoleKey) {
    entries.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  }

  const r2EnvEntries = await resolveR2DeploymentEnv(store, adminEnvEntries);

  for (const [key, value] of Object.entries(r2EnvEntries)) {
    if (value.trim()) {
      entries[key] = value;
    }
  }

  if (r2EnvEntries.R2_PUBLIC_URL?.trim()) {
    entries.NEXT_PUBLIC_R2_PUBLIC_URL = r2EnvEntries.R2_PUBLIC_URL.trim();
  }

  return entries;
}

function hasRequiredEnv(envEntries: Record<string, string>): boolean {
  if (envEntries.DATABASE_MODE === "light_postgres") {
    return Boolean(
      envEntries.LIGHT_POSTGRES_DATABASE_URL &&
        envEntries.LIGHT_POSTGRES_DATABASE_NAME &&
        envEntries.NEXT_PUBLIC_STORE_DOMAIN &&
        envEntries.NEXT_PUBLIC_ADMIN_DOMAIN,
    );
  }

  return Boolean(
    envEntries.NEXT_PUBLIC_SUPABASE_URL &&
      envEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      envEntries.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function readRuntimeConsistency(
  store: StoreConfig,
  runtimeUrl: string,
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
      message: diagnosis?.message ?? errorMessage ?? "Storefront runtime erisilemiyor.",
    };
  };

  try {
    const response = await fetch(`${runtimeUrl.replace(/\/+$/, "")}/api/public/runtime`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return buildFallbackResult(response.status, `Storefront runtime okunamadi (${response.status})`);
    }

    const payload = (await response.json()) as RuntimePayload;
    const mismatches: string[] = [];
    const expectedStorefront = normalizeDomain(store.domains.storefront);
    const expectedAdmin = normalizeDomain(store.domains.admin);
    const runtimeStorefront = normalizeDomain(payload.storefrontDomain ?? payload.storefrontUrl);
    const runtimeAdmin = normalizeDomain(payload.adminDomain ?? payload.adminUrl);

    if (payload.slug && payload.slug !== store.slug) {
      mismatches.push(`slug ${payload.slug}`);
    }

    if (expectedStorefront && runtimeStorefront && expectedStorefront !== runtimeStorefront) {
      mismatches.push(`storefront ${runtimeStorefront}`);
    }

    if (expectedAdmin && runtimeAdmin && expectedAdmin !== runtimeAdmin) {
      mismatches.push(`admin ${runtimeAdmin}`);
    }

    return {
      configured: true,
      consistent: mismatches.length === 0,
      message: mismatches.length > 0 ? `Runtime drift: ${mismatches.join(" / ")}` : null,
    };
  } catch (error) {
    return buildFallbackResult(
      null,
      error instanceof Error ? error.message : "Storefront runtime erisilemiyor.",
    );
  }
}

export async function getStorefrontDeploymentBlueprint(
  slug: string,
): Promise<StorefrontDeploymentBlueprint> {
  const store = requireStoreConfig(slug);
  const envEntries = await buildEnvEntries(store);
  const runtimeUrl = store.storefront?.runtimeUrl || `https://${store.domains.storefront}`;
  const deploymentConfig = store.storefront?.deployment;
  const appDirectory = resolveAppDirectory(store);
  const packageJsonPath = resolvePackageJsonPath(store);
  const relativeAppDir = store.storefront?.appDir ?? null;
  const requiredEnvReady = hasRequiredEnv(envEntries);
  const expectedAppDir = getExpectedStorefrontAppDir(store.slug);
  const expectedPackageName = getExpectedStorefrontPackageName(store.slug);
  const workspace = readWorkspaceName(store);
  const serverPort = readWorkspaceServerPort(store);
  const dockerImage = deploymentConfig?.image ?? `ghcr.io/celebixco/${store.slug}-storefront`;
  const dockerImageTag = deploymentConfig?.imageTag ?? "production";
  const useBuildServer = deploymentConfig?.useBuildServer ?? true;
  const buildServer = deploymentConfig?.buildServer ?? "celebix-build-01";
  const buildServerReady = Boolean(
    dockerImage.trim() &&
      dockerImageTag.trim() &&
      useBuildServer &&
      buildServer.trim(),
  );

  let status: "pending-owner-env" | "pending-repo-sync" | "prepared" | "configured" | "failed" =
    "pending-repo-sync";
  let runtimeConsistent = false;
  let runtimeMessage: string | null = null;
  let runtimeConfigured = false;
  let repoSynced = false;

  if (!relativeAppDir) {
    if (store.storefront?.lastScaffoldedAt) {
      status = "failed";
      runtimeMessage = "Storefront scaffold zamani yazilmis ama appDir authority kaybolmus.";
    } else {
      status = "pending-repo-sync";
      runtimeMessage = "Storefront scaffold authority henuz yazilmamis.";
    }
  } else if (relativeAppDir !== expectedAppDir) {
    status = "failed";
    runtimeMessage = `Storefront appDir beklenen dizinle uyusmuyor: ${relativeAppDir}`;
  } else if (!appDirectory || !packageJsonPath) {
    status = "failed";
    runtimeMessage = "Storefront scaffold dosyalari eksik: app dizini veya package.json bulunamadi.";
  } else {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };

      if (packageJson.name?.trim() !== expectedPackageName) {
        status = "failed";
        runtimeMessage = `Storefront package name uyusmuyor: ${packageJson.name || "bos"}`;
      }
    } catch {
      status = "failed";
      runtimeMessage = "Storefront package.json okunamadi.";
    }
  }

  if (!buildServerReady) {
    status = "failed";
    runtimeMessage =
      "Storefront deploy authority build-server/GHCR zorunlulugunu karsilamiyor.";
  } else if (status === "failed") {
    // keep the earlier failure reason
  } else if (!requiredEnvReady) {
    status = "pending-owner-env";
    runtimeMessage = "Storefront env authority henuz eksiksiz degil.";
  } else {
    const branchVerification = await verifyStorefrontBranchState(store.slug);
    repoSynced = branchVerification.verified;

    if (!branchVerification.verified) {
      status =
        !branchVerification.appDirMatches || !branchVerification.packageNameMatches
          ? "failed"
          : "pending-repo-sync";
      runtimeMessage =
        branchVerification.message ||
        "Storefront deploy branch'i hedef package ve authority dosyalarini henuz icermiyor.";
    } else {
      status = "prepared";
      const runtime = await readRuntimeConsistency(store, runtimeUrl, store.storefront?.resourceId ?? null);
      runtimeConfigured = runtime.configured;
      runtimeConsistent = runtime.consistent;
      runtimeMessage = runtime.message;
      status = runtime.configured && runtime.consistent ? "configured" : "prepared";
    }
  }

  return {
    storeSlug: store.slug,
    appName: store.storefront?.deploymentName || `${store.slug}-storefront`,
    runtimeUrl,
    resourceId: store.storefront?.resourceId ?? null,
    deploymentStrategy: deploymentConfig?.strategy ?? "build_server_ghcr",
    dockerImage,
    dockerImageTag,
    useBuildServer,
    buildServer,
    watchPaths:
      deploymentConfig?.watchPaths ?? [`apps/storefront-${store.slug}/**`, "packages/**"],
    serverPort,
    workspace,
    installCommand: "npm install --include=optional --no-audit --no-fund",
    buildCommand: `npm run build --workspace ${workspace}`,
    startCommand: `npm run start --workspace ${workspace}`,
    appDirectory,
    envLocalPath: relativeAppDir ? path.posix.join(relativeAppDir, ".env.local") : null,
    envTemplatePath: relativeAppDir ? path.posix.join(relativeAppDir, ".env.example") : null,
    envEntries,
    status,
    repoSynced,
    runtimeConsistent: runtimeConfigured && runtimeConsistent,
    runtimeMessage,
  };
}

export async function prepareStorefrontDeployment(
  slug: string,
): Promise<StorefrontDeploymentBlueprint> {
  const blueprint = await getStorefrontDeploymentBlueprint(slug);

  await applyStorefrontAuthorityPatch(slug, {
    deploymentStatus: blueprint.status,
    deploymentName: blueprint.appName,
    runtimeUrl: blueprint.runtimeUrl,
    lastDeploymentError: blueprint.runtimeMessage ?? null,
  });

  return blueprint;
}
