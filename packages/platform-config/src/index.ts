import fs from "node:fs";
import path from "node:path";
import { getConfiguredImageTransformationUrl } from "./image-transformation";
import { resolveLightPostgresDefaultSslMode } from "./light-postgres-runtime";
import { resolveProvisionedNextBuildCpuCap } from "./next-build";

export * from "./typography";
export * from "./image-formats";
export * from "./image-transformation";
export * from "./category-hierarchy";
export * from "./google-merchant";
export * from "./shipping";
export * from "./translation";
export * from "./next-build";
export * from "./seo";
export * from "./product-listing-order";
export * from "./product-pricing";
export * from "./policy-pages";
export * from "./floating-contact";
export * from "./content-pages";
export * from "./light-postgres-runtime";

export interface StoreRegistryEntry {
  slug: string;
  name: string;
  domain: string;
  theme: string;
  status: "draft" | "active" | "paused";
}

export type DatabaseMode = "light_postgres" | "full_supabase";
export type SupabaseProvider = "managed" | "self_hosted_coolify";
export type StoreStorageProvider = "r2" | "supabase";
export type StoreSupabaseStatus = "none" | "legacy" | "configured" | "failed";
export type StoreStandardResourceStatus = "pending" | "configured" | "failed" | "skipped";
export type StoreReadinessStatus = "pending" | "ready" | "failed";
export type StoreProvisioningStatus = "pending-owner-env" | "configured" | "failed";
export type StoreLightPostgresReadinessStatus = "pending" | "ready" | "failed";
export type StoreLightPostgresRoleStatus =
  | "pending-owner-env"
  | "configured"
  | "failed"
  | "admin-shared";
export type StorefrontStatus = "not_started" | "scaffolded" | "active";
export type StorefrontRepoSyncStatus = "pending" | "synced" | "failed";
export type StorefrontDeploymentStatus =
  | "pending-owner-env"
  | "pending-repo-sync"
  | "prepared"
  | "configured"
  | "failed";
export type DeploymentStrategy = "build_server_ghcr" | "legacy_git_push";

export interface StoreThemeConfig {
  key: string;
  label: string;
  primaryColor: string;
  accentColor: string;
  surfaceColor: string;
  headingFont: string;
  bodyFont: string;
}

export interface StoreBrandingConfig {
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  senderEmail?: string;
  smsSenderTitle?: string;
  defaultProductBrand?: string;
}

export interface StoreLightPostgresConfig {
  cluster: string;
  databaseName: string;
  schemaProfile: "storefront_core";
  provisioning: StoreProvisioningStatus;
  provisionedAt?: string;
  lastProvisionError?: string;
  umamiReady?: boolean;
  roleName?: string;
  roleStatus?: StoreLightPostgresRoleStatus;
  schemaStatus?: StoreLightPostgresReadinessStatus;
  seedStatus?: StoreLightPostgresReadinessStatus;
  readinessStatus?: StoreLightPostgresReadinessStatus;
  readinessCheckedAt?: string;
  readinessRepairAction?: string;
  missingTables?: string[];
  missingSeedKeys?: string[];
  missingOptionalModules?: string[];
  missingPaymentGatewayKeys?: string[];
  missingAuthBridgeTables?: string[];
  lastReadinessError?: string;
}

export type StoreAuthProvider = "logto" | "supabase";
export type StoreAuthStatus = "pending_auth_setup" | "configured";
export type StoreAuthMode = "logto_ready_placeholder" | "legacy_supabase_auth";
export type StoreLogtoConnectorStatus = "enabled" | "pending" | "unavailable";
export type StoreLogtoBootstrapApplyState = "pending" | "applied" | "failed";

export interface StoreAuthConfig {
  provider: StoreAuthProvider;
  status: StoreAuthStatus;
  mode: StoreAuthMode;
  requiredAction?: string;
  blocking?: boolean;
}

export type StoreAnalyticsProvider = "umami";
export type StoreAnalyticsStatus = "pending_analytics_setup" | "configured";
export type StoreAnalyticsMode = "umami_ready_placeholder";
export type StoreUmamiTrackingStatus = "pending" | "configured" | "failed";
export type StoreUmamiBootstrapApplyState = "pending" | "applied" | "failed";
export type StoreUmamiTokenStatus = "pending-owner-env" | "configured" | "not-required";
export type StoreR2MediaStatus = "pending" | "configured" | "failed";
export type StoreR2BootstrapApplyState = "pending" | "applied" | "failed";
export type StoreR2CredentialStatus = "pending-owner-env" | "configured" | "not-required";

export interface StoreAnalyticsConfig {
  provider: StoreAnalyticsProvider;
  status: StoreAnalyticsStatus;
  mode: StoreAnalyticsMode;
  websiteId?: string;
  requiredAction?: string;
  blocking?: boolean;
}

export interface StoreLogtoConfig {
  adminAppStatus: StoreStandardResourceStatus;
  customerAppStatus: StoreStandardResourceStatus;
  adminAppId?: string | null;
  adminClientId?: string | null;
  customerAppId?: string | null;
  customerClientId?: string | null;
  adminIssuer?: string;
  customerIssuer?: string;
  adminRedirectUris?: string[];
  adminPostLogoutRedirectUris?: string[];
  adminOrigins?: string[];
  customerRedirectUris?: string[];
  customerPostLogoutRedirectUris?: string[];
  customerOrigins?: string[];
  googleSignIn?: StoreLogtoConnectorStatus;
  emailRecovery?: StoreLogtoConnectorStatus;
  adminBootstrapConfigPath?: string;
  customerBootstrapConfigPath?: string;
  bootstrapApplyState?: StoreLogtoBootstrapApplyState;
  lastProvisionError?: string;
}

export interface StoreUmamiConfig {
  websiteStatus: StoreStandardResourceStatus;
  websiteId?: string | null;
  websiteName?: string;
  domain?: string;
  canonicalDomain?: string;
  host?: string;
  apiUrl?: string;
  scriptUrl?: string;
  timezone?: string;
  storefrontTrackingStatus?: StoreUmamiTrackingStatus;
  adminAnalyticsStatus?: StoreUmamiTrackingStatus;
  serverTokenStatus?: StoreUmamiTokenStatus;
  adminSummaryEndpoint?: string;
  metrics?: string[];
  bootstrapConfigPath?: string;
  bootstrapApplyState?: StoreUmamiBootstrapApplyState;
  lastProvisionError?: string;
}

export interface StoreR2Config {
  status?: StoreStandardResourceStatus;
  bucketName?: string | null;
  publicUrl?: string | null;
  managedDomain?: string | null;
  endpoint?: string | null;
  region?: string;
  prefix?: string;
  uploadPrefix?: string;
  productImagesPrefix?: string;
  pageImagesPrefix?: string;
  brandingPrefix?: string;
  publicUrlTemplate?: string | null;
  adminUploadStatus?: StoreR2MediaStatus;
  storefrontReadStatus?: StoreR2MediaStatus;
  credentialsStatus?: StoreR2CredentialStatus;
  bootstrapConfigPath?: string;
  bootstrapApplyState?: StoreR2BootstrapApplyState;
  noSupabaseStorage?: boolean;
  provisionedAt?: string;
  lastProvisionError?: string;
  provisioning?: StoreProvisioningStatus;
}

export interface StoreMediaConfig {
  provider: "r2";
  status: StoreStandardResourceStatus;
  publicBaseUrl?: string | null;
  prefix: string;
  uploadPrefix: string;
  productImagesPrefix: string;
  pageImagesPrefix: string;
  brandingPrefix: string;
  publicUrlTemplate?: string | null;
  adminUploadStatus: StoreR2MediaStatus;
  storefrontReadStatus: StoreR2MediaStatus;
  noSupabaseStorage: boolean;
}

export interface StoreReadinessConfig {
  database: StoreReadinessStatus;
  databaseSchema?: StoreReadinessStatus;
  databaseSeed?: StoreReadinessStatus;
  databaseSmoke?: StoreReadinessStatus;
  storage: StoreReadinessStatus;
  auth: StoreReadinessStatus;
  analytics: StoreReadinessStatus;
  admin: StoreReadinessStatus;
  storefront: StoreReadinessStatus;
  smoke: StoreReadinessStatus;
}

export type StorePaymentStatus = "pending_payment_setup" | "configured";
export type StorePaymentProvider = "bank_transfer" | "none";

export interface StorePaymentsConfig {
  status: StorePaymentStatus;
  defaultProvider: StorePaymentProvider;
  requiredAction?: string;
  blocking?: boolean;
}

export interface GeneratedDeploymentConfig {
  strategy: DeploymentStrategy;
  image: string;
  imageTag: string;
  useBuildServer: boolean;
  buildServer: string;
  watchPaths: string[];
}

export interface StorefrontConfig {
  appDir?: string;
  packageName?: string;
  status: StorefrontStatus;
  lastScaffoldedAt?: string;
  lastScaffoldError?: string;
  repoSyncStatus?: StorefrontRepoSyncStatus;
  repoSyncedAt?: string;
  lastRepoSyncedAt?: string;
  repoCommitSha?: string;
  lastRepoSyncError?: string;
  deploymentProvider?: "coolify";
  deploymentName?: string;
  deploymentBranch?: string;
  runtimeUrl?: string;
  resourceId?: string;
  deploymentStatus?: StorefrontDeploymentStatus;
  preparedAt?: string;
  lastDeploymentPreparedAt?: string;
  deployedAt?: string;
  lastDeploymentError?: string;
  deployment?: GeneratedDeploymentConfig;
}

export interface StoreConfig {
  name: string;
  slug: string;
  status: "draft" | "active" | "paused";
  databaseMode: DatabaseMode;
  authProvider: StoreAuthProvider;
  customerAuthProvider: StoreAuthProvider;
  analyticsProvider: StoreAnalyticsProvider;
  storageProvider: StoreStorageProvider;
  supabaseStatus: StoreSupabaseStatus;
  theme: StoreThemeConfig;
  branding?: StoreBrandingConfig;
  domains: {
    storefront: string;
    admin: string;
    demo: string;
  };
  owner: {
    createdBy: string;
    notes: string;
    legacyModeSelected?: boolean;
    standardProfile?: "celebix_new_standard" | "legacy_supabase";
  };
  lightPostgres?: StoreLightPostgresConfig;
  auth?: StoreAuthConfig;
  analytics?: StoreAnalyticsConfig;
  logto?: StoreLogtoConfig;
  umami?: StoreUmamiConfig;
  readiness?: StoreReadinessConfig;
  payments?: StorePaymentsConfig;
  supabase: {
    projectRef: string;
    url: string;
    provider: SupabaseProvider;
    storage: string;
    dashboardUrl?: string;
  };
  r2?: StoreR2Config;
  media?: StoreMediaConfig;
  bootstrap?: {
    createdAt: string;
    envTemplatePath: string;
    adminEnvLocalPath?: string;
    authorityBranch?: string;
    coolifyProjectName?: string;
    adminDeploymentProvider?: "coolify";
    adminDeploymentName?: string;
    adminDeploymentBranch?: string;
    adminDeploymentRuntimeUrl?: string;
    adminDeploymentResourceId?: string;
    adminDeploymentStatus?: "pending-owner-env" | "prepared" | "configured" | "failed";
    adminDeploymentPreparedAt?: string;
    adminDeploymentDeployedAt?: string;
    adminDeploymentLastError?: string;
    organizationSlug?: string;
    supabaseProvider?: SupabaseProvider;
    supabaseProjectName?: string;
    supabaseResourceId?: string;
    supabaseDashboardUrl?: string;
    provisionedAt?: string;
    lastProvisionError?: string;
    supabaseProvisioning: StoreProvisioningStatus;
    adminDeployment?: GeneratedDeploymentConfig;
  };
  storefront?: StorefrontConfig;
  features: string[];
}

export interface CreateStoreInput {
  name: string;
  slug?: string;
  domain: string;
  theme?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  coolifyProjectName?: string;
  adminDeploymentName?: string;
  storefrontDeploymentName?: string;
  databaseMode?: DatabaseMode;
}

export interface CreateStoreResult {
  store: StoreConfig;
  registryEntry: StoreRegistryEntry;
  envTemplatePath: string;
}

export interface StoreDomainMigrationInput {
  storefrontDomain: string;
  adminDomain?: string;
  refreshDerivedBrandingEmails?: boolean;
}

export interface StoreSupabaseUpdateInput {
  projectRef: string;
  url: string;
  provider: SupabaseProvider;
  organizationSlug?: string;
  provisioningStatus: "configured" | "failed";
  adminEnvLocalPath?: string;
  dashboardUrl?: string;
  projectName?: string;
  resourceId?: string;
  lastProvisionError?: string;
}

export interface StoreLightPostgresUpdateInput {
  cluster: string;
  databaseName: string;
  schemaProfile?: "storefront_core";
  provisioningStatus: StoreProvisioningStatus;
  lastProvisionError?: string;
  umamiReady?: boolean;
  roleName?: string;
  roleStatus?: StoreLightPostgresRoleStatus;
  schemaStatus?: StoreLightPostgresReadinessStatus;
  seedStatus?: StoreLightPostgresReadinessStatus;
  readinessStatus?: StoreLightPostgresReadinessStatus;
  readinessCheckedAt?: string;
  readinessRepairAction?: string | null;
  missingTables?: string[];
  missingSeedKeys?: string[];
  missingOptionalModules?: string[];
  missingPaymentGatewayKeys?: string[];
  missingAuthBridgeTables?: string[];
  lastReadinessError?: string | null;
}

export interface StoreLogtoUpdateInput {
  adminAppStatus?: StoreStandardResourceStatus;
  customerAppStatus?: StoreStandardResourceStatus;
  adminAppId?: string | null;
  adminClientId?: string | null;
  customerAppId?: string | null;
  customerClientId?: string | null;
  adminIssuer?: string;
  customerIssuer?: string;
  adminRedirectUris?: string[];
  adminPostLogoutRedirectUris?: string[];
  adminOrigins?: string[];
  customerRedirectUris?: string[];
  customerPostLogoutRedirectUris?: string[];
  customerOrigins?: string[];
  googleSignIn?: StoreLogtoConnectorStatus;
  emailRecovery?: StoreLogtoConnectorStatus;
  adminBootstrapConfigPath?: string;
  customerBootstrapConfigPath?: string;
  bootstrapApplyState?: StoreLogtoBootstrapApplyState;
  lastProvisionError?: string | null;
  authStatus?: StoreAuthStatus;
}

export interface StoreUmamiUpdateInput {
  websiteStatus?: StoreStandardResourceStatus;
  websiteId?: string | null;
  websiteName?: string;
  domain?: string;
  canonicalDomain?: string;
  host?: string;
  apiUrl?: string;
  scriptUrl?: string;
  timezone?: string;
  storefrontTrackingStatus?: StoreUmamiTrackingStatus;
  adminAnalyticsStatus?: StoreUmamiTrackingStatus;
  serverTokenStatus?: StoreUmamiTokenStatus;
  adminSummaryEndpoint?: string;
  metrics?: string[];
  bootstrapConfigPath?: string;
  bootstrapApplyState?: StoreUmamiBootstrapApplyState;
  lastProvisionError?: string | null;
  analyticsStatus?: StoreAnalyticsStatus;
}

export interface StoreR2UpdateInput {
  bucketName: string;
  publicUrl: string;
  provisioningStatus: "configured" | "failed";
  managedDomain?: string;
  endpoint?: string;
  region?: string;
  prefix?: string;
  uploadPrefix?: string;
  productImagesPrefix?: string;
  pageImagesPrefix?: string;
  brandingPrefix?: string;
  publicUrlTemplate?: string;
  adminUploadStatus?: StoreR2MediaStatus;
  storefrontReadStatus?: StoreR2MediaStatus;
  credentialsStatus?: StoreR2CredentialStatus;
  bootstrapConfigPath?: string;
  bootstrapApplyState?: StoreR2BootstrapApplyState;
  noSupabaseStorage?: boolean;
  lastProvisionError?: string;
}

export interface StoreR2MediaUpdateInput {
  status?: StoreStandardResourceStatus;
  provisioningStatus?: StoreProvisioningStatus;
  bucketName?: string | null;
  publicUrl?: string | null;
  managedDomain?: string | null;
  endpoint?: string | null;
  region?: string;
  prefix?: string;
  uploadPrefix?: string;
  productImagesPrefix?: string;
  pageImagesPrefix?: string;
  brandingPrefix?: string;
  publicUrlTemplate?: string | null;
  adminUploadStatus?: StoreR2MediaStatus;
  storefrontReadStatus?: StoreR2MediaStatus;
  credentialsStatus?: StoreR2CredentialStatus;
  bootstrapConfigPath?: string;
  bootstrapApplyState?: StoreR2BootstrapApplyState;
  noSupabaseStorage?: boolean;
  lastProvisionError?: string | null;
}

export interface StoreAdminDeploymentUpdateInput {
  deploymentStatus: "pending-owner-env" | "prepared" | "configured" | "failed";
  deploymentName?: string;
  runtimeUrl?: string;
  resourceId?: string;
  deployedAt?: string;
  lastError?: string;
}

export interface StorefrontUpdateInput {
  appDir: string;
  status: StorefrontStatus;
  lastScaffoldError?: string;
}

export interface StorefrontDeploymentUpdateInput {
  deploymentStatus: StorefrontDeploymentStatus;
  deploymentName?: string;
  runtimeUrl?: string;
  resourceId?: string;
  preparedAt?: string;
  deployedAt?: string;
  lastError?: string;
}

export interface StorefrontRepoSyncUpdateInput {
  syncStatus: StorefrontRepoSyncStatus;
  commitSha?: string;
  syncedAt?: string;
  lastError?: string;
}

export interface StorefrontAuthorityPatchInput {
  appDir?: string | null;
  status?: StorefrontStatus;
  lastScaffoldedAt?: string | null;
  lastScaffoldError?: string | null;
  repoSyncStatus?: StorefrontRepoSyncStatus;
  repoSyncedAt?: string | null;
  lastRepoSyncedAt?: string | null;
  repoCommitSha?: string | null;
  lastRepoSyncError?: string | null;
  deploymentProvider?: "coolify";
  deploymentName?: string | null;
  deploymentBranch?: string | null;
  runtimeUrl?: string | null;
  resourceId?: string | null;
  deploymentStatus?: StorefrontDeploymentStatus;
  preparedAt?: string | null;
  lastDeploymentPreparedAt?: string | null;
  deployedAt?: string | null;
  lastDeploymentError?: string | null;
}

export interface RemoveStoreArtifactsInput {
  storefrontAppDir?: string | null;
}

export interface RemoveStoreArtifactsResult {
  updatedPaths: string[];
  removedPaths: string[];
  skippedPaths: string[];
}

function getDemoDomainRoot(): string {
  return ensureDomain(process.env.OWNER_DEMO_DOMAIN_ROOT?.trim() || "celebix.co");
}

function resolveAdminDomain(storefrontDomain: string): string {
  const normalizedStorefrontDomain = ensureDomain(storefrontDomain);
  const demoRoot = getDemoDomainRoot();
  const demoSuffix = `.${demoRoot}`;

  if (normalizedStorefrontDomain.endsWith(demoSuffix)) {
    const prefix = normalizedStorefrontDomain.slice(0, -demoSuffix.length);

    if (prefix && !prefix.includes(".")) {
      return `admin-${prefix}.${demoRoot}`;
    }
  }

  return `admin.${normalizedStorefrontDomain}`;
}

export function getStoreAdminDomainForStorefrontDomain(storefrontDomain: string): string {
  return resolveAdminDomain(storefrontDomain);
}

function buildHttpsOrigin(domain: string): string {
  return `https://${ensureDomain(domain)}`;
}

function buildStoreLogtoConfig(input: {
  databaseMode: DatabaseMode;
  slug: string;
  storefrontDomain: string;
  adminDomain: string;
}): StoreLogtoConfig {
  const status: StoreStandardResourceStatus =
    input.databaseMode === "light_postgres" ? "pending" : "skipped";
  const storefrontOrigin = buildHttpsOrigin(input.storefrontDomain);
  const adminOrigin = buildHttpsOrigin(input.adminDomain);
  const issuer = "https://auth.celebix.co/oidc";

  return {
    adminAppStatus: status,
    customerAppStatus: status,
    adminAppId: null,
    adminClientId: null,
    customerAppId: null,
    customerClientId: null,
    adminIssuer: issuer,
    customerIssuer: issuer,
    adminRedirectUris: [`${adminOrigin}/callback`],
    adminPostLogoutRedirectUris: [
      `${adminOrigin}/admin/login`,
      `${adminOrigin}/admin/login?logged_out=1`,
    ],
    adminOrigins: [adminOrigin],
    customerRedirectUris: [`${storefrontOrigin}/callback`],
    customerPostLogoutRedirectUris: [
      storefrontOrigin,
      `${storefrontOrigin}/giris?next=/hesap&logged_out=1`,
    ],
    customerOrigins: [storefrontOrigin],
    googleSignIn: input.databaseMode === "light_postgres" ? "pending" : "unavailable",
    emailRecovery: input.databaseMode === "light_postgres" ? "pending" : "unavailable",
    adminBootstrapConfigPath: `infra/logto/bootstrap/generated/${input.slug}-admin.application.json`,
    customerBootstrapConfigPath: `infra/logto/bootstrap/generated/${input.slug}-customer.application.json`,
    bootstrapApplyState: input.databaseMode === "light_postgres" ? "pending" : "applied",
  };
}

function buildStoreUmamiConfig(input: {
  databaseMode: DatabaseMode;
  slug: string;
  storeName: string;
  storefrontDomain: string;
}): StoreUmamiConfig {
  const status: StoreStandardResourceStatus =
    input.databaseMode === "light_postgres" ? "pending" : "skipped";
  const canonicalDomain = ensureDomain(input.storefrontDomain);
  const host = "https://analytics.celebix.co";
  const scriptUrl = `${host}/script.js`;

  return {
    websiteStatus: status,
    websiteId: null,
    websiteName: `${input.storeName} Storefront`,
    domain: canonicalDomain,
    canonicalDomain,
    host,
    apiUrl: `${host}/api`,
    scriptUrl,
    timezone: "Europe/Istanbul",
    storefrontTrackingStatus: input.databaseMode === "light_postgres" ? "pending" : "configured",
    adminAnalyticsStatus: input.databaseMode === "light_postgres" ? "pending" : "configured",
    serverTokenStatus: input.databaseMode === "light_postgres" ? "pending-owner-env" : "not-required",
    adminSummaryEndpoint: "/api/admin/analytics/summary",
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
    bootstrapConfigPath: `infra/umami/bootstrap/generated/${input.slug}.website.json`,
    bootstrapApplyState: input.databaseMode === "light_postgres" ? "pending" : "applied",
  };
}

function buildStoreR2Prefix(slug: string): string {
  return `stores/${ensureSlug(slug)}/`;
}

function buildStoreR2Config(input: {
  databaseMode: DatabaseMode;
  slug: string;
}): StoreR2Config {
  const status: StoreStandardResourceStatus =
    input.databaseMode === "light_postgres" ? "pending" : "skipped";
  const prefix = buildStoreR2Prefix(input.slug);

  return {
    status,
    bucketName: null,
    publicUrl: null,
    managedDomain: null,
    endpoint: null,
    region: "auto",
    prefix,
    uploadPrefix: `${prefix}uploads/`,
    productImagesPrefix: `${prefix}products/`,
    pageImagesPrefix: `${prefix}pages/`,
    brandingPrefix: `${prefix}branding/`,
    publicUrlTemplate: null,
    adminUploadStatus: input.databaseMode === "light_postgres" ? "pending" : "configured",
    storefrontReadStatus: input.databaseMode === "light_postgres" ? "pending" : "configured",
    credentialsStatus:
      input.databaseMode === "light_postgres" ? "pending-owner-env" : "not-required",
    bootstrapConfigPath: `infra/r2/bootstrap/generated/${input.slug}.storage.json`,
    bootstrapApplyState: input.databaseMode === "light_postgres" ? "pending" : "applied",
    noSupabaseStorage: input.databaseMode === "light_postgres",
    provisioning: input.databaseMode === "light_postgres" ? "pending-owner-env" : "configured",
  };
}

function buildStoreMediaConfig(input: {
  databaseMode: DatabaseMode;
  slug: string;
  r2?: StoreR2Config;
}): StoreMediaConfig {
  const r2 = input.r2 ?? buildStoreR2Config(input);

  return {
    provider: "r2",
    status: input.databaseMode === "light_postgres" ? r2.status ?? "pending" : "skipped",
    publicBaseUrl: r2.publicUrl ?? null,
    prefix: r2.prefix ?? buildStoreR2Prefix(input.slug),
    uploadPrefix: r2.uploadPrefix ?? `${buildStoreR2Prefix(input.slug)}uploads/`,
    productImagesPrefix: r2.productImagesPrefix ?? `${buildStoreR2Prefix(input.slug)}products/`,
    pageImagesPrefix: r2.pageImagesPrefix ?? `${buildStoreR2Prefix(input.slug)}pages/`,
    brandingPrefix: r2.brandingPrefix ?? `${buildStoreR2Prefix(input.slug)}branding/`,
    publicUrlTemplate: r2.publicUrlTemplate ?? null,
    adminUploadStatus: r2.adminUploadStatus ?? "pending",
    storefrontReadStatus: r2.storefrontReadStatus ?? "pending",
    noSupabaseStorage: input.databaseMode === "light_postgres",
  };
}

function findRepoRoot(startDirectory = process.cwd()): string {
  const attempted = new Set<string>();
  const candidates = [
    process.env.CELEBIX_REPO_ROOT,
    startDirectory,
    path.resolve(__dirname, "..", "..", ".."),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidate of candidates) {
    let currentDirectory = path.resolve(candidate);

    while (!attempted.has(currentDirectory)) {
      attempted.add(currentDirectory);
      const registryPath = path.join(currentDirectory, "stores", "registry.json");

      if (fs.existsSync(registryPath)) {
        return currentDirectory;
      }

      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        break;
      }

      currentDirectory = parentDirectory;
    }
  }

  throw new Error("Monorepo kok dizini bulunamadi.");
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  const directory = path.dirname(filePath);
  const tempFilePath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tempFilePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempFilePath, filePath);
}

function slugifyStoreName(value: string): string {
  return value
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveDefaultSupabaseProvider(): SupabaseProvider {
  const configured = process.env.SUPABASE_PROVIDER?.trim().toLowerCase();

  if (configured === "self_hosted_coolify") {
    return "self_hosted_coolify";
  }

  if (configured === "managed") {
    throw new Error(
      "Managed Supabase kapali. Store authority yalnizca self-hosted Coolify Supabase icin olusturulabilir.",
    );
  }

  return "self_hosted_coolify";
}

export function resolveDefaultDatabaseMode(input?: string | null): DatabaseMode {
  return input?.trim().toLowerCase() === "full_supabase"
    ? "full_supabase"
    : "light_postgres";
}

function resolveDefaultAuthorityBranch(): string {
  return (
    process.env.GITHUB_AUTHORITY_BRANCH?.trim() ||
    process.env.OWNER_AUTHORITY_REPOSITORY_BRANCH?.trim() ||
    "stores/authority"
  );
}

function resolveBuildServerName(): string {
  return process.env.CELEBIX_BUILD_SERVER_NAME?.trim() || "celebix-build-01";
}

function resolveBuildServerImageRepository(slug: string, target: "admin" | "storefront"): string {
  return `ghcr.io/celebixco/${slug}-${target}`;
}

function resolveDeploymentStrategy(): DeploymentStrategy {
  return "build_server_ghcr";
}

export function buildDefaultStoreAuthConfig(
  databaseMode: DatabaseMode = "light_postgres",
): StoreAuthConfig {
  if (databaseMode === "full_supabase") {
    return {
      provider: "supabase",
      status: "configured",
      mode: "legacy_supabase_auth",
      requiredAction: "legacy_supabase_auth_managed_in_store_runtime",
      blocking: false,
    };
  }

  return {
    provider: "logto",
    status: "pending_auth_setup",
    mode: "logto_ready_placeholder",
    requiredAction: "configure_admin_and_customer_auth",
    blocking: false,
  };
}

export function buildDefaultStoreAnalyticsConfig(): StoreAnalyticsConfig {
  return {
    provider: "umami",
    status: "pending_analytics_setup",
    mode: "umami_ready_placeholder",
    requiredAction: "configure_umami_website",
    blocking: false,
  };
}

export function buildDefaultStoreLogtoConfig(
  databaseMode: DatabaseMode = "light_postgres",
): StoreLogtoConfig {
  const status: StoreStandardResourceStatus = databaseMode === "light_postgres" ? "pending" : "skipped";

  return {
    adminAppStatus: status,
    customerAppStatus: status,
    adminAppId: null,
    customerAppId: null,
  };
}

export function buildDefaultStoreUmamiConfig(): StoreUmamiConfig {
  return {
    websiteStatus: "pending",
    websiteId: null,
  };
}

export function buildDefaultStoreReadinessConfig(): StoreReadinessConfig {
  return {
    database: "pending",
    storage: "pending",
    auth: "pending",
    analytics: "pending",
    admin: "pending",
    storefront: "pending",
    smoke: "pending",
  };
}

export function buildDefaultStorePaymentsConfig(): StorePaymentsConfig {
  return {
    status: "pending_payment_setup",
    defaultProvider: "bank_transfer",
    requiredAction: "configure_payment_provider",
    blocking: false,
  };
}

function normalizeRepositoryBranch(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(/^refs\/heads\//i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function getOwnerRepositoryBranch(): string {
  return (
    normalizeRepositoryBranch(process.env.COOLIFY_OWNER_REPOSITORY_BRANCH) ||
    normalizeRepositoryBranch(process.env.COOLIFY_ADMIN_REPOSITORY_BRANCH) ||
    "deploy/owner"
  );
}

export function getStorefrontDeploymentBranchPrefix(): string {
  return (
    normalizeRepositoryBranch(process.env.COOLIFY_STOREFRONT_REPOSITORY_BRANCH_PREFIX) ||
    normalizeRepositoryBranch(process.env.CELEBIX_STOREFRONT_BRANCH_PREFIX) ||
    "deploy/storefront"
  );
}

export function getDefaultAdminDeploymentBranch(): string {
  return getOwnerRepositoryBranch();
}

export function getDefaultStorefrontDeploymentBranch(slug: string): string {
  const normalizedSlug = ensureSlug(slug);
  return `${getStorefrontDeploymentBranchPrefix()}/${normalizedSlug}`;
}

export interface StoreDeploymentBranches {
  ownerBranch: string;
  adminBranch: string;
  storefrontBranch: string;
}

export function getStoreDeploymentBranches(
  slug: string,
  input?: Pick<StoreConfig, "bootstrap" | "storefront"> | null,
): StoreDeploymentBranches {
  const ownerBranch = getOwnerRepositoryBranch();

  return {
    ownerBranch,
    adminBranch:
      normalizeRepositoryBranch(input?.bootstrap?.adminDeploymentBranch) ||
      getDefaultAdminDeploymentBranch(),
    storefrontBranch:
      normalizeRepositoryBranch(input?.storefront?.deploymentBranch) ||
      getDefaultStorefrontDeploymentBranch(slug),
  };
}

function resolveDefaultRepositoryBranch(kind: "admin" | "storefront", slug?: string): string {
  if (kind === "storefront" && slug) {
    return getDefaultStorefrontDeploymentBranch(slug);
  }

  const kindSpecific =
    kind === "admin"
      ? normalizeRepositoryBranch(process.env.COOLIFY_ADMIN_REPOSITORY_BRANCH)
      : normalizeRepositoryBranch(process.env.COOLIFY_STOREFRONT_REPOSITORY_BRANCH);

  return kindSpecific || getOwnerRepositoryBranch();
}

function resolveStorefrontAppDirectory(slug: string): string {
  return `apps/storefront-${slug}`;
}

function resolveStorefrontPackageName(slug: string): string {
  return `@celebix/storefront-${slug}`;
}

function resolveDemoDomain(slug: string): string {
  return `${slug}.demo.celebix.co`;
}

function resolveLightPostgresCluster(): string {
  return process.env.CELEBIX_LIGHT_POSTGRES_CLUSTER?.trim() || "celebix-light-postgres";
}

function buildAdminWatchPaths(): string[] {
  return ["apps/admin/**", "packages/**"];
}

function buildStorefrontWatchPaths(slug: string): string[] {
  return [`${resolveStorefrontAppDirectory(slug)}/**`, "packages/**"];
}

function ensureSlug(slug: string): string {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Slug sadece kucuk harf, rakam ve tire icermelidir.");
  }

  if (slug.length < 2) {
    throw new Error("Slug en az 2 karakter olmali.");
  }

  return slug;
}

export function getExpectedStorefrontAppDir(slug: string): string {
  return `apps/storefront-${ensureSlug(slug)}`;
}

export function getExpectedStorefrontPackageName(slug: string): string {
  return `@celebix/storefront-${ensureSlug(slug)}`;
}

export function resolveAuthorityRepositoryBranch(): string {
  return (
    process.env.COOLIFY_OWNER_REPOSITORY_BRANCH?.trim() ||
    process.env.COOLIFY_ADMIN_REPOSITORY_BRANCH?.trim() ||
    process.env.COOLIFY_APPLICATION_REPOSITORY_BRANCH?.trim() ||
    process.env.CELEBIX_GIT_BRANCH?.trim() ||
    "deploy/owner"
  );
}

export function resolveStorefrontRepositoryBranch(slug: string): string {
  return `deploy/storefront/${ensureSlug(slug)}`;
}

function ensureDomain(domain: string): string {
  const normalizedDomain = domain.trim().toLocaleLowerCase("tr");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) {
    throw new Error("Gecerli bir domain girilmelidir.");
  }

  return normalizedDomain;
}

function buildAdminDeploymentDefaults(slug: string): GeneratedDeploymentConfig {
  return {
    strategy: resolveDeploymentStrategy(),
    image: resolveBuildServerImageRepository(slug, "admin"),
    imageTag: "production",
    useBuildServer: true,
    buildServer: resolveBuildServerName(),
    watchPaths: buildAdminWatchPaths(),
  };
}

function buildStorefrontDeploymentDefaults(slug: string): GeneratedDeploymentConfig {
  return {
    strategy: resolveDeploymentStrategy(),
    image: resolveBuildServerImageRepository(slug, "storefront"),
    imageTag: "production",
    useBuildServer: true,
    buildServer: resolveBuildServerName(),
    watchPaths: buildStorefrontWatchPaths(slug),
  };
}

function buildStoreConfig(input: Required<CreateStoreInput>): StoreConfig {
  const defaultSupabaseProvider = resolveDefaultSupabaseProvider();
  const databaseMode = resolveDefaultDatabaseMode(input.databaseMode);
  const coolifyProjectName = input.coolifyProjectName || input.name;
  const adminDeploymentName = input.adminDeploymentName || `${input.name} admin`;
  const storefrontDeploymentName = input.storefrontDeploymentName || `${input.name} websitesi`;
  const adminDeployment = buildAdminDeploymentDefaults(input.slug);
  const storefrontDeployment = buildStorefrontDeploymentDefaults(input.slug);
  const storefrontAppDir = resolveStorefrontAppDirectory(input.slug);
  const deploymentBranches = getStoreDeploymentBranches(input.slug);
  const adminDomain = resolveAdminDomain(input.domain);
  const r2Default = buildStoreR2Config({
    databaseMode,
    slug: input.slug,
  });

  return {
    name: input.name,
    slug: input.slug,
    status: "draft",
    databaseMode,
    authProvider: databaseMode === "full_supabase" ? "supabase" : "logto",
    customerAuthProvider: databaseMode === "full_supabase" ? "supabase" : "logto",
    analyticsProvider: "umami",
    storageProvider: databaseMode === "full_supabase" ? "supabase" : "r2",
    supabaseStatus: databaseMode === "full_supabase" ? "legacy" : "none",
    theme: {
      key: input.theme,
      label: input.theme[0].toUpperCase() + input.theme.slice(1),
      primaryColor: "#1f2937",
      accentColor: "#ea580c",
      surfaceColor: "#f8fafc",
      headingFont: "\"Times New Roman\", serif",
      bodyFont: "system-ui, sans-serif"
    },
    branding: {
      tagline: input.tagline || `${input.name} icin ortak Celebix commerce kurulumu`,
      supportEmail: input.supportEmail || `destek@${input.domain}`,
      supportPhone: input.supportPhone || "+90 532 000 00 00",
      senderEmail: `noreply@${input.domain}`,
      smsSenderTitle: input.slug.replace(/-/g, "").slice(0, 11).toUpperCase(),
      defaultProductBrand: input.name
      },
      domains: {
        storefront: input.domain,
        admin: adminDomain,
        demo: resolveDemoDomain(input.slug),
      },
    owner: {
      createdBy: "owner-panel",
      notes: "Merkezi owner panel uzerinden olusturuldu.",
      legacyModeSelected: databaseMode === "full_supabase",
      standardProfile:
        databaseMode === "full_supabase" ? "legacy_supabase" : "celebix_new_standard",
    },
    lightPostgres: {
      cluster: resolveLightPostgresCluster(),
      databaseName: input.slug,
      schemaProfile: "storefront_core",
      provisioning: databaseMode === "light_postgres" ? "pending-owner-env" : "configured",
      roleStatus: databaseMode === "light_postgres" ? "pending-owner-env" : "configured",
      schemaStatus: databaseMode === "light_postgres" ? "pending" : "ready",
      seedStatus: databaseMode === "light_postgres" ? "pending" : "ready",
      readinessStatus: databaseMode === "light_postgres" ? "pending" : "ready",
      umamiReady: true,
    },
    auth: buildDefaultStoreAuthConfig(databaseMode),
    analytics: buildDefaultStoreAnalyticsConfig(),
    logto: buildStoreLogtoConfig({
      databaseMode,
      slug: input.slug,
      storefrontDomain: input.domain,
      adminDomain,
    }),
    umami: buildStoreUmamiConfig({
      databaseMode,
      slug: input.slug,
      storeName: input.name,
      storefrontDomain: input.domain,
    }),
    readiness: buildDefaultStoreReadinessConfig(),
    payments: buildDefaultStorePaymentsConfig(),
    supabase: {
      projectRef: "pending-owner-bootstrap",
      url: "configure-in-env",
      provider: defaultSupabaseProvider,
      storage:
        databaseMode === "full_supabase"
          ? "separate-project-per-store"
          : "disabled-by-database-mode",
    },
    r2: r2Default,
    media: buildStoreMediaConfig({
      databaseMode,
      slug: input.slug,
      r2: r2Default,
    }),
    bootstrap: {
      createdAt: new Date().toISOString(),
      envTemplatePath: `stores/${input.slug}/admin.env.example`,
      authorityBranch: resolveDefaultAuthorityBranch(),
      coolifyProjectName,
      adminDeploymentProvider: "coolify",
      adminDeploymentName,
      adminDeploymentBranch: deploymentBranches.adminBranch,
      adminDeploymentRuntimeUrl: `https://${adminDomain}`,
      adminDeploymentResourceId: undefined,
      adminDeploymentStatus: "pending-owner-env",
      supabaseProvider: defaultSupabaseProvider,
      supabaseProvisioning:
        databaseMode === "full_supabase" ? "pending-owner-env" : "configured",
      adminDeployment,
    },
    storefront: {
      appDir: storefrontAppDir,
      packageName: resolveStorefrontPackageName(input.slug),
      status: "not_started",
      repoSyncStatus: "pending",
      deploymentProvider: "coolify",
      deploymentName: storefrontDeploymentName,
      deploymentBranch: deploymentBranches.storefrontBranch,
      runtimeUrl: `https://${input.domain}`,
      deploymentStatus: "pending-owner-env",
      deployment: storefrontDeployment,
    },
    features: ["catalog", "orders", "customers", "discounts", "cms", "frontend_from_existing_store"]
  };
}

function buildRegistryEntry(config: StoreConfig): StoreRegistryEntry {
  return {
    slug: config.slug,
    name: config.name,
    domain: config.domains.storefront,
    theme: config.theme.key,
    status: config.status
  };
}

function upsertStoreRegistryEntry(config: StoreConfig): void {
  const registryPath = path.join(getRepoRoot(), "stores", "registry.json");
  const currentRegistry = getStores();
  const nextEntry = buildRegistryEntry(config);
  const nextRegistry = currentRegistry
    .filter((entry) => entry.slug !== config.slug)
    .concat(nextEntry)
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));

  writeJsonFile(registryPath, nextRegistry);
}

function buildAdminEnvTemplate(config: StoreConfig): string {
  const lightPostgresSslMode = resolveLightPostgresDefaultSslMode();
  const databaseEnvLines =
    config.databaseMode === "full_supabase"
      ? [
          config.supabase.provider === "self_hosted_coolify"
            ? "NEXT_PUBLIC_SUPABASE_URL=https://supabasekong-your-store-slug.127.0.0.1.sslip.io"
            : "NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
          "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
          "# Opsiyonel migration fallback",
          "# SUPABASE_LEGACY_URL=https://your-old-project.supabase.co",
          "# SUPABASE_LEGACY_ANON_KEY=your-old-anon-key",
        ]
      : [
          "ADMIN_DATABASE_MODE=light_postgres",
          "DATABASE_URL=configure-per-store-database",
          "DATABASE_DIRECT_URL=configure-per-store-admin-database",
          "DATABASE_POOL_MODE=session",
          `LIGHT_POSTGRES_DATABASE_NAME=${config.lightPostgres?.databaseName || config.slug}`,
          "LIGHT_POSTGRES_DATABASE_URL=configure-per-store-database",
          `LIGHT_POSTGRES_DATABASE_SSLMODE=${lightPostgresSslMode}`,
          `DATABASE_SSLMODE=${lightPostgresSslMode}`,
          "NEXT_PUBLIC_RUNTIME_DATABASE_MODE=light_postgres",
          "AUTH_SETUP_STATUS=blocked_auth_setup",
          "NEXT_PUBLIC_AUTH_SETUP_STATUS=blocked_auth_setup",
        ];

  return [
    `STORE_SLUG=${config.slug}`,
    `DATABASE_MODE=${config.databaseMode}`,
    `CELEBIX_NEXT_BUILD_CPUS=${resolveProvisionedNextBuildCpuCap(2, ["CELEBIX_ADMIN_BUILD_CPUS"])}`,
    "",
    "# Admin deployment blueprint",
    `# APP_NAME=${config.bootstrap?.adminDeploymentName ?? `${config.slug}-admin`}`,
    `# COOLIFY_PROJECT_NAME=${config.bootstrap?.coolifyProjectName ?? config.name}`,
    `# AUTHORITY_BRANCH=${config.bootstrap?.authorityBranch ?? resolveDefaultAuthorityBranch()}`,
    `# APP_RUNTIME_URL=https://${config.domains.admin}`,
    `# APP_DEMO_URL=https://${config.domains.demo}`,
    `# DOCKER_IMAGE=${config.bootstrap?.adminDeployment?.image ?? resolveBuildServerImageRepository(config.slug, "admin")}`,
    `# DOCKER_IMAGE_TAG=${config.bootstrap?.adminDeployment?.imageTag ?? "production"}`,
    `# USE_BUILD_SERVER=${String(config.bootstrap?.adminDeployment?.useBuildServer ?? true)}`,
    `# BUILD_SERVER=${config.bootstrap?.adminDeployment?.buildServer ?? resolveBuildServerName()}`,
    "# INSTALL_COMMAND=npm ci --include=optional --no-audit --no-fund",
    "# BUILD_COMMAND=npm run build --workspace @celebix/admin",
    "# START_COMMAND=npm run start --workspace @celebix/admin",
    "",
    ...databaseEnvLines,
    "",
    `NEXT_PUBLIC_STORE_DOMAIN=${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_DOMAIN=${config.domains.admin}`,
    `NEXT_PUBLIC_DEMO_DOMAIN=${config.domains.demo}`,
    `NEXT_PUBLIC_SITE_URL=https://${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_URL=https://${config.domains.admin}`,
    `NEXT_PUBLIC_STORE_NAME=${config.name}`,
    `NEXT_PUBLIC_STORE_TAGLINE=${config.branding?.tagline || ""}`,
    `NEXT_PUBLIC_DEFAULT_PRODUCT_BRAND=${config.branding?.defaultProductBrand || config.name}`,
    `NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL=${getConfiguredImageTransformationUrl()}`,
    "",
    "REDIS_URL=redis://your-coolify-redis:6379",
    "REDIS_PREFIX=celebix",
    "",
    "CLOUDFLARE_ACCOUNT_ID=your-r2-account-id",
    "R2_ACCESS_KEY_ID=your-r2-access-key",
    "R2_SECRET_ACCESS_KEY=your-r2-secret",
    "R2_BUCKET_NAME=your-r2-bucket",
    `R2_PUBLIC_URL=https://cdn.${config.domains.storefront}`,
    ""
  ].join("\n");
}

function inferR2ProvisioningStatus(
  config: Pick<StoreConfig, "r2">,
): "pending-owner-env" | "configured" | "failed" {
  if (config.r2?.provisioning === "configured" || config.r2?.provisioning === "failed") {
    return config.r2.provisioning;
  }

  return config.r2?.bucketName || config.r2?.publicUrl ? "configured" : "pending-owner-env";
}

function inferStorefrontStatus(config: StoreConfig): StorefrontStatus {
  if (config.storefront?.status) {
    return config.storefront.status;
  }

  if (config.storefront?.deploymentStatus === "configured") {
    return "active";
  }

  return config.storefront?.appDir ? "scaffolded" : "not_started";
}

function inferLightPostgresProvisioningStatus(
  config: Pick<StoreConfig, "databaseMode" | "lightPostgres">,
): StoreProvisioningStatus {
  if (
    config.lightPostgres?.provisioning === "configured" ||
    config.lightPostgres?.provisioning === "failed"
  ) {
    return config.lightPostgres.provisioning;
  }

  if (config.databaseMode === "full_supabase") {
    return "configured";
  }

  return config.lightPostgres?.databaseName ? "pending-owner-env" : "pending-owner-env";
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalPath(value: string | null | undefined): string | undefined {
  const trimmed = normalizeOptionalString(value);
  return trimmed ? trimmed.replace(/\\/g, "/").replace(/^\/+/, "") : undefined;
}

function resolveStorefrontTimestamp(
  explicitValue: string | null | undefined,
  currentValue: string | undefined,
  shouldStampNow: boolean,
): string | undefined {
  const normalizedExplicit = normalizeOptionalString(explicitValue);

  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  if (currentValue) {
    return currentValue;
  }

  return shouldStampNow ? new Date().toISOString() : undefined;
}

function mergeStorefrontConfig(current: StoreConfig, patch: StorefrontAuthorityPatchInput): NonNullable<StoreConfig["storefront"]> {
  const currentStorefront = current.storefront;
  const currentDeployment =
    currentStorefront?.deployment ?? buildStorefrontDeploymentDefaults(current.slug);
  const nextAppDir =
    normalizeOptionalPath(patch.appDir) ??
    normalizeOptionalPath(currentStorefront?.appDir);
  const nextRepoSyncStatus = patch.repoSyncStatus ?? currentStorefront?.repoSyncStatus ?? "pending";
  const nextDeploymentStatus =
    patch.deploymentStatus ??
    currentStorefront?.deploymentStatus ??
    "pending-owner-env";
  const nextStatus =
    patch.status ??
    (nextDeploymentStatus === "configured"
      ? "active"
      : currentStorefront?.status ?? (nextAppDir ? "scaffolded" : "not_started"));
  const shouldStampScaffoldedAt =
    Boolean(nextAppDir) &&
    (patch.status === "scaffolded" || patch.status === "active" || Boolean(patch.lastScaffoldedAt));
  const shouldStampRepoSyncedAt =
    nextRepoSyncStatus === "synced" &&
    Boolean(patch.repoSyncedAt || patch.lastRepoSyncedAt || patch.repoSyncStatus === "synced");
  const shouldStampPreparedAt =
    (nextDeploymentStatus === "prepared" || nextDeploymentStatus === "configured") &&
    Boolean(
      patch.preparedAt ||
        patch.lastDeploymentPreparedAt ||
        patch.deploymentStatus === "prepared" ||
        patch.deploymentStatus === "configured",
    );

  return {
    appDir: nextAppDir,
    packageName:
      normalizeOptionalString(currentStorefront?.packageName) ??
      resolveStorefrontPackageName(current.slug),
    status: nextStatus,
    lastScaffoldedAt: resolveStorefrontTimestamp(
      patch.lastScaffoldedAt,
      currentStorefront?.lastScaffoldedAt,
      shouldStampScaffoldedAt,
    ),
    lastScaffoldError:
      patch.lastScaffoldError !== undefined
        ? normalizeOptionalString(patch.lastScaffoldError)
        : currentStorefront?.lastScaffoldError,
    repoSyncStatus: nextRepoSyncStatus,
    repoSyncedAt: resolveStorefrontTimestamp(
      patch.repoSyncedAt ?? patch.lastRepoSyncedAt,
      currentStorefront?.repoSyncedAt ?? currentStorefront?.lastRepoSyncedAt,
      shouldStampRepoSyncedAt,
    ),
    lastRepoSyncedAt: resolveStorefrontTimestamp(
      patch.lastRepoSyncedAt ?? patch.repoSyncedAt,
      currentStorefront?.lastRepoSyncedAt ?? currentStorefront?.repoSyncedAt,
      shouldStampRepoSyncedAt,
    ),
    repoCommitSha:
      patch.repoCommitSha !== undefined
        ? normalizeOptionalString(patch.repoCommitSha)
        : currentStorefront?.repoCommitSha,
    lastRepoSyncError:
      patch.lastRepoSyncError !== undefined
        ? normalizeOptionalString(patch.lastRepoSyncError)
        : currentStorefront?.lastRepoSyncError,
    deploymentProvider:
      patch.deploymentProvider ??
      currentStorefront?.deploymentProvider ??
      "coolify",
    deploymentName:
      normalizeOptionalString(patch.deploymentName) ??
      currentStorefront?.deploymentName ??
      `${current.slug}-storefront`,
    deploymentBranch:
      normalizeOptionalString(patch.deploymentBranch) ??
      currentStorefront?.deploymentBranch ??
      resolveStorefrontRepositoryBranch(current.slug),
    runtimeUrl:
      normalizeOptionalString(patch.runtimeUrl) ??
      currentStorefront?.runtimeUrl ??
      `https://${current.domains.storefront}`,
    resourceId:
      patch.resourceId !== undefined
        ? normalizeOptionalString(patch.resourceId)
        : currentStorefront?.resourceId,
    deploymentStatus: nextDeploymentStatus,
    preparedAt: resolveStorefrontTimestamp(
      patch.preparedAt ?? patch.lastDeploymentPreparedAt,
      currentStorefront?.preparedAt ?? currentStorefront?.lastDeploymentPreparedAt,
      shouldStampPreparedAt,
    ),
    lastDeploymentPreparedAt: resolveStorefrontTimestamp(
      patch.lastDeploymentPreparedAt ?? patch.preparedAt,
      currentStorefront?.lastDeploymentPreparedAt ?? currentStorefront?.preparedAt,
      shouldStampPreparedAt,
    ),
    deployedAt:
      patch.deployedAt !== undefined
        ? normalizeOptionalString(patch.deployedAt)
        : currentStorefront?.deployedAt,
    lastDeploymentError:
      patch.lastDeploymentError !== undefined
        ? normalizeOptionalString(patch.lastDeploymentError)
        : currentStorefront?.lastDeploymentError,
    deployment: {
      strategy: currentDeployment.strategy ?? resolveDeploymentStrategy(),
      image:
        currentDeployment.image ??
        resolveBuildServerImageRepository(current.slug, "storefront"),
      imageTag: currentDeployment.imageTag ?? "production",
      useBuildServer: currentDeployment.useBuildServer ?? true,
      buildServer: currentDeployment.buildServer ?? resolveBuildServerName(),
      watchPaths:
        currentDeployment.watchPaths?.length
          ? currentDeployment.watchPaths
          : buildStorefrontWatchPaths(current.slug),
    },
  };
}

function normalizeStoreConfig(config: StoreConfig): StoreConfig {
  const databaseMode = resolveDefaultDatabaseMode(config.databaseMode);
  const supabaseProvider =
    config.supabase.provider ??
    config.bootstrap?.supabaseProvider ??
    resolveDefaultSupabaseProvider();
  const adminDeploymentDefaults =
    config.bootstrap?.adminDeployment ?? buildAdminDeploymentDefaults(config.slug);
  const storefrontDeploymentDefaults =
    config.storefront?.deployment ?? buildStorefrontDeploymentDefaults(config.slug);
  const deploymentBranches = getStoreDeploymentBranches(config.slug, config);
  const normalizedBootstrap = {
    createdAt: config.bootstrap?.createdAt ?? new Date().toISOString(),
    envTemplatePath: config.bootstrap?.envTemplatePath ?? `stores/${config.slug}/admin.env.example`,
    adminEnvLocalPath: config.bootstrap?.adminEnvLocalPath,
    authorityBranch: config.bootstrap?.authorityBranch ?? resolveDefaultAuthorityBranch(),
    coolifyProjectName: config.bootstrap?.coolifyProjectName ?? config.name,
    adminDeploymentProvider: config.bootstrap?.adminDeploymentProvider ?? "coolify",
    adminDeploymentName: config.bootstrap?.adminDeploymentName ?? `${config.slug}-admin`,
    adminDeploymentBranch: deploymentBranches.adminBranch,
    adminDeploymentRuntimeUrl:
      config.bootstrap?.adminDeploymentRuntimeUrl ?? `https://${config.domains.admin}`,
    adminDeploymentResourceId: config.bootstrap?.adminDeploymentResourceId,
    adminDeploymentStatus: config.bootstrap?.adminDeploymentStatus ?? "pending-owner-env",
    adminDeploymentPreparedAt: config.bootstrap?.adminDeploymentPreparedAt,
    adminDeploymentDeployedAt: config.bootstrap?.adminDeploymentDeployedAt,
    adminDeploymentLastError: config.bootstrap?.adminDeploymentLastError,
    organizationSlug: config.bootstrap?.organizationSlug,
    supabaseProvider,
    supabaseProjectName: config.bootstrap?.supabaseProjectName,
    supabaseResourceId: config.bootstrap?.supabaseResourceId,
    supabaseDashboardUrl: config.bootstrap?.supabaseDashboardUrl ?? config.supabase.dashboardUrl,
    provisionedAt: config.bootstrap?.provisionedAt,
    lastProvisionError: config.bootstrap?.lastProvisionError,
    supabaseProvisioning:
      config.bootstrap?.supabaseProvisioning ??
      (databaseMode === "light_postgres"
        ? "configured"
        : config.supabase.projectRef && config.supabase.projectRef !== "pending-owner-bootstrap"
        ? "configured"
        : "pending-owner-env"),
    adminDeployment: {
      strategy: adminDeploymentDefaults.strategy ?? resolveDeploymentStrategy(),
      image: adminDeploymentDefaults.image ?? resolveBuildServerImageRepository(config.slug, "admin"),
      imageTag: adminDeploymentDefaults.imageTag ?? "production",
      useBuildServer: adminDeploymentDefaults.useBuildServer ?? true,
      buildServer: adminDeploymentDefaults.buildServer ?? resolveBuildServerName(),
      watchPaths: adminDeploymentDefaults.watchPaths?.length
        ? adminDeploymentDefaults.watchPaths
        : buildAdminWatchPaths(),
    },
  } satisfies NonNullable<StoreConfig["bootstrap"]>;
  const normalizedDomains = {
    storefront: config.domains.storefront,
    admin: config.domains.admin,
    demo: config.domains.demo ?? resolveDemoDomain(config.slug),
  } satisfies StoreConfig["domains"];
  const normalizedLightPostgres = {
    cluster: config.lightPostgres?.cluster ?? resolveLightPostgresCluster(),
    databaseName: config.lightPostgres?.databaseName ?? config.slug,
    schemaProfile: config.lightPostgres?.schemaProfile ?? "storefront_core",
    provisioning: inferLightPostgresProvisioningStatus({
      databaseMode,
      lightPostgres: config.lightPostgres,
    }),
    provisionedAt: config.lightPostgres?.provisionedAt,
    lastProvisionError: config.lightPostgres?.lastProvisionError,
    umamiReady: config.lightPostgres?.umamiReady ?? true,
    roleName: config.lightPostgres?.roleName,
    roleStatus:
      config.lightPostgres?.roleStatus ??
      (databaseMode === "full_supabase"
        ? "configured"
        : config.lightPostgres?.provisioning === "configured"
        ? "admin-shared"
        : "pending-owner-env"),
    schemaStatus:
      config.lightPostgres?.schemaStatus ??
      (databaseMode === "full_supabase" || config.lightPostgres?.provisioning === "configured"
        ? "ready"
        : "pending"),
    seedStatus:
      config.lightPostgres?.seedStatus ??
      (databaseMode === "full_supabase" || config.lightPostgres?.provisioning === "configured"
        ? "ready"
        : "pending"),
    readinessStatus:
      config.lightPostgres?.readinessStatus ??
      (databaseMode === "full_supabase" || config.lightPostgres?.provisioning === "configured"
        ? "ready"
        : "pending"),
    readinessCheckedAt: config.lightPostgres?.readinessCheckedAt,
    readinessRepairAction: config.lightPostgres?.readinessRepairAction,
    missingTables: config.lightPostgres?.missingTables ?? [],
    missingSeedKeys: config.lightPostgres?.missingSeedKeys ?? [],
    missingOptionalModules: config.lightPostgres?.missingOptionalModules ?? [],
    missingPaymentGatewayKeys: config.lightPostgres?.missingPaymentGatewayKeys ?? [],
    missingAuthBridgeTables: config.lightPostgres?.missingAuthBridgeTables ?? [],
    lastReadinessError: config.lightPostgres?.lastReadinessError,
  } satisfies NonNullable<StoreConfig["lightPostgres"]>;
  const defaultAuth = buildDefaultStoreAuthConfig(databaseMode);
  const normalizedAuth = {
    provider: config.auth?.provider ?? defaultAuth.provider,
    status:
      config.auth?.status ??
      (config.auth?.mode === "legacy_supabase_auth" || databaseMode === "full_supabase"
        ? "configured"
        : defaultAuth.status),
    mode: config.auth?.mode ?? defaultAuth.mode,
    requiredAction: config.auth?.requiredAction ?? defaultAuth.requiredAction,
    blocking: config.auth?.blocking ?? false,
  } satisfies NonNullable<StoreConfig["auth"]>;
  const defaultAnalytics = buildDefaultStoreAnalyticsConfig();
  const normalizedAnalytics = {
    provider: config.analytics?.provider ?? defaultAnalytics.provider,
    status:
      config.analytics?.status ??
      (config.analytics?.websiteId?.trim() ? "configured" : defaultAnalytics.status),
    mode: config.analytics?.mode ?? defaultAnalytics.mode,
    websiteId: normalizeOptionalString(config.analytics?.websiteId),
    requiredAction: config.analytics?.requiredAction ?? defaultAnalytics.requiredAction,
    blocking: config.analytics?.blocking ?? false,
  } satisfies NonNullable<StoreConfig["analytics"]>;
  const defaultLogto = buildStoreLogtoConfig({
    databaseMode,
    slug: config.slug,
    storefrontDomain: normalizedDomains.storefront,
    adminDomain: normalizedDomains.admin,
  });
  const normalizedLogto = {
    adminAppStatus: config.logto?.adminAppStatus ?? defaultLogto.adminAppStatus,
    customerAppStatus: config.logto?.customerAppStatus ?? defaultLogto.customerAppStatus,
    adminAppId: normalizeOptionalString(config.logto?.adminAppId) ?? null,
    adminClientId: normalizeOptionalString(config.logto?.adminClientId) ?? null,
    customerAppId: normalizeOptionalString(config.logto?.customerAppId) ?? null,
    customerClientId: normalizeOptionalString(config.logto?.customerClientId) ?? null,
    adminIssuer: normalizeOptionalString(config.logto?.adminIssuer) ?? defaultLogto.adminIssuer,
    customerIssuer: normalizeOptionalString(config.logto?.customerIssuer) ?? defaultLogto.customerIssuer,
    adminRedirectUris:
      config.logto?.adminRedirectUris?.length ? config.logto.adminRedirectUris : defaultLogto.adminRedirectUris,
    adminPostLogoutRedirectUris:
      config.logto?.adminPostLogoutRedirectUris?.length
        ? config.logto.adminPostLogoutRedirectUris
        : defaultLogto.adminPostLogoutRedirectUris,
    adminOrigins:
      config.logto?.adminOrigins?.length ? config.logto.adminOrigins : defaultLogto.adminOrigins,
    customerRedirectUris:
      config.logto?.customerRedirectUris?.length ? config.logto.customerRedirectUris : defaultLogto.customerRedirectUris,
    customerPostLogoutRedirectUris:
      config.logto?.customerPostLogoutRedirectUris?.length
        ? config.logto.customerPostLogoutRedirectUris
        : defaultLogto.customerPostLogoutRedirectUris,
    customerOrigins:
      config.logto?.customerOrigins?.length ? config.logto.customerOrigins : defaultLogto.customerOrigins,
    googleSignIn: config.logto?.googleSignIn ?? defaultLogto.googleSignIn,
    emailRecovery: config.logto?.emailRecovery ?? defaultLogto.emailRecovery,
    adminBootstrapConfigPath:
      normalizeOptionalString(config.logto?.adminBootstrapConfigPath) ??
      defaultLogto.adminBootstrapConfigPath,
    customerBootstrapConfigPath:
      normalizeOptionalString(config.logto?.customerBootstrapConfigPath) ??
      defaultLogto.customerBootstrapConfigPath,
    bootstrapApplyState: config.logto?.bootstrapApplyState ?? defaultLogto.bootstrapApplyState,
    lastProvisionError: normalizeOptionalString(config.logto?.lastProvisionError),
  } satisfies NonNullable<StoreConfig["logto"]>;
  const defaultUmami = buildStoreUmamiConfig({
    databaseMode,
    slug: config.slug,
    storeName: config.name,
    storefrontDomain: normalizedDomains.storefront,
  });
  const normalizedUmami = {
    websiteStatus:
      config.umami?.websiteStatus ??
      (normalizeOptionalString(config.analytics?.websiteId) ? "configured" : defaultUmami.websiteStatus),
    websiteId:
      normalizeOptionalString(config.umami?.websiteId) ??
      normalizeOptionalString(config.analytics?.websiteId) ??
      null,
    websiteName: normalizeOptionalString(config.umami?.websiteName) ?? defaultUmami.websiteName,
    domain: normalizeOptionalString(config.umami?.domain) ?? defaultUmami.domain,
    canonicalDomain:
      normalizeOptionalString(config.umami?.canonicalDomain) ?? defaultUmami.canonicalDomain,
    host: normalizeOptionalString(config.umami?.host) ?? defaultUmami.host,
    apiUrl: normalizeOptionalString(config.umami?.apiUrl) ?? defaultUmami.apiUrl,
    scriptUrl: normalizeOptionalString(config.umami?.scriptUrl) ?? defaultUmami.scriptUrl,
    timezone: normalizeOptionalString(config.umami?.timezone) ?? defaultUmami.timezone,
    storefrontTrackingStatus:
      config.umami?.storefrontTrackingStatus ?? defaultUmami.storefrontTrackingStatus,
    adminAnalyticsStatus: config.umami?.adminAnalyticsStatus ?? defaultUmami.adminAnalyticsStatus,
    serverTokenStatus: config.umami?.serverTokenStatus ?? defaultUmami.serverTokenStatus,
    adminSummaryEndpoint:
      normalizeOptionalString(config.umami?.adminSummaryEndpoint) ??
      defaultUmami.adminSummaryEndpoint,
    metrics: config.umami?.metrics?.length ? config.umami.metrics : defaultUmami.metrics,
    bootstrapConfigPath:
      normalizeOptionalString(config.umami?.bootstrapConfigPath) ??
      defaultUmami.bootstrapConfigPath,
    bootstrapApplyState: config.umami?.bootstrapApplyState ?? defaultUmami.bootstrapApplyState,
    lastProvisionError: normalizeOptionalString(config.umami?.lastProvisionError),
  } satisfies NonNullable<StoreConfig["umami"]>;
  const defaultR2 = buildStoreR2Config({
    databaseMode,
    slug: config.slug,
  });
  const normalizedR2 = {
    ...defaultR2,
    ...(config.r2 ?? {}),
    status:
      config.r2?.status ??
      (databaseMode === "light_postgres"
        ? inferR2ProvisioningStatus(config) === "configured"
          ? "configured"
          : "pending"
        : "skipped"),
    bucketName: normalizeOptionalString(config.r2?.bucketName) ?? defaultR2.bucketName ?? null,
    publicUrl: normalizeOptionalString(config.r2?.publicUrl) ?? defaultR2.publicUrl ?? null,
    managedDomain:
      normalizeOptionalString(config.r2?.managedDomain) ?? defaultR2.managedDomain ?? null,
    endpoint: normalizeOptionalString(config.r2?.endpoint) ?? defaultR2.endpoint ?? null,
    region: normalizeOptionalString(config.r2?.region) ?? defaultR2.region,
    prefix: normalizeOptionalString(config.r2?.prefix) ?? defaultR2.prefix,
    uploadPrefix: normalizeOptionalString(config.r2?.uploadPrefix) ?? defaultR2.uploadPrefix,
    productImagesPrefix:
      normalizeOptionalString(config.r2?.productImagesPrefix) ?? defaultR2.productImagesPrefix,
    pageImagesPrefix:
      normalizeOptionalString(config.r2?.pageImagesPrefix) ?? defaultR2.pageImagesPrefix,
    brandingPrefix: normalizeOptionalString(config.r2?.brandingPrefix) ?? defaultR2.brandingPrefix,
    publicUrlTemplate:
      normalizeOptionalString(config.r2?.publicUrlTemplate) ??
      (normalizeOptionalString(config.r2?.publicUrl)
        ? `${normalizeOptionalString(config.r2?.publicUrl)!.replace(/\/+$/, "")}/{key}`
        : defaultR2.publicUrlTemplate),
    adminUploadStatus: config.r2?.adminUploadStatus ?? defaultR2.adminUploadStatus,
    storefrontReadStatus: config.r2?.storefrontReadStatus ?? defaultR2.storefrontReadStatus,
    credentialsStatus: config.r2?.credentialsStatus ?? defaultR2.credentialsStatus,
    bootstrapConfigPath:
      normalizeOptionalString(config.r2?.bootstrapConfigPath) ?? defaultR2.bootstrapConfigPath,
    bootstrapApplyState: config.r2?.bootstrapApplyState ?? defaultR2.bootstrapApplyState,
    noSupabaseStorage: config.r2?.noSupabaseStorage ?? defaultR2.noSupabaseStorage,
    provisioning: inferR2ProvisioningStatus(config),
    provisionedAt: normalizeOptionalString(config.r2?.provisionedAt) ?? undefined,
    lastProvisionError: normalizeOptionalString(config.r2?.lastProvisionError) ?? undefined,
  } satisfies StoreR2Config;
  const defaultMedia = buildStoreMediaConfig({
    databaseMode,
    slug: config.slug,
    r2: normalizedR2,
  });
  const normalizedMedia = {
    ...defaultMedia,
    ...(config.media ?? {}),
    provider: "r2",
    status: config.media?.status ?? normalizedR2.status ?? defaultMedia.status,
    publicBaseUrl:
      normalizeOptionalString(config.media?.publicBaseUrl) ?? normalizedR2.publicUrl ?? null,
    prefix: normalizeOptionalString(config.media?.prefix) ?? normalizedR2.prefix ?? defaultMedia.prefix,
    uploadPrefix:
      normalizeOptionalString(config.media?.uploadPrefix) ??
      normalizedR2.uploadPrefix ??
      defaultMedia.uploadPrefix,
    productImagesPrefix:
      normalizeOptionalString(config.media?.productImagesPrefix) ??
      normalizedR2.productImagesPrefix ??
      defaultMedia.productImagesPrefix,
    pageImagesPrefix:
      normalizeOptionalString(config.media?.pageImagesPrefix) ??
      normalizedR2.pageImagesPrefix ??
      defaultMedia.pageImagesPrefix,
    brandingPrefix:
      normalizeOptionalString(config.media?.brandingPrefix) ??
      normalizedR2.brandingPrefix ??
      defaultMedia.brandingPrefix,
    publicUrlTemplate:
      normalizeOptionalString(config.media?.publicUrlTemplate) ??
      normalizedR2.publicUrlTemplate ??
      null,
    adminUploadStatus:
      config.media?.adminUploadStatus ?? normalizedR2.adminUploadStatus ?? defaultMedia.adminUploadStatus,
    storefrontReadStatus:
      config.media?.storefrontReadStatus ??
      normalizedR2.storefrontReadStatus ??
      defaultMedia.storefrontReadStatus,
    noSupabaseStorage: config.media?.noSupabaseStorage ?? normalizedR2.noSupabaseStorage ?? true,
  } satisfies StoreMediaConfig;
  const defaultReadiness = buildDefaultStoreReadinessConfig();
  const normalizedReadiness = {
    database:
      config.readiness?.database ??
      (inferLightPostgresProvisioningStatus({
        databaseMode,
        lightPostgres: config.lightPostgres,
      }) === "configured" || databaseMode === "full_supabase"
        ? "ready"
        : defaultReadiness.database),
    databaseSchema:
      config.readiness?.databaseSchema ??
      (normalizedLightPostgres.schemaStatus === "ready" ? "ready" : defaultReadiness.database),
    databaseSeed:
      config.readiness?.databaseSeed ??
      (normalizedLightPostgres.seedStatus === "ready" ? "ready" : defaultReadiness.database),
    databaseSmoke:
      config.readiness?.databaseSmoke ??
      (normalizedLightPostgres.readinessStatus === "ready" ? "ready" : defaultReadiness.database),
    storage:
      config.readiness?.storage ??
      (normalizedR2.provisioning === "configured" || databaseMode === "full_supabase"
        ? "ready"
        : defaultReadiness.storage),
    auth:
      config.readiness?.auth ??
      (normalizedAuth.status === "configured" ||
      (normalizedLogto.adminAppStatus === "configured" &&
        normalizedLogto.customerAppStatus === "configured")
        ? "ready"
        : defaultReadiness.auth),
    analytics:
      config.readiness?.analytics ??
      (normalizedAnalytics.status === "configured" || normalizedUmami.websiteStatus === "configured"
        ? "ready"
        : defaultReadiness.analytics),
    admin:
      config.readiness?.admin ??
      (config.bootstrap?.adminDeploymentStatus === "configured" ? "ready" : defaultReadiness.admin),
    storefront:
      config.readiness?.storefront ??
      (config.storefront?.deploymentStatus === "configured" ? "ready" : defaultReadiness.storefront),
    smoke: config.readiness?.smoke ?? defaultReadiness.smoke,
  } satisfies NonNullable<StoreConfig["readiness"]>;
  const defaultPayments = buildDefaultStorePaymentsConfig();
  const normalizedPayments = {
    status: config.payments?.status ?? defaultPayments.status,
    defaultProvider: config.payments?.defaultProvider ?? defaultPayments.defaultProvider,
    requiredAction: config.payments?.requiredAction ?? defaultPayments.requiredAction,
    blocking: config.payments?.blocking ?? false,
  } satisfies NonNullable<StoreConfig["payments"]>;
  const normalizedStorefront = mergeStorefrontConfig(
    {
      ...config,
      storefront: {
        ...config.storefront,
        deployment:
          config.storefront?.deployment ?? storefrontDeploymentDefaults,
        status: inferStorefrontStatus(config),
      },
    },
    {},
  );

  return {
    ...config,
    databaseMode,
    authProvider: config.authProvider ?? normalizedAuth.provider,
    customerAuthProvider: config.customerAuthProvider ?? normalizedAuth.provider,
    analyticsProvider: config.analyticsProvider ?? normalizedAnalytics.provider,
    storageProvider:
      config.storageProvider ?? (databaseMode === "full_supabase" ? "supabase" : "r2"),
    supabaseStatus:
      config.supabaseStatus ?? (databaseMode === "full_supabase" ? "legacy" : "none"),
    domains: normalizedDomains,
    lightPostgres: normalizedLightPostgres,
    auth: normalizedAuth,
    analytics: normalizedAnalytics,
    logto: normalizedLogto,
    umami: normalizedUmami,
    readiness: normalizedReadiness,
    payments: normalizedPayments,
    supabase: {
      ...config.supabase,
      provider: supabaseProvider,
      storage:
        databaseMode === "full_supabase"
          ? config.supabase.storage || "separate-project-per-store"
          : "disabled-by-database-mode",
    },
    r2: normalizedR2,
    media: normalizedMedia,
    bootstrap: normalizedBootstrap,
    storefront: normalizedStorefront,
  };
}

function getStoreDirectory(slug: string): string {
  return path.join(getRepoRoot(), "stores", slug);
}

function getStoreConfigPath(slug: string): string {
  return path.join(getStoreDirectory(slug), "store.config.json");
}

function isSafeRepoChild(repoRoot: string, targetPath: string): boolean {
  const relativePath = path.relative(repoRoot, targetPath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function getRepoRoot(): string {
  return findRepoRoot();
}

export function getStores(): StoreRegistryEntry[] {
  return readJsonFile<StoreRegistryEntry[]>(path.join(getRepoRoot(), "stores", "registry.json"));
}

export function getStoreConfig(slug: string): StoreConfig | null {
  const configPath = getStoreConfigPath(slug);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  return normalizeStoreConfig(readJsonFile<StoreConfig>(configPath));
}

export function repairStoreConfig(slug: string): StoreConfig {
  const configPath = getStoreConfigPath(slug);

  if (!fs.existsSync(configPath)) {
    throw new Error(`"${slug}" icin store config bulunamadi.`);
  }

  const repaired = normalizeStoreConfig(readJsonFile<StoreConfig>(configPath));
  writeJsonFile(configPath, repaired);
  return repaired;
}

export function repairTrackedStoreConfigs(slugs?: string[]): string[] {
  const trackedSlugs = Array.from(
    new Set((slugs?.length ? slugs : getStores().map((store) => store.slug)).filter(Boolean)),
  );
  const repairedSlugs: string[] = [];

  for (const slug of trackedSlugs) {
    const configPath = getStoreConfigPath(slug);

    if (!fs.existsSync(configPath)) {
      continue;
    }

    const current = readJsonFile<StoreConfig>(configPath);
    const repaired = normalizeStoreConfig(current);
    const currentSerialized = `${JSON.stringify(current, null, 2)}\n`;
    const repairedSerialized = `${JSON.stringify(repaired, null, 2)}\n`;

    if (currentSerialized !== repairedSerialized) {
      writeJsonFile(configPath, repaired);
    }

    repairedSlugs.push(slug);
  }

  return repairedSlugs;
}

export function removeStoreArtifacts(
  slug: string,
  input: RemoveStoreArtifactsInput = {},
): RemoveStoreArtifactsResult {
  const repoRoot = getRepoRoot();
  const registryPath = path.join(repoRoot, "stores", "registry.json");
  const storeDirectory = getStoreDirectory(slug);
  const removedPaths: string[] = [];
  const updatedPaths: string[] = [];
  const skippedPaths: string[] = [];

  if (fs.existsSync(registryPath)) {
    const registry = getStores();
    const nextRegistry = registry.filter((entry) => entry.slug !== slug);

    if (nextRegistry.length !== registry.length) {
      writeJsonFile(registryPath, nextRegistry);
      updatedPaths.push("stores/registry.json");
    }
  }

  if (fs.existsSync(storeDirectory)) {
    if (!isSafeRepoChild(repoRoot, storeDirectory)) {
      skippedPaths.push(path.relative(repoRoot, storeDirectory).replace(/\\/g, "/"));
    } else {
      fs.rmSync(storeDirectory, { recursive: true, force: true });
      removedPaths.push(path.relative(repoRoot, storeDirectory).replace(/\\/g, "/"));
    }
  }

  const configuredAppDir = input.storefrontAppDir?.trim() || getStoreConfig(slug)?.storefront?.appDir?.trim() || "";

  if (configuredAppDir) {
    const normalizedAppDir = configuredAppDir.replace(/^[/\\]+/, "");
    const absoluteAppDir = path.resolve(repoRoot, normalizedAppDir);
    const expectedBasename = `storefront-${slug}`;
    const relativeAppDir = path.relative(repoRoot, absoluteAppDir).replace(/\\/g, "/");

    const safeAppDir =
      isSafeRepoChild(repoRoot, absoluteAppDir) &&
      relativeAppDir.startsWith("apps/") &&
      path.basename(absoluteAppDir) === expectedBasename;

    if (!safeAppDir) {
      skippedPaths.push(relativeAppDir || normalizedAppDir);
    } else if (fs.existsSync(absoluteAppDir)) {
      fs.rmSync(absoluteAppDir, { recursive: true, force: true });
      removedPaths.push(relativeAppDir);
    }
  }

  return {
    updatedPaths,
    removedPaths,
    skippedPaths,
  };
}

export function requireStoreConfig(slug: string): StoreConfig {
  const config = getStoreConfig(slug);

  if (!config) {
    throw new Error(`"${slug}" icin store config bulunamadi.`);
  }

  return config;
}

export function getActiveStoreSlug(fallback?: string): string {
  const configuredSlug = process.env.STORE_SLUG ?? process.env.NEXT_PUBLIC_STORE_SLUG;

  if (configuredSlug) {
    return configuredSlug;
  }

  if (fallback) {
    return fallback;
  }

  const stores = getStores();

  if (stores.length === 0) {
    throw new Error("Aktif store belirlenemedi. Registry bos.");
  }

  return stores[0].slug;
}

export function createStore(input: CreateStoreInput): CreateStoreResult {
  const repoRoot = getRepoRoot();
  const storesDirectory = path.join(repoRoot, "stores");
  const registryPath = path.join(storesDirectory, "registry.json");
  const name = input.name.trim();
  const slug = ensureSlug(input.slug?.trim() || slugifyStoreName(name));
  const domain = ensureDomain(input.domain);
  const theme = input.theme?.trim() || "atelier";

  if (!name) {
    throw new Error("Magaza adi zorunludur.");
  }

  const registry = getStores();

  if (registry.some((store) => store.slug === slug)) {
    throw new Error(`"${slug}" zaten kayitli.`);
  }

  const config = buildStoreConfig({
    name,
    slug,
    domain,
    theme,
    tagline: input.tagline?.trim() || "",
    supportEmail: input.supportEmail?.trim() || "",
    supportPhone: input.supportPhone?.trim() || "",
    coolifyProjectName: input.coolifyProjectName?.trim() || name,
    adminDeploymentName: input.adminDeploymentName?.trim() || `${name} admin`,
    storefrontDeploymentName: input.storefrontDeploymentName?.trim() || `${name} websitesi`,
    databaseMode: resolveDefaultDatabaseMode(input.databaseMode),
  });

  const registryEntry = buildRegistryEntry(config);
  const nextRegistry = [...registry, registryEntry].sort((left: StoreRegistryEntry, right: StoreRegistryEntry) =>
    left.name.localeCompare(right.name, "tr")
  );
  const storeDirectory = path.join(storesDirectory, slug);
  const configPath = path.join(storeDirectory, "store.config.json");
  const envTemplatePath = path.join(storeDirectory, "admin.env.example");

  fs.mkdirSync(storeDirectory, { recursive: true });
  writeJsonFile(registryPath, nextRegistry);
  writeJsonFile(configPath, config);
  fs.writeFileSync(envTemplatePath, buildAdminEnvTemplate(config), "utf8");

  return {
    store: config,
    registryEntry,
    envTemplatePath: config.bootstrap?.envTemplatePath ?? `stores/${slug}/admin.env.example`
  };
}

export function updateStoreConfig(slug: string, updater: (current: StoreConfig) => StoreConfig): StoreConfig {
  const current = requireStoreConfig(slug);
  const next = normalizeStoreConfig(updater(current));
  writeJsonFile(getStoreConfigPath(slug), next);
  upsertStoreRegistryEntry(next);
  return next;
}

function shouldRefreshDerivedAddress(
  currentValue: string | null | undefined,
  previousDomain: string,
  localPart: string,
): boolean {
  if (!currentValue?.trim()) {
    return true;
  }

  return currentValue.trim().toLocaleLowerCase("tr") === `${localPart}@${previousDomain}`;
}

function writeAdminEnvTemplateForStore(config: StoreConfig): void {
  const envTemplatePath = path.join(getStoreDirectory(config.slug), "admin.env.example");
  fs.writeFileSync(envTemplatePath, buildAdminEnvTemplate(config), "utf8");
}

export function updateStoreDomains(slug: string, input: StoreDomainMigrationInput): StoreConfig {
  const storefrontDomain = ensureDomain(input.storefrontDomain);
  const adminDomain = ensureDomain(input.adminDomain?.trim() || resolveAdminDomain(storefrontDomain));
  const refreshDerivedBrandingEmails = input.refreshDerivedBrandingEmails !== false;

  const nextConfig = updateStoreConfig(slug, (current) => {
    const previousStorefrontDomain = current.domains.storefront;
    const supportEmail =
      refreshDerivedBrandingEmails &&
      shouldRefreshDerivedAddress(current.branding?.supportEmail, previousStorefrontDomain, "destek")
        ? `destek@${storefrontDomain}`
        : current.branding?.supportEmail;
    const senderEmail =
      refreshDerivedBrandingEmails &&
      shouldRefreshDerivedAddress(current.branding?.senderEmail, previousStorefrontDomain, "noreply")
        ? `noreply@${storefrontDomain}`
        : current.branding?.senderEmail;

    return {
      ...current,
      branding: {
        ...(current.branding ?? {}),
        supportEmail,
        senderEmail,
      },
      domains: {
        storefront: storefrontDomain,
        admin: adminDomain,
        demo: current.domains.demo,
      },
      bootstrap: current.bootstrap
        ? {
            ...current.bootstrap,
            adminDeploymentRuntimeUrl: `https://${adminDomain}`,
          }
        : current.bootstrap,
      storefront: current.storefront
        ? {
            ...current.storefront,
            runtimeUrl: `https://${storefrontDomain}`,
          }
        : current.storefront,
    };
  });

  writeAdminEnvTemplateForStore(nextConfig);
  upsertStoreAdminEnvLocal(nextConfig.slug, {
    NEXT_PUBLIC_STORE_DOMAIN: nextConfig.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: nextConfig.domains.admin,
    NEXT_PUBLIC_SITE_URL: `https://${nextConfig.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${nextConfig.domains.admin}`,
  });

  return nextConfig;
}

export function updateStoreSupabaseConfig(slug: string, input: StoreSupabaseUpdateInput): StoreConfig {
  const deploymentBranches = getStoreDeploymentBranches(slug);

  return updateStoreConfig(slug, (current) => ({
    ...current,
    databaseMode: "full_supabase",
    authProvider: "supabase",
    customerAuthProvider: "supabase",
    storageProvider: "supabase",
    supabaseStatus: input.provisioningStatus === "failed" ? "failed" : "configured",
    supabase: {
      ...current.supabase,
      projectRef: input.projectRef,
      url: input.url,
      provider: input.provider,
      dashboardUrl: input.dashboardUrl ?? current.supabase.dashboardUrl
    },
    bootstrap: {
      createdAt: current.bootstrap?.createdAt ?? new Date().toISOString(),
      envTemplatePath: current.bootstrap?.envTemplatePath ?? `stores/${slug}/admin.env.example`,
      adminEnvLocalPath: input.adminEnvLocalPath ?? current.bootstrap?.adminEnvLocalPath,
      authorityBranch: current.bootstrap?.authorityBranch ?? resolveDefaultAuthorityBranch(),
      coolifyProjectName: current.bootstrap?.coolifyProjectName ?? current.name,
      adminDeploymentProvider: current.bootstrap?.adminDeploymentProvider ?? "coolify",
      adminDeploymentName: current.bootstrap?.adminDeploymentName ?? `${slug}-admin`,
      adminDeploymentBranch:
        normalizeRepositoryBranch(current.bootstrap?.adminDeploymentBranch) ??
        deploymentBranches.adminBranch,
      adminDeploymentRuntimeUrl: current.bootstrap?.adminDeploymentRuntimeUrl ?? `https://${current.domains.admin}`,
      adminDeploymentResourceId: current.bootstrap?.adminDeploymentResourceId,
      adminDeploymentStatus: current.bootstrap?.adminDeploymentStatus ?? "pending-owner-env",
      adminDeploymentPreparedAt: current.bootstrap?.adminDeploymentPreparedAt,
      adminDeploymentDeployedAt: current.bootstrap?.adminDeploymentDeployedAt,
      adminDeploymentLastError: current.bootstrap?.adminDeploymentLastError,
      organizationSlug: input.organizationSlug ?? current.bootstrap?.organizationSlug,
      supabaseProvider: input.provider,
      supabaseProjectName: input.projectName ?? current.bootstrap?.supabaseProjectName,
      supabaseResourceId: input.resourceId ?? current.bootstrap?.supabaseResourceId,
      supabaseDashboardUrl: input.dashboardUrl ?? current.bootstrap?.supabaseDashboardUrl,
      provisionedAt: input.provisioningStatus === "configured" ? new Date().toISOString() : current.bootstrap?.provisionedAt,
      lastProvisionError: input.lastProvisionError,
      supabaseProvisioning: input.provisioningStatus,
      adminDeployment:
        current.bootstrap?.adminDeployment ?? buildAdminDeploymentDefaults(slug),
    }
  }));
}

export function updateStoreLightPostgresConfig(
  slug: string,
  input: StoreLightPostgresUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    databaseMode: "light_postgres",
    authProvider: "logto",
    customerAuthProvider: "logto",
    analyticsProvider: "umami",
    storageProvider: "r2",
    supabaseStatus: "none",
    lightPostgres: {
      cluster: input.cluster,
      databaseName: input.databaseName,
      schemaProfile: input.schemaProfile ?? "storefront_core",
      provisioning: input.provisioningStatus,
      provisionedAt:
        input.provisioningStatus === "configured"
          ? new Date().toISOString()
          : current.lightPostgres?.provisionedAt,
      lastProvisionError: input.lastProvisionError,
      umamiReady: input.umamiReady ?? current.lightPostgres?.umamiReady ?? true,
      roleName: input.roleName ?? current.lightPostgres?.roleName,
      roleStatus: input.roleStatus ?? current.lightPostgres?.roleStatus ?? "pending-owner-env",
      schemaStatus:
        input.schemaStatus ??
        (input.provisioningStatus === "configured"
          ? "ready"
          : input.provisioningStatus === "failed"
          ? "failed"
          : current.lightPostgres?.schemaStatus ?? "pending"),
      seedStatus:
        input.seedStatus ??
        (input.provisioningStatus === "configured"
          ? "ready"
          : input.provisioningStatus === "failed"
          ? "failed"
          : current.lightPostgres?.seedStatus ?? "pending"),
      readinessStatus:
        input.readinessStatus ??
        (input.provisioningStatus === "configured"
          ? "ready"
          : input.provisioningStatus === "failed"
          ? "failed"
          : current.lightPostgres?.readinessStatus ?? "pending"),
      readinessCheckedAt: input.readinessCheckedAt ?? current.lightPostgres?.readinessCheckedAt,
      readinessRepairAction:
        input.readinessRepairAction === null
          ? undefined
          : input.readinessRepairAction ?? current.lightPostgres?.readinessRepairAction,
      missingTables: input.missingTables ?? current.lightPostgres?.missingTables ?? [],
      missingSeedKeys: input.missingSeedKeys ?? current.lightPostgres?.missingSeedKeys ?? [],
      missingOptionalModules:
        input.missingOptionalModules ?? current.lightPostgres?.missingOptionalModules ?? [],
      missingPaymentGatewayKeys:
        input.missingPaymentGatewayKeys ?? current.lightPostgres?.missingPaymentGatewayKeys ?? [],
      missingAuthBridgeTables:
        input.missingAuthBridgeTables ?? current.lightPostgres?.missingAuthBridgeTables ?? [],
      lastReadinessError:
        input.lastReadinessError === null
          ? undefined
          : input.lastReadinessError ?? current.lightPostgres?.lastReadinessError,
    },
    bootstrap: {
      ...(current.bootstrap ?? {
        createdAt: new Date().toISOString(),
        envTemplatePath: `stores/${slug}/admin.env.example`,
        supabaseProvisioning: "configured" as StoreProvisioningStatus,
      }),
      authorityBranch: current.bootstrap?.authorityBranch ?? resolveDefaultAuthorityBranch(),
      adminDeployment:
        current.bootstrap?.adminDeployment ?? buildAdminDeploymentDefaults(slug),
      lastProvisionError: input.lastProvisionError,
      supabaseProvisioning: "configured",
    },
    readiness: {
      ...(current.readiness ?? buildDefaultStoreReadinessConfig()),
      database: input.provisioningStatus === "configured" ? "ready" : input.provisioningStatus === "failed" ? "failed" : "pending",
      databaseSchema:
        input.schemaStatus === "ready"
          ? "ready"
          : input.schemaStatus === "failed" || input.provisioningStatus === "failed"
          ? "failed"
          : current.readiness?.databaseSchema ?? "pending",
      databaseSeed:
        input.seedStatus === "ready"
          ? "ready"
          : input.seedStatus === "failed" || input.provisioningStatus === "failed"
          ? "failed"
          : current.readiness?.databaseSeed ?? "pending",
      databaseSmoke:
        input.readinessStatus === "ready"
          ? "ready"
          : input.readinessStatus === "failed" || input.provisioningStatus === "failed"
          ? "failed"
          : current.readiness?.databaseSmoke ?? "pending",
    },
  }));
}

export function updateStoreLogtoConfig(
  slug: string,
  input: StoreLogtoUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => {
    const defaults = buildStoreLogtoConfig({
      databaseMode: current.databaseMode,
      slug: current.slug,
      storefrontDomain: current.domains.storefront,
      adminDomain: current.domains.admin,
    });
    const nextLogto = {
      ...defaults,
      ...(current.logto ?? {}),
      adminAppStatus: input.adminAppStatus ?? current.logto?.adminAppStatus ?? defaults.adminAppStatus,
      customerAppStatus:
        input.customerAppStatus ?? current.logto?.customerAppStatus ?? defaults.customerAppStatus,
      adminAppId:
        input.adminAppId === null ? null : input.adminAppId ?? current.logto?.adminAppId ?? null,
      adminClientId:
        input.adminClientId === null ? null : input.adminClientId ?? current.logto?.adminClientId ?? null,
      customerAppId:
        input.customerAppId === null ? null : input.customerAppId ?? current.logto?.customerAppId ?? null,
      customerClientId:
        input.customerClientId === null
          ? null
          : input.customerClientId ?? current.logto?.customerClientId ?? null,
      adminIssuer: input.adminIssuer ?? current.logto?.adminIssuer ?? defaults.adminIssuer,
      customerIssuer: input.customerIssuer ?? current.logto?.customerIssuer ?? defaults.customerIssuer,
      adminRedirectUris:
        input.adminRedirectUris ?? current.logto?.adminRedirectUris ?? defaults.adminRedirectUris,
      adminPostLogoutRedirectUris:
        input.adminPostLogoutRedirectUris ??
        current.logto?.adminPostLogoutRedirectUris ??
        defaults.adminPostLogoutRedirectUris,
      adminOrigins: input.adminOrigins ?? current.logto?.adminOrigins ?? defaults.adminOrigins,
      customerRedirectUris:
        input.customerRedirectUris ?? current.logto?.customerRedirectUris ?? defaults.customerRedirectUris,
      customerPostLogoutRedirectUris:
        input.customerPostLogoutRedirectUris ??
        current.logto?.customerPostLogoutRedirectUris ??
        defaults.customerPostLogoutRedirectUris,
      customerOrigins:
        input.customerOrigins ?? current.logto?.customerOrigins ?? defaults.customerOrigins,
      googleSignIn: input.googleSignIn ?? current.logto?.googleSignIn ?? defaults.googleSignIn,
      emailRecovery: input.emailRecovery ?? current.logto?.emailRecovery ?? defaults.emailRecovery,
      adminBootstrapConfigPath:
        input.adminBootstrapConfigPath ??
        current.logto?.adminBootstrapConfigPath ??
        defaults.adminBootstrapConfigPath,
      customerBootstrapConfigPath:
        input.customerBootstrapConfigPath ??
        current.logto?.customerBootstrapConfigPath ??
        defaults.customerBootstrapConfigPath,
      bootstrapApplyState:
        input.bootstrapApplyState ?? current.logto?.bootstrapApplyState ?? defaults.bootstrapApplyState,
      lastProvisionError:
        input.lastProvisionError === null
          ? undefined
          : input.lastProvisionError ?? current.logto?.lastProvisionError,
    } satisfies NonNullable<StoreConfig["logto"]>;
    const authStatus =
      input.authStatus ??
      (nextLogto.adminAppStatus === "configured" && nextLogto.customerAppStatus === "configured"
        ? "configured"
        : current.auth?.status ?? "pending_auth_setup");

    return {
      ...current,
      authProvider: "logto",
      customerAuthProvider: "logto",
      logto: nextLogto,
      auth: {
        ...(current.auth ?? buildDefaultStoreAuthConfig(current.databaseMode)),
        provider: "logto",
        status: authStatus,
        mode: "logto_ready_placeholder",
        requiredAction:
          authStatus === "configured"
            ? "logto_admin_and_customer_apps_configured"
            : "configure_admin_and_customer_auth",
        blocking: false,
      },
      readiness: {
        ...(current.readiness ?? buildDefaultStoreReadinessConfig()),
        auth: authStatus === "configured" ? "ready" : "pending",
      },
    };
  });
}

export function updateStoreUmamiConfig(
  slug: string,
  input: StoreUmamiUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => {
    const defaults = buildStoreUmamiConfig({
      databaseMode: current.databaseMode,
      slug: current.slug,
      storeName: current.name,
      storefrontDomain: current.domains.storefront,
    });
    const nextUmami = {
      ...defaults,
      ...(current.umami ?? {}),
      websiteStatus: input.websiteStatus ?? current.umami?.websiteStatus ?? defaults.websiteStatus,
      websiteId:
        input.websiteId === null ? null : input.websiteId ?? current.umami?.websiteId ?? null,
      websiteName: input.websiteName ?? current.umami?.websiteName ?? defaults.websiteName,
      domain: input.domain ?? current.umami?.domain ?? defaults.domain,
      canonicalDomain:
        input.canonicalDomain ?? current.umami?.canonicalDomain ?? defaults.canonicalDomain,
      host: input.host ?? current.umami?.host ?? defaults.host,
      apiUrl: input.apiUrl ?? current.umami?.apiUrl ?? defaults.apiUrl,
      scriptUrl: input.scriptUrl ?? current.umami?.scriptUrl ?? defaults.scriptUrl,
      timezone: input.timezone ?? current.umami?.timezone ?? defaults.timezone,
      storefrontTrackingStatus:
        input.storefrontTrackingStatus ??
        current.umami?.storefrontTrackingStatus ??
        defaults.storefrontTrackingStatus,
      adminAnalyticsStatus:
        input.adminAnalyticsStatus ??
        current.umami?.adminAnalyticsStatus ??
        defaults.adminAnalyticsStatus,
      serverTokenStatus:
        input.serverTokenStatus ?? current.umami?.serverTokenStatus ?? defaults.serverTokenStatus,
      adminSummaryEndpoint:
        input.adminSummaryEndpoint ??
        current.umami?.adminSummaryEndpoint ??
        defaults.adminSummaryEndpoint,
      metrics: input.metrics ?? current.umami?.metrics ?? defaults.metrics,
      bootstrapConfigPath:
        input.bootstrapConfigPath ??
        current.umami?.bootstrapConfigPath ??
        defaults.bootstrapConfigPath,
      bootstrapApplyState:
        input.bootstrapApplyState ?? current.umami?.bootstrapApplyState ?? defaults.bootstrapApplyState,
      lastProvisionError:
        input.lastProvisionError === null
          ? undefined
          : input.lastProvisionError ?? current.umami?.lastProvisionError,
    } satisfies NonNullable<StoreConfig["umami"]>;
    const analyticsStatus =
      input.analyticsStatus ??
      (nextUmami.websiteStatus === "configured" ? "configured" : current.analytics?.status ?? "pending_analytics_setup");

    return {
      ...current,
      analyticsProvider: "umami",
      umami: nextUmami,
      analytics: {
        ...(current.analytics ?? buildDefaultStoreAnalyticsConfig()),
        provider: "umami",
        status: analyticsStatus,
        mode: "umami_ready_placeholder",
        websiteId: nextUmami.websiteId ?? undefined,
        requiredAction:
          analyticsStatus === "configured"
            ? "umami_website_and_tracking_configured"
            : "configure_umami_website",
        blocking: false,
      },
      lightPostgres: current.lightPostgres
        ? {
            ...current.lightPostgres,
            umamiReady: true,
          }
        : current.lightPostgres,
      readiness: {
        ...(current.readiness ?? buildDefaultStoreReadinessConfig()),
        analytics: analyticsStatus === "configured" ? "ready" : "pending",
      },
    };
  });
}

export function updateStoreAdminDeploymentConfig(slug: string, input: StoreAdminDeploymentUpdateInput): StoreConfig {
  const deploymentBranches = getStoreDeploymentBranches(slug);

  return updateStoreConfig(slug, (current) => ({
    ...current,
    bootstrap: {
      createdAt: current.bootstrap?.createdAt ?? new Date().toISOString(),
      envTemplatePath: current.bootstrap?.envTemplatePath ?? `stores/${slug}/admin.env.example`,
      adminEnvLocalPath: current.bootstrap?.adminEnvLocalPath,
      authorityBranch: current.bootstrap?.authorityBranch ?? resolveDefaultAuthorityBranch(),
      coolifyProjectName: current.bootstrap?.coolifyProjectName ?? current.name,
      adminDeploymentProvider: current.bootstrap?.adminDeploymentProvider ?? "coolify",
      adminDeploymentName: input.deploymentName ?? current.bootstrap?.adminDeploymentName ?? `${slug}-admin`,
      adminDeploymentBranch:
        normalizeRepositoryBranch(current.bootstrap?.adminDeploymentBranch) ??
        deploymentBranches.adminBranch,
      adminDeploymentRuntimeUrl: input.runtimeUrl ?? current.bootstrap?.adminDeploymentRuntimeUrl ?? `https://${current.domains.admin}`,
      adminDeploymentResourceId: input.resourceId ?? current.bootstrap?.adminDeploymentResourceId,
      adminDeploymentStatus: input.deploymentStatus,
      adminDeploymentPreparedAt:
        input.deploymentStatus === "prepared" || input.deploymentStatus === "configured"
          ? new Date().toISOString()
          : current.bootstrap?.adminDeploymentPreparedAt,
      adminDeploymentDeployedAt: input.deployedAt ?? current.bootstrap?.adminDeploymentDeployedAt,
      adminDeploymentLastError: input.lastError,
      organizationSlug: current.bootstrap?.organizationSlug,
      supabaseProvider: current.bootstrap?.supabaseProvider ?? current.supabase.provider,
      supabaseProjectName: current.bootstrap?.supabaseProjectName,
      supabaseResourceId: current.bootstrap?.supabaseResourceId,
      supabaseDashboardUrl: current.bootstrap?.supabaseDashboardUrl,
      provisionedAt: current.bootstrap?.provisionedAt,
      lastProvisionError: current.bootstrap?.lastProvisionError,
      supabaseProvisioning: current.bootstrap?.supabaseProvisioning ?? "pending-owner-env",
      adminDeployment:
        current.bootstrap?.adminDeployment ?? buildAdminDeploymentDefaults(slug),
    }
  }));
}

export function writeStoreAdminEnvLocal(slug: string, contents: string): string {
  const envLocalPath = path.join(getStoreDirectory(slug), "admin.env.local");
  fs.writeFileSync(envLocalPath, contents, "utf8");
  return envLocalPath;
}

export function upsertStoreAdminEnvLocal(slug: string, entries: Record<string, string>): string {
  const envLocalPath = path.join(getStoreDirectory(slug), "admin.env.local");
  const existing = fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter(Boolean);
  const envMap = new Map<string, string>();

  for (const line of lines) {
    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    envMap.set(key, value);
  }

  for (const [key, value] of Object.entries(entries)) {
    envMap.set(key, value);
  }

  if (!envMap.has("NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL")) {
    envMap.set(
      "NEXT_PUBLIC_IMAGE_TRANSFORMATION_URL",
      getConfiguredImageTransformationUrl(),
    );
  }

  if (envMap.has("CLOUDFLARE_ACCOUNT_ID")) {
    envMap.delete("R2_ACCOUNT_ID");
  }

  const serialized = `${Array.from(envMap.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;

  fs.writeFileSync(envLocalPath, serialized, "utf8");
  return envLocalPath;
}

export function updateStoreR2Config(slug: string, input: StoreR2UpdateInput): StoreConfig {
  return updateStoreConfig(slug, (current) => {
    const defaults = buildStoreR2Config({
      databaseMode: current.databaseMode,
      slug: current.slug,
    });
    const prefix = input.prefix ?? current.r2?.prefix ?? defaults.prefix;
    const publicUrl = input.publicUrl;
    const nextR2 = {
      ...defaults,
      ...(current.r2 ?? {}),
      status: input.provisioningStatus === "configured" ? "configured" : "failed",
      bucketName: input.bucketName,
      publicUrl,
      managedDomain: input.managedDomain ?? current.r2?.managedDomain ?? defaults.managedDomain,
      endpoint: input.endpoint ?? current.r2?.endpoint ?? defaults.endpoint,
      region: input.region ?? current.r2?.region ?? defaults.region,
      prefix,
      uploadPrefix: input.uploadPrefix ?? current.r2?.uploadPrefix ?? `${prefix}uploads/`,
      productImagesPrefix:
        input.productImagesPrefix ?? current.r2?.productImagesPrefix ?? `${prefix}products/`,
      pageImagesPrefix: input.pageImagesPrefix ?? current.r2?.pageImagesPrefix ?? `${prefix}pages/`,
      brandingPrefix: input.brandingPrefix ?? current.r2?.brandingPrefix ?? `${prefix}branding/`,
      publicUrlTemplate:
        input.publicUrlTemplate ??
        current.r2?.publicUrlTemplate ??
        `${publicUrl.replace(/\/+$/, "")}/{key}`,
      adminUploadStatus:
        input.adminUploadStatus ??
        current.r2?.adminUploadStatus ??
        (input.provisioningStatus === "configured" ? "configured" : "failed"),
      storefrontReadStatus:
        input.storefrontReadStatus ??
        current.r2?.storefrontReadStatus ??
        (input.provisioningStatus === "configured" ? "configured" : "failed"),
      credentialsStatus:
        input.credentialsStatus ??
        current.r2?.credentialsStatus ??
        (input.provisioningStatus === "configured" ? "configured" : "pending-owner-env"),
      bootstrapConfigPath:
        input.bootstrapConfigPath ?? current.r2?.bootstrapConfigPath ?? defaults.bootstrapConfigPath,
      bootstrapApplyState:
        input.bootstrapApplyState ??
        current.r2?.bootstrapApplyState ??
        (input.provisioningStatus === "configured" ? "applied" : "failed"),
      noSupabaseStorage: input.noSupabaseStorage ?? current.r2?.noSupabaseStorage ?? true,
      provisionedAt:
        input.provisioningStatus === "configured" ? new Date().toISOString() : current.r2?.provisionedAt,
      lastProvisionError: input.lastProvisionError,
      provisioning: input.provisioningStatus,
    } satisfies StoreR2Config;

    return {
      ...current,
      storageProvider: "r2",
      r2: nextR2,
      media: buildStoreMediaConfig({
        databaseMode: current.databaseMode,
        slug: current.slug,
        r2: nextR2,
      }),
      readiness: {
        ...(current.readiness ?? buildDefaultStoreReadinessConfig()),
        storage: input.provisioningStatus === "configured" ? "ready" : "failed",
      },
    };
  });
}

export function updateStoreR2MediaConfig(
  slug: string,
  input: StoreR2MediaUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => {
    const defaults = buildStoreR2Config({
      databaseMode: current.databaseMode,
      slug: current.slug,
    });
    const prefix = input.prefix ?? current.r2?.prefix ?? defaults.prefix;
    const publicUrl = input.publicUrl === null ? null : input.publicUrl ?? current.r2?.publicUrl ?? null;
    const nextR2 = {
      ...defaults,
      ...(current.r2 ?? {}),
      status: input.status ?? current.r2?.status ?? defaults.status,
      bucketName:
        input.bucketName === null ? null : input.bucketName ?? current.r2?.bucketName ?? null,
      publicUrl,
      managedDomain:
        input.managedDomain === null ? null : input.managedDomain ?? current.r2?.managedDomain ?? null,
      endpoint: input.endpoint === null ? null : input.endpoint ?? current.r2?.endpoint ?? null,
      region: input.region ?? current.r2?.region ?? defaults.region,
      prefix,
      uploadPrefix: input.uploadPrefix ?? current.r2?.uploadPrefix ?? `${prefix}uploads/`,
      productImagesPrefix:
        input.productImagesPrefix ?? current.r2?.productImagesPrefix ?? `${prefix}products/`,
      pageImagesPrefix: input.pageImagesPrefix ?? current.r2?.pageImagesPrefix ?? `${prefix}pages/`,
      brandingPrefix: input.brandingPrefix ?? current.r2?.brandingPrefix ?? `${prefix}branding/`,
      publicUrlTemplate:
        input.publicUrlTemplate === null
          ? null
          : input.publicUrlTemplate ??
            current.r2?.publicUrlTemplate ??
            (publicUrl ? `${publicUrl.replace(/\/+$/, "")}/{key}` : null),
      adminUploadStatus:
        input.adminUploadStatus ?? current.r2?.adminUploadStatus ?? defaults.adminUploadStatus,
      storefrontReadStatus:
        input.storefrontReadStatus ??
        current.r2?.storefrontReadStatus ??
        defaults.storefrontReadStatus,
      credentialsStatus:
        input.credentialsStatus ?? current.r2?.credentialsStatus ?? defaults.credentialsStatus,
      bootstrapConfigPath:
        input.bootstrapConfigPath ?? current.r2?.bootstrapConfigPath ?? defaults.bootstrapConfigPath,
      bootstrapApplyState:
        input.bootstrapApplyState ?? current.r2?.bootstrapApplyState ?? defaults.bootstrapApplyState,
      noSupabaseStorage: input.noSupabaseStorage ?? current.r2?.noSupabaseStorage ?? true,
      provisioning: input.provisioningStatus ?? current.r2?.provisioning ?? defaults.provisioning,
      provisionedAt: current.r2?.provisionedAt,
      lastProvisionError:
        input.lastProvisionError === null
          ? undefined
          : input.lastProvisionError ?? current.r2?.lastProvisionError,
    } satisfies StoreR2Config;

    return {
      ...current,
      storageProvider: "r2",
      r2: nextR2,
      media: buildStoreMediaConfig({
        databaseMode: current.databaseMode,
        slug: current.slug,
        r2: nextR2,
      }),
      readiness: {
        ...(current.readiness ?? buildDefaultStoreReadinessConfig()),
        storage: nextR2.status === "configured" ? "ready" : nextR2.status === "failed" ? "failed" : "pending",
      },
    };
  });
}

export function applyStorefrontAuthorityPatchToConfig(
  slug: string,
  patch: StorefrontAuthorityPatchInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    storefront: mergeStorefrontConfig(current, patch),
  }));
}

export function updateStoreStorefrontConfig(slug: string, input: StorefrontUpdateInput): StoreConfig {
  return applyStorefrontAuthorityPatchToConfig(slug, {
    appDir: input.appDir,
    status: input.status,
    lastScaffoldError: input.lastScaffoldError,
  });
}

export function updateStoreStorefrontDeploymentConfig(
  slug: string,
  input: StorefrontDeploymentUpdateInput,
): StoreConfig {
  return applyStorefrontAuthorityPatchToConfig(slug, {
    deploymentStatus: input.deploymentStatus,
    deploymentName: input.deploymentName,
    runtimeUrl: input.runtimeUrl,
    resourceId: input.resourceId,
    preparedAt: input.preparedAt,
    deployedAt: input.deployedAt,
    lastDeploymentError: input.lastError,
  });
}

export function updateStoreStorefrontRepoSyncConfig(
  slug: string,
  input: StorefrontRepoSyncUpdateInput,
): StoreConfig {
  return applyStorefrontAuthorityPatchToConfig(slug, {
    repoSyncStatus: input.syncStatus,
    repoCommitSha: input.commitSha,
    repoSyncedAt: input.syncedAt,
    lastRepoSyncError: input.lastError,
  });
}
