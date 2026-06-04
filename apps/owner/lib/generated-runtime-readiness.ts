import "server-only";

import { lookup } from "node:dns/promises";

export type GeneratedRuntimeIssueCode = "pending_dns" | "proxy_not_ready" | "runtime_unreachable";

export interface GeneratedRuntimeDiagnosis {
  code: GeneratedRuntimeIssueCode;
  message: string;
  hostname: string;
  publicDnsReady: boolean;
  internalHealthy: boolean;
  applicationStatus: string | null;
}

const COOLIFY_API_PREFIX = "/api/v1";
const COOLIFY_API_TIMEOUT_MS = 15_000;
const GENERATED_DOMAIN_SUFFIXES = [".celebix.site", ".demo.celebix.co"];

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getCoolifyApiUrl(): string | null {
  const value = process.env.COOLIFY_API_URL?.trim() || "";
  return value ? value.replace(/\/+$/, "") : null;
}

function getCoolifyApiToken(): string | null {
  const value = process.env.COOLIFY_API_TOKEN?.trim() || "";
  return value || null;
}

function buildHeaders(): HeadersInit {
  const token = getCoolifyApiToken();

  if (!token) {
    throw new Error("COOLIFY_API_TOKEN tanimli degil.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function coolifyFetch<T>(pathname: string): Promise<T> {
  const apiUrl = getCoolifyApiUrl();

  if (!apiUrl) {
    throw new Error("COOLIFY_API_URL tanimli degil.");
  }

  const response = await fetch(`${apiUrl}${COOLIFY_API_PREFIX}${pathname}`, {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(COOLIFY_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Coolify API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  return (await response.json()) as T;
}

function toAbsoluteUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
}

function normalizeHostname(runtimeUrl: string): string | null {
  try {
    return new URL(toAbsoluteUrl(runtimeUrl)).hostname.toLocaleLowerCase("tr");
  } catch {
    return null;
  }
}

async function isHostnameResolvable(hostname: string): Promise<boolean> {
  try {
    await lookup(hostname);
    return true;
  } catch {
    return false;
  }
}

async function readCoolifyApplicationStatus(resourceId: string): Promise<string | null> {
  try {
    const payload = await coolifyFetch<{ status?: string | null }>(`/applications/${resourceId}`);
    return readOptionalString(payload.status);
  } catch {
    return null;
  }
}

export function isGeneratedManagedHostname(hostname: string | null | undefined): boolean {
  if (!hostname?.trim()) {
    return false;
  }

  const normalized = hostname.trim().toLocaleLowerCase("tr");
  return GENERATED_DOMAIN_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function readGeneratedRuntimeIssueCode(
  message: string | null | undefined,
): GeneratedRuntimeIssueCode | null {
  const normalized = readOptionalString(message)?.toLocaleLowerCase("tr");

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("pending_dns:")) {
    return "pending_dns";
  }

  if (normalized.startsWith("proxy_not_ready:")) {
    return "proxy_not_ready";
  }

  if (normalized.startsWith("runtime_unreachable:")) {
    return "runtime_unreachable";
  }

  return null;
}

export async function diagnoseGeneratedRuntimeFailure(input: {
  runtimeUrl: string;
  resourceId?: string | null;
  responseStatus?: number | null;
  errorMessage?: string | null;
}): Promise<GeneratedRuntimeDiagnosis | null> {
  const hostname = normalizeHostname(input.runtimeUrl);

  if (!hostname) {
    return null;
  }

  const generatedHostname = isGeneratedManagedHostname(hostname);

  if (!generatedHostname && !input.resourceId?.trim()) {
    return null;
  }

  const publicDnsReady = generatedHostname ? await isHostnameResolvable(hostname) : true;
  const applicationStatus = input.resourceId?.trim()
    ? await readCoolifyApplicationStatus(input.resourceId.trim())
    : null;
  const internalHealthy = applicationStatus?.toLocaleLowerCase("tr") === "running:healthy";
  const statusSuffix = input.responseStatus ? ` (HTTP ${input.responseStatus})` : "";
  const detailSuffix = input.errorMessage?.trim() ? `: ${input.errorMessage.trim()}` : "";

  if (!publicDnsReady && generatedHostname) {
    return {
      code: "pending_dns",
      message: internalHealthy
        ? `pending_dns: ${hostname} public DNS henuz hazir degil; generated runtime icerden healthy.`
        : `pending_dns: ${hostname} public DNS henuz hazir degil.`,
      hostname,
      publicDnsReady,
      internalHealthy,
      applicationStatus,
    };
  }

  if (internalHealthy) {
    return {
      code: "proxy_not_ready",
      message: `proxy_not_ready: ${hostname} public proxy/runtime henuz hazir degil${statusSuffix}${detailSuffix}; generated runtime icerden healthy.`,
      hostname,
      publicDnsReady,
      internalHealthy,
      applicationStatus,
    };
  }

  return {
    code: "runtime_unreachable",
    message: `runtime_unreachable: ${hostname} public runtime erisilemiyor${statusSuffix}${detailSuffix}.`,
    hostname,
    publicDnsReady,
    internalHealthy,
    applicationStatus,
  };
}
