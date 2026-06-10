import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  upsertStoreAdminEnvLocal,
  updateStoreLogtoConfig,
  type StoreConfig,
} from "@celebix/platform-config";
import {
  buildLogtoAppConfigForStore,
  getLogtoAuthorityRequirements,
  resolveLogtoAppReadinessStatus,
  toLogtoApplicationJson,
  type GeneratedLogtoSurfaceConfig,
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

interface AppliedLogtoApplication {
  appId: string;
  clientId: string;
  clientSecret: string | null;
}

type LogtoSurfaceName = "admin" | "storefront";

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

function readAdminEnvLocal(store: StoreConfig): Record<string, string> {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  const envLocalPath = path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
}

function generateCookieSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hasUsableSecret(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();

  return Boolean(
    normalized &&
      !normalized.startsWith("configure-") &&
      !normalized.startsWith("placeholder-"),
  );
}

function getLogtoManagementApiBaseUrl(): string | null {
  const raw = readEnv(["LOGTO_MANAGEMENT_API_URL", "LOGTO_API_URL"]);

  if (!raw) {
    return null;
  }

  const baseUrl = raw.replace(/\/+$/, "");

  return baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;
}

function getLogtoManagementToken(): string | null {
  return readEnv(["LOGTO_MANAGEMENT_API_TOKEN", "LOGTO_M2M_TOKEN", "LOGTO_MANAGEMENT_TOKEN"]);
}

function buildLogtoApiUrl(pathname: string): string {
  const baseUrl = getLogtoManagementApiBaseUrl();

  if (!baseUrl) {
    throw new Error("Logto management API URL eksik.");
  }

  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function getLogtoHeaders(): HeadersInit {
  const token = getLogtoManagementToken();

  if (!token) {
    throw new Error("Logto management token eksik.");
  }

  return {
    Authorization: `Bearer ${token}`,
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

async function logtoFetch(pathname: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(buildLogtoApiUrl(pathname), {
    ...init,
    headers: mergeHeaders(getLogtoHeaders(), init.headers),
  });

  if (!response.ok) {
    throw new Error(`Logto management API ${init.method ?? "GET"} ${pathname} HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readLogtoErrorSummary(response: Response): Promise<string> {
  try {
    const payload = asRecord(await response.json());
    const data = asRecord(payload.data);
    const code = readOptionalString(payload.code);
    const dataCode = readOptionalString(data.code);
    const claim = readOptionalString(data.claim);

    if (response.status === 401 && claim) {
      return `HTTP 401 (${claim} claim rejected)`;
    }

    if (code || dataCode) {
      return `HTTP ${response.status} (${[code, dataCode].filter(Boolean).join(" / ")})`;
    }
  } catch {
    // Keep the validation error generic; secrets and token payloads must never be surfaced.
  }

  return `HTTP ${response.status}`;
}

export async function validateLogtoManagementAuthority(): Promise<void> {
  const status = getLogtoBootstrapStatus();

  if (!status.configured) {
    throw new Error(status.lastError || "Logto live apply authority eksik.");
  }

  const response = await fetch(buildLogtoApiUrl("/applications"), {
    headers: getLogtoHeaders(),
  });

  if (!response.ok) {
    const summary = await readLogtoErrorSummary(response);
    throw new Error(`Logto management authority dogrulanamadi: ${summary}`);
  }
}

function normalizeCollection(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
    );
  }

  const record = asRecord(payload);

  for (const key of ["data", "items", "applications", "results"]) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === "object" && !Array.isArray(entry)),
      );
    }
  }

  return [];
}

function readLogtoApplicationId(payload: unknown): string | null {
  const record = asRecord(payload);
  const nestedData = asRecord(record.data);

  return (
    readOptionalString(record.id) ??
    readOptionalString(record.clientId) ??
    readOptionalString(record.applicationId) ??
    readOptionalString(nestedData.id) ??
    readOptionalString(nestedData.clientId) ??
    readOptionalString(nestedData.applicationId)
  );
}

function readLogtoApplicationSecret(payload: unknown): string | null {
  const record = asRecord(payload);
  const nestedData = asRecord(record.data);
  const oidcClientMetadata = asRecord(record.oidcClientMetadata);
  const nestedOidcClientMetadata = asRecord(nestedData.oidcClientMetadata);

  return (
    readOptionalString(record.secret) ??
    readOptionalString(record.clientSecret) ??
    readOptionalString(record.appSecret) ??
    readOptionalString(oidcClientMetadata.clientSecret) ??
    readOptionalString(nestedData.secret) ??
    readOptionalString(nestedData.clientSecret) ??
    readOptionalString(nestedData.appSecret) ??
    readOptionalString(nestedOidcClientMetadata.clientSecret)
  );
}

function buildLogtoCustomData(
  store: StoreConfig,
  surface: LogtoSurfaceName,
  config: GeneratedLogtoAppConfig,
): Record<string, unknown> {
  if (surface === "admin") {
    return {
      templateKey: "celebix-admin-logto-v1",
      celebixStoreSlug: store.slug,
      celebixSurface: "admin",
      celebixBridgeMode: "store_membership_v1",
      celebixHostedAuthProfile: "admin_oidc_bridge_v1",
    };
  }

  return {
    templateKey: "celebix-storefront-logto-v1",
    celebixStoreSlug: store.slug,
    celebixSurface: "storefront",
    celebixBridgeMode: "store_membership_v1",
    celebixHostedAuthProfile: "public_self_signup_v1",
    googleSignIn: config.customerApp.social.google,
    emailRecovery: config.customerApp.recovery.email,
  };
}

function matchesLogtoApplication(
  application: Record<string, unknown>,
  store: StoreConfig,
  surface: LogtoSurfaceName,
  expectedName: string,
): boolean {
  const customData = asRecord(application.customData);
  const byCustomData =
    readOptionalString(customData.celebixStoreSlug) === store.slug &&
    readOptionalString(customData.celebixSurface) === surface;
  const byName = readOptionalString(application.name) === expectedName;

  return byCustomData || byName;
}

async function findExistingLogtoApplication(
  store: StoreConfig,
  surface: LogtoSurfaceName,
  expectedName: string,
): Promise<AppliedLogtoApplication | null> {
  try {
    const payload = await logtoFetch("/applications");
    const existing = normalizeCollection(payload).find((application) =>
      matchesLogtoApplication(application, store, surface, expectedName),
    );
    const appId = existing ? readLogtoApplicationId(existing) : null;

    return appId ? { appId, clientId: appId, clientSecret: readLogtoApplicationSecret(existing) } : null;
  } catch {
    return null;
  }
}

async function applyLogtoApplication(
  store: StoreConfig,
  surface: LogtoSurfaceName,
  surfaceConfig: GeneratedLogtoSurfaceConfig,
  config: GeneratedLogtoAppConfig,
): Promise<AppliedLogtoApplication> {
  const existing = await findExistingLogtoApplication(store, surface, surfaceConfig.name);

  if (existing) {
    return existing;
  }

  const payload = await logtoFetch("/applications", {
    method: "POST",
    body: JSON.stringify(toLogtoApplicationJson(surfaceConfig, buildLogtoCustomData(store, surface, config))),
  });
  const appId = readLogtoApplicationId(payload);

  if (!appId) {
    throw new Error(`Logto ${surface} application created response id icermiyor.`);
  }

  return {
    appId,
    clientId: appId,
    clientSecret: readLogtoApplicationSecret(payload),
  };
}

function persistAdminLogtoRuntimeSecrets(
  store: StoreConfig,
  adminApplication: AppliedLogtoApplication,
): void {
  const existingEnv = readAdminEnvLocal(store);
  const entries: Record<string, string> = {};

  if (!hasUsableSecret(existingEnv.LOGTO_COOKIE_SECRET)) {
    entries.LOGTO_COOKIE_SECRET = generateCookieSecret();
  }

  if (adminApplication.clientSecret && !hasUsableSecret(existingEnv.LOGTO_ADMIN_APP_SECRET)) {
    entries.LOGTO_ADMIN_APP_SECRET = adminApplication.clientSecret;
  }

  if (adminApplication.clientSecret && !hasUsableSecret(existingEnv.LOGTO_APP_SECRET)) {
    entries.LOGTO_APP_SECRET = adminApplication.clientSecret;
  }

  if (Object.keys(entries).length > 0) {
    upsertStoreAdminEnvLocal(store.slug, entries);
  }
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

  const pendingResult: LogtoProvisioningResult = {
    issuer: config.issuer,
    adminAppStatus: resolveLogtoAppReadinessStatus("pending"),
    customerAppStatus: resolveLogtoAppReadinessStatus("pending"),
    adminConfigPath: config.bootstrap.adminConfigPath,
    customerConfigPath: config.bootstrap.customerConfigPath,
    googleSignIn: config.customerApp.social.google,
    emailRecovery: config.customerApp.recovery.email,
    config,
  };

  if (!status.configured) {
    return pendingResult;
  }

  let adminApplication: AppliedLogtoApplication | null = null;
  let customerApplication: AppliedLogtoApplication | null = null;

  try {
    adminApplication = await applyLogtoApplication(store, "admin", config.adminApp, config);
    customerApplication = await applyLogtoApplication(store, "storefront", config.customerApp, config);
    persistAdminLogtoRuntimeSecrets(store, adminApplication);

    updateStoreLogtoConfig(store.slug, {
      adminAppStatus: "configured",
      customerAppStatus: "configured",
      adminAppId: adminApplication.appId,
      adminClientId: adminApplication.clientId,
      customerAppId: customerApplication.appId,
      customerClientId: customerApplication.clientId,
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
      bootstrapApplyState: "applied",
      authStatus: "configured",
      lastProvisionError: null,
    });

    return {
      ...pendingResult,
      adminAppStatus: "ready",
      customerAppStatus: "ready",
    };
  } catch (error) {
    updateStoreLogtoConfig(store.slug, {
      adminAppStatus: "failed",
      customerAppStatus: "failed",
      adminAppId: adminApplication?.appId ?? null,
      adminClientId: adminApplication?.clientId ?? null,
      customerAppId: customerApplication?.appId ?? null,
      customerClientId: customerApplication?.clientId ?? null,
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
      bootstrapApplyState: "failed",
      authStatus: "pending_auth_setup",
      lastProvisionError: error instanceof Error ? error.message : "Logto live apply failed.",
    });

    throw error;
  }
}
