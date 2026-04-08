import "server-only";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  getConfiguredImageTransformationUrl,
  getRepoRoot,
  requireStoreConfig,
  type StoreConfig,
  updateStoreStorefrontDeploymentConfig,
} from "@celebix/platform-config";
import { getStoreSupabaseSecret } from "@/lib/store-secrets";

export interface StorefrontDeploymentBlueprint {
  storeSlug: string;
  appName: string;
  runtimeUrl: string;
  resourceId: string | null;
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

function hasGitMetadata(): boolean {
  return fs.existsSync(path.join(getRepoRoot(), ".git"));
}

function isRepoSynced(store: StoreConfig, relativeAppDir: string | null): boolean {
  if (!relativeAppDir?.trim()) {
    return false;
  }

  if (!hasGitMetadata()) {
    return store.storefront?.status === "active";
  }

  const packageJsonPath = `${relativeAppDir.replace(/\\/g, "/")}/package.json`;

  try {
    execFileSync("git", ["ls-files", "--error-unmatch", packageJsonPath], {
      cwd: getRepoRoot(),
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function buildPublicEnvEntries(store: StoreConfig): Record<string, string> {
  const socialHandle = store.slug.replace(/-/g, "");

  return {
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${store.domains.admin}`,
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
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
  const secretRecord = await getStoreSupabaseSecret(store.slug).catch(() => null);
  const configuredStoreUrl =
    store.supabase.url !== "configure-in-env" ? store.supabase.url : "";
  const supabaseUrl =
    secretRecord?.supabase_url?.trim() ||
    adminEnvEntries.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    configuredStoreUrl;
  const anonKey =
    secretRecord?.supabase_anon_key?.trim() ||
    adminEnvEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  const serviceRoleKey =
    secretRecord?.supabase_service_role_key?.trim() ||
    adminEnvEntries.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  const r2BucketName =
    adminEnvEntries.R2_BUCKET_NAME?.trim() ||
    store.r2?.bucketName?.trim() ||
    "";
  const r2PublicUrl =
    adminEnvEntries.R2_PUBLIC_URL?.trim() ||
    store.r2?.publicUrl?.trim() ||
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

  const optionalAdminEnvKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ] as const;

  for (const key of optionalAdminEnvKeys) {
    const value = adminEnvEntries[key]?.trim();

    if (value) {
      entries[key] = value;
    }
  }

  if (r2BucketName) {
    entries.R2_BUCKET_NAME = r2BucketName;
  }

  if (r2PublicUrl) {
    entries.R2_PUBLIC_URL = r2PublicUrl;
    entries.NEXT_PUBLIC_R2_PUBLIC_URL = r2PublicUrl;
  }

  return entries;
}

function hasRequiredEnv(envEntries: Record<string, string>): boolean {
  return Boolean(
    envEntries.NEXT_PUBLIC_SUPABASE_URL &&
      envEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      envEntries.SUPABASE_SERVICE_ROLE_KEY &&
      envEntries.R2_BUCKET_NAME &&
      envEntries.R2_PUBLIC_URL,
  );
}

async function readRuntimeConsistency(store: StoreConfig, runtimeUrl: string): Promise<{
  configured: boolean;
  consistent: boolean;
  message: string | null;
}> {
  try {
    const response = await fetch(`${runtimeUrl.replace(/\/+$/, "")}/api/public/runtime`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return {
        configured: false,
        consistent: false,
        message: `Storefront runtime okunamadi (${response.status})`,
      };
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
    return {
      configured: false,
      consistent: false,
      message: error instanceof Error ? error.message : "Storefront runtime erisilemiyor.",
    };
  }
}

export async function getStorefrontDeploymentBlueprint(
  slug: string,
): Promise<StorefrontDeploymentBlueprint> {
  const store = requireStoreConfig(slug);
  const envEntries = await buildEnvEntries(store);
  const runtimeUrl = store.storefront?.runtimeUrl || `https://${store.domains.storefront}`;
  const appDirectory = resolveAppDirectory(store);
  const packageJsonPath = resolvePackageJsonPath(store);
  const relativeAppDir = store.storefront?.appDir ?? null;
  const repoSynced = isRepoSynced(store, relativeAppDir);
  const requiredEnvReady = hasRequiredEnv(envEntries);
  const workspace = readWorkspaceName(store);

  let status: "pending-owner-env" | "pending-repo-sync" | "prepared" | "configured" | "failed";
  let runtimeConsistent = false;
  let runtimeMessage: string | null = null;

  if (!requiredEnvReady) {
    status = "pending-owner-env";
    runtimeMessage = "Storefront env authority henuz eksiksiz degil.";
  } else if (!packageJsonPath || !repoSynced) {
    status = "pending-repo-sync";
    runtimeMessage = "Storefront app dizini repo'da takip edilmiyor. Git senkronu gerekli.";
  } else {
    status = "prepared";
    const runtime = await readRuntimeConsistency(store, runtimeUrl);
    runtimeConsistent = runtime.consistent;
    runtimeMessage = runtime.message;
    status = runtime.configured && runtime.consistent ? "configured" : "prepared";
  }

  return {
    storeSlug: store.slug,
    appName: store.storefront?.deploymentName || `${store.slug}-storefront`,
    runtimeUrl,
    resourceId: store.storefront?.resourceId ?? null,
    workspace,
    installCommand: "npm ci --include=optional --no-audit --no-fund",
    buildCommand: `npm run build --workspace ${workspace}`,
    startCommand: `npm run start --workspace ${workspace}`,
    appDirectory,
    envLocalPath: appDirectory ? path.posix.join(relativeAppDir || "", ".env.local") : null,
    envTemplatePath: appDirectory ? path.posix.join(relativeAppDir || "", ".env.example") : null,
    envEntries,
    status,
    repoSynced,
    runtimeConsistent,
    runtimeMessage,
  };
}

export async function prepareStorefrontDeployment(
  slug: string,
): Promise<StorefrontDeploymentBlueprint> {
  const blueprint = await getStorefrontDeploymentBlueprint(slug);

  updateStoreStorefrontDeploymentConfig(slug, {
    deploymentStatus: blueprint.status,
    deploymentName: blueprint.appName,
    runtimeUrl: blueprint.runtimeUrl,
    lastError: blueprint.runtimeMessage ?? undefined,
  });

  return blueprint;
}
