import fs from "node:fs";
import path from "node:path";
import { getConfiguredImageTransformationUrl } from "./image-transformation";
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
export type StoreProvisioningStatus = "pending-owner-env" | "configured" | "failed";
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
  };
  lightPostgres?: StoreLightPostgresConfig;
  supabase: {
    projectRef: string;
    url: string;
    provider: SupabaseProvider;
    storage: string;
    dashboardUrl?: string;
  };
  r2?: {
    bucketName?: string;
    publicUrl?: string;
    managedDomain?: string;
    provisionedAt?: string;
    lastProvisionError?: string;
    provisioning?: "pending-owner-env" | "configured" | "failed";
  };
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
}

export interface StoreR2UpdateInput {
  bucketName: string;
  publicUrl: string;
  provisioningStatus: "configured" | "failed";
  managedDomain?: string;
  lastProvisionError?: string;
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

  return {
    name: input.name,
    slug: input.slug,
    status: "draft",
    databaseMode,
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
      notes: "Merkezi owner panel uzerinden olusturuldu."
    },
    lightPostgres: {
      cluster: resolveLightPostgresCluster(),
      databaseName: input.slug,
      schemaProfile: "storefront_core",
      provisioning: databaseMode === "light_postgres" ? "pending-owner-env" : "configured",
      umamiReady: true,
    },
    supabase: {
      projectRef: "pending-owner-bootstrap",
      url: "configure-in-env",
      provider: defaultSupabaseProvider,
      storage:
        databaseMode === "full_supabase"
          ? "separate-project-per-store"
          : "disabled-by-database-mode",
    },
    r2: {
      provisioning: "pending-owner-env"
    },
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
          "LIGHT_POSTGRES_DATABASE_SSLMODE=require",
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
  } satisfies NonNullable<StoreConfig["lightPostgres"]>;
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
    domains: normalizedDomains,
    lightPostgres: normalizedLightPostgres,
    supabase: {
      ...config.supabase,
      provider: supabaseProvider,
      storage:
        databaseMode === "full_supabase"
          ? config.supabase.storage || "separate-project-per-store"
          : "disabled-by-database-mode",
    },
    r2: {
      ...config.r2,
      provisioning: inferR2ProvisioningStatus(config),
    },
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
  }));
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
  return updateStoreConfig(slug, (current) => ({
    ...current,
    r2: {
      bucketName: input.bucketName,
      publicUrl: input.publicUrl,
      managedDomain: input.managedDomain ?? current.r2?.managedDomain,
      provisionedAt: input.provisioningStatus === "configured" ? new Date().toISOString() : current.r2?.provisionedAt,
      lastProvisionError: input.lastProvisionError,
      provisioning: input.provisioningStatus
    }
  }));
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
