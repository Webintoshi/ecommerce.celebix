import "server-only";

import type { StoreConfig, StoreStandardResourceStatus } from "@celebix/platform-config";

export type LogtoProvisioningEnvironment = "production" | "preview" | "staging";
export type LogtoConnectorReadiness = "enabled" | "pending" | "unavailable";

export interface LogtoAppConfigInput {
  storeSlug: string;
  storeName: string;
  storefrontDomain: string;
  adminDomain: string;
  environment: LogtoProvisioningEnvironment;
}

export interface GeneratedLogtoSurfaceConfig {
  name: string;
  identifier: string;
  description: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  origins: string[];
  applicationType: "Traditional";
  authProvider: "logto";
  authStrategy: "logto_oidc_bridge_v1";
}

export interface GeneratedCustomerLogtoConfig extends GeneratedLogtoSurfaceConfig {
  social: {
    google: LogtoConnectorReadiness;
  };
  recovery: {
    email: LogtoConnectorReadiness;
  };
}

export interface GeneratedLogtoAppConfig {
  issuer: string;
  adminApp: GeneratedLogtoSurfaceConfig;
  customerApp: GeneratedCustomerLogtoConfig;
  bootstrap: {
    adminConfigPath: string;
    customerConfigPath: string;
    applyState: "pending";
  };
}

export interface LogtoAuthorityRequirement {
  key: string;
  aliases: string[];
  required: boolean;
  scope: "owner" | "logto-management" | "connector";
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

function httpsOrigin(domain: string): string {
  return `https://${normalizeDomain(domain)}`;
}

function assertSafeLogtoUrl(url: string, environment: LogtoProvisioningEnvironment): void {
  const parsed = new URL(url);

  if (environment === "production" && parsed.protocol !== "https:") {
    throw new Error(`Production Logto URL https olmalidir: ${url}`);
  }

  if (environment === "production" && FORBIDDEN_PRODUCTION_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error(`Production Logto URL local/dev origin iceremez: ${url}`);
  }
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function resolveLogtoIssuer(): string {
  return readEnv(["LOGTO_ISSUER", "NEXT_PUBLIC_LOGTO_ISSUER"]) || "https://auth.celebix.co/oidc";
}

export function getLogtoAuthorityRequirements(): LogtoAuthorityRequirement[] {
  return [
    {
      key: "LOGTO_ISSUER",
      aliases: ["NEXT_PUBLIC_LOGTO_ISSUER"],
      required: true,
      scope: "owner",
      usedBy: "Generated admin/customer runtime issuer metadata",
      missingBehavior: "Falls back to https://auth.celebix.co/oidc for config generation.",
      secret: false,
      present: Boolean(readEnv(["LOGTO_ISSUER", "NEXT_PUBLIC_LOGTO_ISSUER"])),
    },
    {
      key: "LOGTO_MANAGEMENT_API_URL",
      aliases: ["LOGTO_API_URL"],
      required: false,
      scope: "logto-management",
      usedBy: "Future live Logto application apply hook",
      missingBehavior: "Dry-run/config generation continues; live apply remains pending.",
      secret: false,
      present: Boolean(readEnv(["LOGTO_MANAGEMENT_API_URL", "LOGTO_API_URL"])),
    },
    {
      key: "LOGTO_MANAGEMENT_API_TOKEN",
      aliases: ["LOGTO_M2M_TOKEN", "LOGTO_MANAGEMENT_TOKEN"],
      required: false,
      scope: "logto-management",
      usedBy: "Legacy/static Logto application apply hook",
      missingBehavior: "M2M client credentials can be used instead; otherwise live apply remains pending.",
      secret: true,
      present: Boolean(readEnv(["LOGTO_MANAGEMENT_API_TOKEN", "LOGTO_M2M_TOKEN", "LOGTO_MANAGEMENT_TOKEN"])),
    },
    {
      key: "LOGTO_MANAGEMENT_RESOURCE",
      aliases: [],
      required: false,
      scope: "logto-management",
      usedBy: "M2M client_credentials resource/audience for Logto Management API",
      missingBehavior: "Falls back to https://default.logto.app/api for M2M token mint.",
      secret: false,
      present: Boolean(readEnv(["LOGTO_MANAGEMENT_RESOURCE"])),
    },
    {
      key: "LOGTO_MANAGEMENT_M2M_CLIENT_ID",
      aliases: ["LOGTO_M2M_CLIENT_ID", "LOGTO_MANAGEMENT_APP_ID"],
      required: false,
      scope: "logto-management",
      usedBy: "M2M client_credentials token mint for Logto Management API",
      missingBehavior: "Static token fallback is used if present; otherwise live apply remains pending.",
      secret: false,
      present: Boolean(readEnv(["LOGTO_MANAGEMENT_M2M_CLIENT_ID", "LOGTO_M2M_CLIENT_ID", "LOGTO_MANAGEMENT_APP_ID"])),
    },
    {
      key: "LOGTO_MANAGEMENT_M2M_CLIENT_SECRET",
      aliases: ["LOGTO_M2M_CLIENT_SECRET", "LOGTO_MANAGEMENT_APP_SECRET"],
      required: false,
      scope: "logto-management",
      usedBy: "M2M client_credentials token mint for Logto Management API",
      missingBehavior: "Static token fallback is used if present; otherwise live apply remains pending.",
      secret: true,
      present: Boolean(readEnv(["LOGTO_MANAGEMENT_M2M_CLIENT_SECRET", "LOGTO_M2M_CLIENT_SECRET", "LOGTO_MANAGEMENT_APP_SECRET"])),
    },
    {
      key: "LOGTO_GOOGLE_CONNECTOR_READY",
      aliases: [],
      required: false,
      scope: "connector",
      usedBy: "Customer Google sign-in readiness metadata",
      missingBehavior: "Google login readiness is marked pending.",
      secret: false,
      present: readEnv(["LOGTO_GOOGLE_CONNECTOR_READY"]) === "true",
    },
    {
      key: "LOGTO_SMTP_CONNECTOR_READY",
      aliases: [],
      required: false,
      scope: "connector",
      usedBy: "Forgot-password email recovery readiness metadata",
      missingBehavior: "Email recovery readiness is marked pending.",
      secret: false,
      present: readEnv(["LOGTO_SMTP_CONNECTOR_READY"]) === "true",
    },
  ];
}

export function buildLogtoAppConfig(input: LogtoAppConfigInput): GeneratedLogtoAppConfig {
  const storefrontOrigin = httpsOrigin(input.storefrontDomain);
  const adminOrigin = httpsOrigin(input.adminDomain);
  const issuer = resolveLogtoIssuer();
  const googleConnectorReady = readEnv(["LOGTO_GOOGLE_CONNECTOR_READY"]) === "true";
  const smtpConnectorReady = readEnv(["LOGTO_SMTP_CONNECTOR_READY"]) === "true";

  [
    issuer,
    storefrontOrigin,
    adminOrigin,
    `${adminOrigin}/callback`,
    `${adminOrigin}/admin/login`,
    `${adminOrigin}/admin/login?logged_out=1`,
    `${storefrontOrigin}/callback`,
    `${storefrontOrigin}/giris?next=/hesap&logged_out=1`,
  ].forEach((url) => assertSafeLogtoUrl(url, input.environment));

  return {
    issuer,
    adminApp: {
      name: `${input.storeName} Admin`,
      identifier: `${input.storeSlug}-admin`,
      description: `Celebix owner generated Logto admin app for ${input.storeName}.`,
      applicationType: "Traditional",
      authProvider: "logto",
      authStrategy: "logto_oidc_bridge_v1",
      redirectUris: [`${adminOrigin}/callback`],
      postLogoutRedirectUris: [
        `${adminOrigin}/admin/login`,
        `${adminOrigin}/admin/login?logged_out=1`,
      ],
      origins: [adminOrigin],
    },
    customerApp: {
      name: `${input.storeName} Storefront`,
      identifier: `${input.storeSlug}-customer`,
      description: `Celebix owner generated Logto customer app for ${input.storeName}.`,
      applicationType: "Traditional",
      authProvider: "logto",
      authStrategy: "logto_oidc_bridge_v1",
      redirectUris: [`${storefrontOrigin}/callback`],
      postLogoutRedirectUris: [
        storefrontOrigin,
        `${storefrontOrigin}/giris?next=/hesap&logged_out=1`,
      ],
      origins: [storefrontOrigin],
      social: {
        google: googleConnectorReady ? "enabled" : "pending",
      },
      recovery: {
        email: smtpConnectorReady ? "enabled" : "pending",
      },
    },
    bootstrap: {
      adminConfigPath: `infra/logto/bootstrap/generated/${input.storeSlug}-admin.application.json`,
      customerConfigPath: `infra/logto/bootstrap/generated/${input.storeSlug}-customer.application.json`,
      applyState: "pending",
    },
  };
}

export function buildLogtoAppConfigForStore(
  store: StoreConfig,
  environment: LogtoProvisioningEnvironment = "production",
): GeneratedLogtoAppConfig {
  return buildLogtoAppConfig({
    storeSlug: store.slug,
    storeName: store.name,
    storefrontDomain: store.domains.storefront,
    adminDomain: store.domains.admin,
    environment,
  });
}

export function resolveLogtoAppReadinessStatus(
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

export function toLogtoApplicationJson(
  surface: GeneratedLogtoSurfaceConfig,
  customData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: surface.name,
    description: surface.description,
    type: surface.applicationType,
    oidcClientMetadata: {
      redirectUris: dedupe(surface.redirectUris),
      postLogoutRedirectUris: dedupe(surface.postLogoutRedirectUris),
    },
    customClientMetadata: {
      corsAllowedOrigins: dedupe(surface.origins),
      refreshTokenTtlInDays: 14,
      alwaysIssueRefreshToken: true,
      rotateRefreshToken: true,
    },
    customData,
  };
}
