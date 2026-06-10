import "server-only";

import {
  updateStoreUmamiConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  buildUmamiWebsiteConfigForStore,
  getUmamiAuthorityRequirements,
  resolveUmamiWebsiteReadinessStatus,
  toUmamiWebsiteJson,
  type GeneratedUmamiWebsiteConfig,
  type UmamiAuthorityRequirement,
} from "@/lib/umami-website-config";

export interface UmamiProvisioningStatus {
  configured: boolean;
  host: string;
  hasApiToken: boolean;
  requirements: UmamiAuthorityRequirement[];
  lastError?: string;
}

export interface UmamiProvisioningResult {
  websiteStatus: "ready" | "pending" | "failed";
  websiteId: string | null;
  configPath: string;
  scriptUrl: string;
  adminSummaryEndpoint: string;
  config: GeneratedUmamiWebsiteConfig;
}

interface AppliedUmamiWebsite {
  websiteId: string;
}

function readEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildUmamiApiUrl(config: GeneratedUmamiWebsiteConfig, pathname: string): string {
  const baseUrl = config.apiUrl.replace(/\/+$/, "");

  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function getUmamiApiToken(): string | null {
  return readEnv(["UMAMI_API_TOKEN", "UMAMI_MANAGEMENT_TOKEN"]);
}

function buildUmamiHeaders(authMode: "bearer" | "api-key"): HeadersInit {
  const token = getUmamiApiToken();

  if (!token) {
    throw new Error("Umami API token eksik.");
  }

  return authMode === "bearer"
    ? {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }
    : {
        "x-umami-api-key": token,
        "Content-Type": "application/json",
      };
}

function mergeHeaders(baseHeaders: HeadersInit, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }

  return headers;
}

async function umamiFetch(
  config: GeneratedUmamiWebsiteConfig,
  pathname: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = buildUmamiApiUrl(config, pathname);
  const response = await fetch(url, {
    ...init,
    headers: mergeHeaders(buildUmamiHeaders("bearer"), init.headers),
  });
  const finalResponse = response.status === 401 || response.status === 403
    ? await fetch(url, {
        ...init,
        headers: mergeHeaders(buildUmamiHeaders("api-key"), init.headers),
      })
    : response;

  if (!finalResponse.ok) {
    throw new Error(`Umami API ${init.method ?? "GET"} ${pathname} HTTP ${finalResponse.status}`);
  }

  if (finalResponse.status === 204) {
    return null;
  }

  try {
    return await finalResponse.json();
  } catch {
    return null;
  }
}

function normalizeCollection(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
    );
  }

  const record = asRecord(payload);

  for (const key of ["data", "items", "websites", "results"]) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
      );
    }
  }

  return [];
}

function readUmamiWebsiteId(payload: unknown): string | null {
  const record = asRecord(payload);
  const nestedData = asRecord(record.data);

  return (
    readOptionalString(record.id) ??
    readOptionalString(record.websiteId) ??
    readOptionalString(nestedData.id) ??
    readOptionalString(nestedData.websiteId)
  );
}

function matchesUmamiWebsite(
  website: Record<string, unknown>,
  config: GeneratedUmamiWebsiteConfig,
): boolean {
  return (
    readOptionalString(website.domain) === config.canonicalDomain ||
    readOptionalString(website.domain) === config.domain ||
    readOptionalString(website.name) === config.websiteName
  );
}

async function findExistingUmamiWebsite(
  config: GeneratedUmamiWebsiteConfig,
): Promise<AppliedUmamiWebsite | null> {
  try {
    const payload = await umamiFetch(config, "/websites");
    const existing = normalizeCollection(payload).find((website) => matchesUmamiWebsite(website, config));
    const websiteId = existing ? readUmamiWebsiteId(existing) : null;

    return websiteId ? { websiteId } : null;
  } catch {
    return null;
  }
}

async function applyUmamiWebsite(config: GeneratedUmamiWebsiteConfig): Promise<AppliedUmamiWebsite> {
  const configuredWebsiteId = config.websiteId?.trim();

  if (configuredWebsiteId) {
    return { websiteId: configuredWebsiteId };
  }

  const existing = await findExistingUmamiWebsite(config);

  if (existing) {
    return existing;
  }

  const payload = await umamiFetch(config, "/websites", {
    method: "POST",
    body: JSON.stringify(toUmamiWebsiteJson(config)),
  });
  const websiteId = readUmamiWebsiteId(payload);

  if (!websiteId) {
    throw new Error("Umami website created response id icermiyor.");
  }

  return { websiteId };
}

export function getUmamiBootstrapStatus(): UmamiProvisioningStatus {
  const requirements = getUmamiAuthorityRequirements();
  const host = process.env.UMAMI_BASE_URL?.trim() || process.env.NEXT_PUBLIC_UMAMI_BASE_URL?.trim() || "https://analytics.celebix.co";
  const apiToken = requirements.find((entry) => entry.key === "UMAMI_API_TOKEN");

  return {
    configured: Boolean(apiToken?.present),
    host,
    hasApiToken: Boolean(apiToken?.present),
    requirements,
    lastError: apiToken?.present
      ? undefined
      : "Umami live apply/admin analytics token authority eksik; config generation pending apply modunda calisir.",
  };
}

export function buildUmamiBootstrapWebsiteFile(store: StoreConfig): {
  path: string;
  website: Record<string, unknown>;
} {
  const config = buildUmamiWebsiteConfigForStore(store);

  return {
    path: config.bootstrap.configPath,
    website: toUmamiWebsiteJson(config),
  };
}

export async function provisionUmamiForStore(store: StoreConfig): Promise<UmamiProvisioningResult> {
  const config = buildUmamiWebsiteConfigForStore(store);
  const status = getUmamiBootstrapStatus();
  const websiteStatus = config.websiteId ? "configured" : "pending";

  updateStoreUmamiConfig(store.slug, {
    websiteStatus,
    websiteId: config.websiteId,
    websiteName: config.websiteName,
    domain: config.domain,
    canonicalDomain: config.canonicalDomain,
    host: config.host,
    apiUrl: config.apiUrl,
    scriptUrl: config.scriptUrl,
    timezone: config.timezone,
    storefrontTrackingStatus: config.websiteId ? "configured" : "pending",
    adminAnalyticsStatus: config.websiteId && status.hasApiToken ? "configured" : "pending",
    serverTokenStatus: status.hasApiToken ? "configured" : "pending-owner-env",
    adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
    metrics: config.adminAnalytics.metrics,
    bootstrapConfigPath: config.bootstrap.configPath,
    bootstrapApplyState: "pending",
    analyticsStatus: config.websiteId ? "configured" : "pending_analytics_setup",
    lastProvisionError: config.websiteId && status.hasApiToken ? null : status.lastError ?? null,
  });

  const pendingResult: UmamiProvisioningResult = {
    websiteStatus: resolveUmamiWebsiteReadinessStatus(websiteStatus),
    websiteId: config.websiteId,
    configPath: config.bootstrap.configPath,
    scriptUrl: config.scriptUrl,
    adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
    config,
  };

  if (!status.configured) {
    return pendingResult;
  }

  try {
    const website = await applyUmamiWebsite(config);

    updateStoreUmamiConfig(store.slug, {
      websiteStatus: "configured",
      websiteId: website.websiteId,
      websiteName: config.websiteName,
      domain: config.domain,
      canonicalDomain: config.canonicalDomain,
      host: config.host,
      apiUrl: config.apiUrl,
      scriptUrl: config.scriptUrl,
      timezone: config.timezone,
      storefrontTrackingStatus: "configured",
      adminAnalyticsStatus: "configured",
      serverTokenStatus: "configured",
      adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
      metrics: config.adminAnalytics.metrics,
      bootstrapConfigPath: config.bootstrap.configPath,
      bootstrapApplyState: "applied",
      analyticsStatus: "configured",
      lastProvisionError: null,
    });

    return {
      ...pendingResult,
      websiteStatus: "ready",
      websiteId: website.websiteId,
    };
  } catch (error) {
    updateStoreUmamiConfig(store.slug, {
      websiteStatus: "failed",
      websiteId: null,
      websiteName: config.websiteName,
      domain: config.domain,
      canonicalDomain: config.canonicalDomain,
      host: config.host,
      apiUrl: config.apiUrl,
      scriptUrl: config.scriptUrl,
      timezone: config.timezone,
      storefrontTrackingStatus: "failed",
      adminAnalyticsStatus: "failed",
      serverTokenStatus: status.hasApiToken ? "configured" : "pending-owner-env",
      adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
      metrics: config.adminAnalytics.metrics,
      bootstrapConfigPath: config.bootstrap.configPath,
      bootstrapApplyState: "failed",
      analyticsStatus: "pending_analytics_setup",
      lastProvisionError: error instanceof Error ? error.message : "Umami live apply failed.",
    });

    throw error;
  }
}
