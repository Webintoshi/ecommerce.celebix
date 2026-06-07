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

  return {
    websiteStatus: resolveUmamiWebsiteReadinessStatus(websiteStatus),
    websiteId: config.websiteId,
    configPath: config.bootstrap.configPath,
    scriptUrl: config.scriptUrl,
    adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
    config,
  };
}
