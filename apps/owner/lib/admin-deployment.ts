import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  requireStoreConfig,
  type StoreConfig,
  updateStoreAdminDeploymentConfig
} from "@celebix/platform-config";

export interface StoreAdminDeploymentBlueprint {
  storeSlug: string;
  appName: string;
  runtimeUrl: string;
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
}

function toAbsoluteUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
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

function resolveEnvLocalPath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
}

function resolveEnvTemplatePath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.envTemplatePath || `stores/${store.slug}/admin.env.example`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
}

function readAdminEnvEntries(store: StoreConfig): Record<string, string> {
  const envLocalPath = resolveEnvLocalPath(store);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
}

async function readRuntimeConsistency(store: StoreConfig, runtimeUrl: string): Promise<{
  configured: boolean;
  consistent: boolean;
  message: string | null;
}> {
  try {
    const response = await fetch(`${runtimeUrl.replace(/\/+$/, "")}/api/public/runtime`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return {
        configured: false,
        consistent: false,
        message: `Admin runtime okunamadi (${response.status})`
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
      message: mismatches.length > 0 ? `Runtime drift: ${mismatches.join(" / ")}` : null
    };
  } catch (error) {
    return {
      configured: false,
      consistent: false,
      message: error instanceof Error ? error.message : "Admin runtime erisilemiyor."
    };
  }
}

export async function getStoreAdminDeploymentBlueprint(slug: string): Promise<StoreAdminDeploymentBlueprint> {
  const store = requireStoreConfig(slug);
  const envEntries = readAdminEnvEntries(store);
  const runtimeUrl = store.bootstrap?.adminDeploymentRuntimeUrl || `https://${store.domains.admin}`;
  const hasRequiredEnv = Boolean(
    envEntries.NEXT_PUBLIC_SUPABASE_URL &&
      envEntries.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      envEntries.SUPABASE_SERVICE_ROLE_KEY
  );

  let status: "pending-owner-env" | "prepared" | "configured" | "failed" = hasRequiredEnv ? "prepared" : "pending-owner-env";
  let runtimeMessage: string | null = hasRequiredEnv ? null : "Admin deployment env seti eksik.";
  let runtimeConsistent = false;

  if (hasRequiredEnv) {
    const runtime = await readRuntimeConsistency(store, runtimeUrl);
    runtimeConsistent = runtime.consistent;
    runtimeMessage = runtime.message;
    status = runtime.configured && runtime.consistent ? "configured" : "prepared";
  }

  return {
    storeSlug: store.slug,
    appName: store.bootstrap?.adminDeploymentName || `${store.slug}-admin`,
    runtimeUrl,
    workspace: "@celebix/admin",
    installCommand: "npm ci --include=optional --no-audit --no-fund",
    buildCommand: "npm run build --workspace @celebix/admin",
    startCommand: "npm run start --workspace @celebix/admin",
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
