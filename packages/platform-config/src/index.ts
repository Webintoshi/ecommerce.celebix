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

export interface StoreRegistryEntry {
  slug: string;
  name: string;
  domain: string;
  theme: string;
  status: "draft" | "active" | "paused";
}

export type SupabaseProvider = "managed" | "self_hosted_coolify";
export type StorefrontStatus = "not_started" | "scaffolded" | "active";
export type StorefrontDeploymentStatus =
  | "pending-owner-env"
  | "pending-repo-sync"
  | "prepared"
  | "configured"
  | "failed";

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

export interface StorefrontConfig {
  appDir?: string;
  status: StorefrontStatus;
  lastScaffoldedAt?: string;
  lastScaffoldError?: string;
  repoSyncStatus?: "pending" | "synced" | "failed";
  repoSyncedAt?: string;
  repoCommitSha?: string;
  lastRepoSyncError?: string;
  deploymentProvider?: "coolify";
  deploymentName?: string;
  runtimeUrl?: string;
  resourceId?: string;
  deploymentStatus?: StorefrontDeploymentStatus;
  preparedAt?: string;
  deployedAt?: string;
  lastDeploymentError?: string;
}

export interface StoreConfig {
  name: string;
  slug: string;
  status: "draft" | "active" | "paused";
  theme: StoreThemeConfig;
  branding?: StoreBrandingConfig;
  domains: {
    storefront: string;
    admin: string;
  };
  owner: {
    createdBy: string;
    notes: string;
  };
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
    coolifyProjectName?: string;
    adminDeploymentProvider?: "coolify";
    adminDeploymentName?: string;
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
    supabaseProvisioning: "pending-owner-env" | "configured" | "failed";
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
}

export interface CreateStoreResult {
  store: StoreConfig;
  registryEntry: StoreRegistryEntry;
  envTemplatePath: string;
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
  syncStatus: "pending" | "synced" | "failed";
  commitSha?: string;
  syncedAt?: string;
  lastError?: string;
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    return "managed";
  }

  return process.env.COOLIFY_API_URL?.trim() ? "self_hosted_coolify" : "managed";
}

function ensureSlug(slug: string): string {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Slug sadece kucuk harf, rakam ve tire icermelidir.");
  }

  return slug;
}

function ensureDomain(domain: string): string {
  const normalizedDomain = domain.trim().toLocaleLowerCase("tr");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) {
    throw new Error("Gecerli bir domain girilmelidir.");
  }

  return normalizedDomain;
}

function buildStoreConfig(input: Required<CreateStoreInput>): StoreConfig {
  const defaultSupabaseProvider = resolveDefaultSupabaseProvider();
  const coolifyProjectName = input.coolifyProjectName || input.name;
  const adminDeploymentName = input.adminDeploymentName || `${input.name} admin`;
  const storefrontDeploymentName = input.storefrontDeploymentName || `${input.name} websitesi`;

  return {
    name: input.name,
    slug: input.slug,
    status: "draft",
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
      admin: `admin.${input.domain}`
    },
    owner: {
      createdBy: "owner-panel",
      notes: "Merkezi owner panel uzerinden olusturuldu."
    },
    supabase: {
      projectRef: "pending-owner-bootstrap",
      url: "configure-in-env",
      provider: defaultSupabaseProvider,
      storage: "separate-project-per-store"
    },
    r2: {
      provisioning: "pending-owner-env"
    },
    bootstrap: {
      createdAt: new Date().toISOString(),
      envTemplatePath: `stores/${input.slug}/admin.env.example`,
      coolifyProjectName,
      adminDeploymentProvider: "coolify",
      adminDeploymentName,
      adminDeploymentRuntimeUrl: `https://admin.${input.domain}`,
      adminDeploymentResourceId: undefined,
      adminDeploymentStatus: "pending-owner-env",
      supabaseProvider: defaultSupabaseProvider,
      supabaseProvisioning: "pending-owner-env"
    },
    storefront: {
      status: "not_started",
      repoSyncStatus: "pending",
      deploymentProvider: "coolify",
      deploymentName: storefrontDeploymentName,
      runtimeUrl: `https://${input.domain}`,
      deploymentStatus: "pending-owner-env"
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

function buildAdminEnvTemplate(config: StoreConfig): string {
  const supabaseUrlLine =
    config.supabase.provider === "self_hosted_coolify"
      ? "NEXT_PUBLIC_SUPABASE_URL=https://supabasekong-your-store-slug.127.0.0.1.sslip.io"
      : "NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co";

  return [
    `STORE_SLUG=${config.slug}`,
    `CELEBIX_NEXT_BUILD_CPUS=${resolveProvisionedNextBuildCpuCap(2, ["CELEBIX_ADMIN_BUILD_CPUS"])}`,
    "",
    "# Admin deployment blueprint",
    `# APP_NAME=${config.bootstrap?.adminDeploymentName ?? `${config.slug}-admin`}`,
    `# COOLIFY_PROJECT_NAME=${config.bootstrap?.coolifyProjectName ?? config.name}`,
    `# APP_RUNTIME_URL=https://${config.domains.admin}`,
    "# INSTALL_COMMAND=npm ci --include=optional --no-audit --no-fund",
    "# BUILD_COMMAND=npm run build --workspace @celebix/admin",
    "# START_COMMAND=npm run start --workspace @celebix/admin",
    "",
    supabaseUrlLine,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key",
    "# Opsiyonel migration fallback",
    "# SUPABASE_LEGACY_URL=https://your-old-project.supabase.co",
    "# SUPABASE_LEGACY_ANON_KEY=your-old-anon-key",
    "",
    `NEXT_PUBLIC_STORE_DOMAIN=${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_DOMAIN=${config.domains.admin}`,
    `NEXT_PUBLIC_SITE_URL=https://${config.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_URL=https://${config.domains.admin}`,
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

function normalizeStoreConfig(config: StoreConfig): StoreConfig {
  return {
    ...config,
    supabase: {
      ...config.supabase,
      provider: config.supabase.provider ?? "managed",
    },
    bootstrap: config.bootstrap
      ? {
          ...config.bootstrap,
          coolifyProjectName: config.bootstrap.coolifyProjectName ?? config.name,
          adminDeploymentProvider: config.bootstrap.adminDeploymentProvider ?? "coolify",
          adminDeploymentName: config.bootstrap.adminDeploymentName ?? `${config.slug}-admin`,
          adminDeploymentRuntimeUrl: config.bootstrap.adminDeploymentRuntimeUrl ?? `https://${config.domains.admin}`,
          adminDeploymentResourceId: config.bootstrap.adminDeploymentResourceId,
          adminDeploymentStatus: config.bootstrap.adminDeploymentStatus ?? "pending-owner-env",
          supabaseProvider: config.bootstrap.supabaseProvider ?? config.supabase.provider ?? "managed",
          adminDeploymentDeployedAt: config.bootstrap.adminDeploymentDeployedAt,
        }
      : config.bootstrap,
    storefront: config.storefront
      ? {
          ...config.storefront,
          repoSyncStatus: config.storefront.repoSyncStatus ?? "pending",
          deploymentProvider: config.storefront.deploymentProvider ?? "coolify",
          deploymentName: config.storefront.deploymentName ?? `${config.slug}-storefront`,
          runtimeUrl: config.storefront.runtimeUrl ?? `https://${config.domains.storefront}`,
          deploymentStatus: config.storefront.deploymentStatus ?? "pending-owner-env",
        }
      : config.storefront,
  };
}

function getStoreDirectory(slug: string): string {
  return path.join(getRepoRoot(), "stores", slug);
}

function getStoreConfigPath(slug: string): string {
  return path.join(getStoreDirectory(slug), "store.config.json");
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
  return next;
}

export function updateStoreSupabaseConfig(slug: string, input: StoreSupabaseUpdateInput): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
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
      coolifyProjectName: current.bootstrap?.coolifyProjectName ?? current.name,
      adminDeploymentProvider: current.bootstrap?.adminDeploymentProvider ?? "coolify",
      adminDeploymentName: current.bootstrap?.adminDeploymentName ?? `${slug}-admin`,
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
      supabaseProvisioning: input.provisioningStatus
    }
  }));
}

export function updateStoreAdminDeploymentConfig(slug: string, input: StoreAdminDeploymentUpdateInput): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    bootstrap: {
      createdAt: current.bootstrap?.createdAt ?? new Date().toISOString(),
      envTemplatePath: current.bootstrap?.envTemplatePath ?? `stores/${slug}/admin.env.example`,
      adminEnvLocalPath: current.bootstrap?.adminEnvLocalPath,
      coolifyProjectName: current.bootstrap?.coolifyProjectName ?? current.name,
      adminDeploymentProvider: current.bootstrap?.adminDeploymentProvider ?? "coolify",
      adminDeploymentName: input.deploymentName ?? current.bootstrap?.adminDeploymentName ?? `${slug}-admin`,
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
      supabaseProvisioning: current.bootstrap?.supabaseProvisioning ?? "pending-owner-env"
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

export function updateStoreStorefrontConfig(slug: string, input: StorefrontUpdateInput): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    storefront: {
      appDir: input.appDir,
      status: input.status,
      lastScaffoldedAt: input.status === "scaffolded" || input.status === "active" ? new Date().toISOString() : current.storefront?.lastScaffoldedAt,
      lastScaffoldError: input.lastScaffoldError,
      repoSyncStatus: current.storefront?.repoSyncStatus ?? "pending",
      repoSyncedAt: current.storefront?.repoSyncedAt,
      repoCommitSha: current.storefront?.repoCommitSha,
      lastRepoSyncError: current.storefront?.lastRepoSyncError,
      deploymentProvider: current.storefront?.deploymentProvider ?? "coolify",
      deploymentName: current.storefront?.deploymentName ?? `${slug}-storefront`,
      runtimeUrl: current.storefront?.runtimeUrl ?? `https://${current.domains.storefront}`,
      resourceId: current.storefront?.resourceId,
      deploymentStatus: current.storefront?.deploymentStatus ?? "pending-owner-env",
      preparedAt: current.storefront?.preparedAt,
      deployedAt: current.storefront?.deployedAt,
      lastDeploymentError: current.storefront?.lastDeploymentError
    }
  }));
}

export function updateStoreStorefrontDeploymentConfig(
  slug: string,
  input: StorefrontDeploymentUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    storefront: {
      appDir: current.storefront?.appDir,
      status:
        input.deploymentStatus === "configured"
          ? "active"
          : current.storefront?.status ?? "not_started",
      lastScaffoldedAt: current.storefront?.lastScaffoldedAt,
      lastScaffoldError: current.storefront?.lastScaffoldError,
      repoSyncStatus: current.storefront?.repoSyncStatus ?? "pending",
      repoSyncedAt: current.storefront?.repoSyncedAt,
      repoCommitSha: current.storefront?.repoCommitSha,
      lastRepoSyncError: current.storefront?.lastRepoSyncError,
      deploymentProvider: current.storefront?.deploymentProvider ?? "coolify",
      deploymentName: input.deploymentName ?? current.storefront?.deploymentName ?? `${slug}-storefront`,
      runtimeUrl: input.runtimeUrl ?? current.storefront?.runtimeUrl ?? `https://${current.domains.storefront}`,
      resourceId: input.resourceId ?? current.storefront?.resourceId,
      deploymentStatus: input.deploymentStatus,
      preparedAt:
        input.preparedAt ??
        ((input.deploymentStatus === "prepared" || input.deploymentStatus === "configured")
          ? new Date().toISOString()
          : current.storefront?.preparedAt),
      deployedAt: input.deployedAt ?? current.storefront?.deployedAt,
      lastDeploymentError: input.lastError
    }
  }));
}

export function updateStoreStorefrontRepoSyncConfig(
  slug: string,
  input: StorefrontRepoSyncUpdateInput,
): StoreConfig {
  return updateStoreConfig(slug, (current) => ({
    ...current,
    storefront: {
      appDir: current.storefront?.appDir,
      status: current.storefront?.status ?? "not_started",
      lastScaffoldedAt: current.storefront?.lastScaffoldedAt,
      lastScaffoldError: current.storefront?.lastScaffoldError,
      repoSyncStatus: input.syncStatus,
      repoSyncedAt:
        input.syncedAt ??
        (input.syncStatus === "synced" ? new Date().toISOString() : current.storefront?.repoSyncedAt),
      repoCommitSha: input.commitSha ?? current.storefront?.repoCommitSha,
      lastRepoSyncError: input.lastError,
      deploymentProvider: current.storefront?.deploymentProvider ?? "coolify",
      deploymentName: current.storefront?.deploymentName ?? `${slug}-storefront`,
      runtimeUrl: current.storefront?.runtimeUrl ?? `https://${current.domains.storefront}`,
      resourceId: current.storefront?.resourceId,
      deploymentStatus: current.storefront?.deploymentStatus ?? "pending-owner-env",
      preparedAt: current.storefront?.preparedAt,
      deployedAt: current.storefront?.deployedAt,
      lastDeploymentError: current.storefront?.lastDeploymentError
    }
  }));
}
