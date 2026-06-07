import "server-only";

import {
  updateStoreLogtoConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  buildLogtoAppConfigForStore,
  getLogtoAuthorityRequirements,
  resolveLogtoAppReadinessStatus,
  toLogtoApplicationJson,
  type GeneratedLogtoAppConfig,
  type LogtoAuthorityRequirement,
} from "@/lib/logto-app-config";

export interface LogtoProvisioningStatus {
  configured: boolean;
  issuer: string;
  hasManagementApiUrl: boolean;
  hasManagementToken: boolean;
  googleConnector: "enabled" | "pending";
  emailRecovery: "enabled" | "pending";
  requirements: LogtoAuthorityRequirement[];
  lastError?: string;
}

export interface LogtoProvisioningResult {
  issuer: string;
  adminAppStatus: "ready" | "pending" | "failed";
  customerAppStatus: "ready" | "pending" | "failed";
  adminConfigPath: string;
  customerConfigPath: string;
  googleSignIn: "enabled" | "pending" | "unavailable";
  emailRecovery: "enabled" | "pending" | "unavailable";
  config: GeneratedLogtoAppConfig;
}

export function getLogtoBootstrapStatus(): LogtoProvisioningStatus {
  const requirements = getLogtoAuthorityRequirements();
  const managementApiUrl = requirements.find((entry) => entry.key === "LOGTO_MANAGEMENT_API_URL");
  const managementToken = requirements.find((entry) => entry.key === "LOGTO_MANAGEMENT_API_TOKEN");
  const googleConnector = requirements.find((entry) => entry.key === "LOGTO_GOOGLE_CONNECTOR_READY");
  const smtpConnector = requirements.find((entry) => entry.key === "LOGTO_SMTP_CONNECTOR_READY");
  const issuer = process.env.LOGTO_ISSUER?.trim() || process.env.NEXT_PUBLIC_LOGTO_ISSUER?.trim() || "https://auth.celebix.co/oidc";

  return {
    configured: Boolean(managementApiUrl?.present && managementToken?.present),
    issuer,
    hasManagementApiUrl: Boolean(managementApiUrl?.present),
    hasManagementToken: Boolean(managementToken?.present),
    googleConnector: googleConnector?.present ? "enabled" : "pending",
    emailRecovery: smtpConnector?.present ? "enabled" : "pending",
    requirements,
    lastError:
      managementApiUrl?.present && managementToken?.present
        ? undefined
        : "Logto live apply authority eksik; config generation pending apply modunda calisir.",
  };
}

export function buildLogtoBootstrapApplicationFiles(store: StoreConfig): {
  adminPath: string;
  customerPath: string;
  adminApplication: Record<string, unknown>;
  customerApplication: Record<string, unknown>;
} {
  const config = buildLogtoAppConfigForStore(store);

  return {
    adminPath: config.bootstrap.adminConfigPath,
    customerPath: config.bootstrap.customerConfigPath,
    adminApplication: toLogtoApplicationJson(config.adminApp, {
      templateKey: "celebix-admin-logto-v1",
      celebixStoreSlug: store.slug,
      celebixSurface: "admin",
      celebixBridgeMode: "store_membership_v1",
      celebixHostedAuthProfile: "admin_oidc_bridge_v1",
    }),
    customerApplication: toLogtoApplicationJson(config.customerApp, {
      templateKey: "celebix-storefront-logto-v1",
      celebixStoreSlug: store.slug,
      celebixSurface: "storefront",
      celebixBridgeMode: "store_membership_v1",
      celebixHostedAuthProfile: "public_self_signup_v1",
      googleSignIn: config.customerApp.social.google,
      emailRecovery: config.customerApp.recovery.email,
    }),
  };
}

export async function provisionLogtoAppsForStore(
  store: StoreConfig,
): Promise<LogtoProvisioningResult> {
  const config = buildLogtoAppConfigForStore(store);
  const status = getLogtoBootstrapStatus();

  updateStoreLogtoConfig(store.slug, {
    adminAppStatus: "pending",
    customerAppStatus: "pending",
    adminAppId: null,
    adminClientId: null,
    customerAppId: null,
    customerClientId: null,
    adminIssuer: config.issuer,
    customerIssuer: config.issuer,
    adminRedirectUris: config.adminApp.redirectUris,
    adminPostLogoutRedirectUris: config.adminApp.postLogoutRedirectUris,
    adminOrigins: config.adminApp.origins,
    customerRedirectUris: config.customerApp.redirectUris,
    customerPostLogoutRedirectUris: config.customerApp.postLogoutRedirectUris,
    customerOrigins: config.customerApp.origins,
    googleSignIn: config.customerApp.social.google,
    emailRecovery: config.customerApp.recovery.email,
    adminBootstrapConfigPath: config.bootstrap.adminConfigPath,
    customerBootstrapConfigPath: config.bootstrap.customerConfigPath,
    bootstrapApplyState: "pending",
    authStatus: "pending_auth_setup",
    lastProvisionError: status.configured ? null : status.lastError ?? null,
  });

  return {
    issuer: config.issuer,
    adminAppStatus: resolveLogtoAppReadinessStatus("pending"),
    customerAppStatus: resolveLogtoAppReadinessStatus("pending"),
    adminConfigPath: config.bootstrap.adminConfigPath,
    customerConfigPath: config.bootstrap.customerConfigPath,
    googleSignIn: config.customerApp.social.google,
    emailRecovery: config.customerApp.recovery.email,
    config,
  };
}
