import "server-only";

import type { StoreConfig, StoreStandardResourceStatus } from "@celebix/platform-config";

export type UmamiProvisioningEnvironment = "production" | "preview" | "staging";

export interface UmamiWebsiteConfigInput {
  storeSlug: string;
  storeName: string;
  storefrontDomain: string;
  canonicalDomain: string;
  environment: UmamiProvisioningEnvironment;
}

export interface GeneratedUmamiWebsiteConfig {
  websiteName: string;
  domain: string;
  canonicalDomain: string;
  host: string;
  apiUrl: string;
  scriptUrl: string;
  timezone: string;
  websiteId: string | null;
  tracking: {
    scriptUrl: string;
    dataWebsiteId: string | null;
    enabled: boolean;
  };
  adminAnalytics: {
    summaryEndpoint: string;
    tokenAuthority: "server_only";
    metrics: string[];
  };
  bootstrap: {
    configPath: string;
    applyState: "pending";
  };
}

export interface UmamiAuthorityRequirement {
  key: string;
  aliases: string[];
  required: boolean;
  scope: "owner" | "umami-management" | "generated-runtime";
  usedBy: string;
  missingBehavior: string;
  secret: boolean;
  present: boolean;
}

const FORBIDDEN_PRODUCTION_URL_PATTERNS = [
  /localhost/i,
  /0\.0\.0\.0/,
  /127\.0\.0\.1/,
  /:3000(?:\/|$)/,
];

function readEnv(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveUmamiHost(): string {
  return stripTrailingSlash(readEnv(["UMAMI_BASE_URL", "NEXT_PUBLIC_UMAMI_BASE_URL"]) || "https://analytics.celebix.co");
}

function resolveUmamiApiUrl(host: string): string {
  return stripTrailingSlash(readEnv(["UMAMI_API_URL"]) || `${host}/api`);
}

function resolveUmamiScriptUrl(host: string): string {
  return readEnv(["UMAMI_SCRIPT_URL", "NEXT_PUBLIC_UMAMI_SCRIPT_URL"]) || `${host}/script.js`;
}

function assertSafeUrl(url: string, environment: UmamiProvisioningEnvironment): void {
  const parsed = new URL(url);

  if (environment === "production" && parsed.protocol !== "https:") {
    throw new Error(`Production Umami URL https olmalidir: ${url}`);
  }

  if (environment === "production" && FORBIDDEN_PRODUCTION_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error(`Production Umami URL local/dev origin iceremez: ${url}`);
  }
}

export function getUmamiAuthorityRequirements(): UmamiAuthorityRequirement[] {
  const host = resolveUmamiHost();

  return [
    {
      key: "UMAMI_BASE_URL",
      aliases: ["NEXT_PUBLIC_UMAMI_BASE_URL"],
      required: true,
      scope: "owner",
      usedBy: "Website config host and script URL generation",
      missingBehavior: "Falls back to https://analytics.celebix.co for config generation.",
      secret: false,
      present: Boolean(readEnv(["UMAMI_BASE_URL", "NEXT_PUBLIC_UMAMI_BASE_URL"])),
    },
    {
      key: "UMAMI_API_URL",
      aliases: [],
      required: false,
      scope: "umami-management",
      usedBy: "Future live website apply and server-side analytics reads",
      missingBehavior: `Falls back to ${host}/api.`,
      secret: false,
      present: Boolean(readEnv(["UMAMI_API_URL"])),
    },
    {
      key: "UMAMI_API_TOKEN",
      aliases: ["UMAMI_MANAGEMENT_TOKEN"],
      required: false,
      scope: "umami-management",
      usedBy: "Future live website create/apply and server-side admin analytics",
      missingBehavior: "Dry-run/config generation continues; live apply and admin analytics token authority remain pending.",
      secret: true,
      present: Boolean(readEnv(["UMAMI_API_TOKEN", "UMAMI_MANAGEMENT_TOKEN"])),
    },
    {
      key: "UMAMI_SCRIPT_URL",
      aliases: ["NEXT_PUBLIC_UMAMI_SCRIPT_URL"],
      required: false,
      scope: "generated-runtime",
      usedBy: "Storefront script injection metadata",
      missingBehavior: `Falls back to ${host}/script.js.`,
      secret: false,
      present: Boolean(readEnv(["UMAMI_SCRIPT_URL", "NEXT_PUBLIC_UMAMI_SCRIPT_URL"])),
    },
    {
      key: "UMAMI_DEFAULT_TIMEZONE",
      aliases: [],
      required: false,
      scope: "owner",
      usedBy: "Website timezone metadata",
      missingBehavior: "Falls back to Europe/Istanbul.",
      secret: false,
      present: Boolean(readEnv(["UMAMI_DEFAULT_TIMEZONE"])),
    },
  ];
}

export function buildUmamiWebsiteConfig(input: UmamiWebsiteConfigInput): GeneratedUmamiWebsiteConfig {
  const host = resolveUmamiHost();
  const apiUrl = resolveUmamiApiUrl(host);
  const scriptUrl = resolveUmamiScriptUrl(host);
  const canonicalDomain = normalizeDomain(input.canonicalDomain || input.storefrontDomain);
  const websiteId = readEnv([`UMAMI_WEBSITE_ID_${input.storeSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`]);

  [host, apiUrl, scriptUrl, `https://${canonicalDomain}`].forEach((url) =>
    assertSafeUrl(url, input.environment),
  );

  return {
    websiteName: `${input.storeName} Storefront`,
    domain: normalizeDomain(input.storefrontDomain),
    canonicalDomain,
    host,
    apiUrl,
    scriptUrl,
    timezone: readEnv(["UMAMI_DEFAULT_TIMEZONE"]) || "Europe/Istanbul",
    websiteId,
    tracking: {
      scriptUrl,
      dataWebsiteId: websiteId,
      enabled: Boolean(websiteId),
    },
    adminAnalytics: {
      summaryEndpoint: "/api/admin/analytics/summary",
      tokenAuthority: "server_only",
      metrics: [
        "activeUsers",
        "visitorsToday",
        "pageviewsToday",
        "visitors7d",
        "pageviews7d",
        "topPages",
        "topProducts",
        "referrers",
      ],
    },
    bootstrap: {
      configPath: `infra/umami/bootstrap/generated/${input.storeSlug}.website.json`,
      applyState: "pending",
    },
  };
}

export function buildUmamiWebsiteConfigForStore(
  store: StoreConfig,
  environment: UmamiProvisioningEnvironment = "production",
): GeneratedUmamiWebsiteConfig {
  return buildUmamiWebsiteConfig({
    storeSlug: store.slug,
    storeName: store.name,
    storefrontDomain: store.domains.storefront,
    canonicalDomain: store.domains.storefront,
    environment,
  });
}

export function resolveUmamiWebsiteReadinessStatus(
  status: StoreStandardResourceStatus,
): "ready" | "pending" | "failed" {
  if (status === "configured") {
    return "ready";
  }

  if (status === "failed") {
    return "failed";
  }

  return "pending";
}

export function toUmamiWebsiteJson(config: GeneratedUmamiWebsiteConfig): Record<string, unknown> {
  return {
    name: config.websiteName,
    domain: config.canonicalDomain,
    timezone: config.timezone,
    customData: {
      provider: "umami",
      host: config.host,
      scriptUrl: config.scriptUrl,
      adminSummaryEndpoint: config.adminAnalytics.summaryEndpoint,
      metrics: config.adminAnalytics.metrics,
    },
  };
}
