import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { createClient } from "@supabase/supabase-js";
import {
  getRepoRoot,
  normalizeStoreSeoSettings,
  type StoreConfig,
  upsertStoreAdminEnvLocal,
  updateStoreSupabaseConfig,
} from "@celebix/platform-config";
import { createDefaultStorePaymentGateways } from "@celebix/payment-core";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { upsertStoreSupabaseSecret } from "@/lib/store-secrets";
import type { SupabaseBootstrapStatus, SupabaseOrganization, SupabaseProvisioningResult } from "@/lib/supabase-bootstrap.shared";

interface CoolifyProject {
  uuid?: string;
  name?: string;
}

interface CoolifyEnvironment {
  uuid?: string;
  name?: string;
}

interface CoolifyService {
  uuid?: string;
  service_uuid?: string;
  resource_uuid?: string;
  name?: string;
  domains?: string[];
}

interface CoolifyEnvironmentVariable {
  key?: string;
  name?: string;
  value?: string | null;
}

interface CoolifyServer {
  ip?: string | null;
}

interface OwnerStoreMetadataRow {
  id: string;
  metadata: Record<string, unknown> | null;
}

interface OwnerStoreBootstrapRow extends OwnerStoreMetadataRow {
  created_at: string;
}

interface PgMetaTarget {
  baseUrl: string | null;
  extraHeaders?: Record<string, string>;
  label: string;
}

interface SupabaseRuntimeConnection {
  publicKey: string;
  publicUrl: string;
  publicUrl8000: string | null;
  studioUrl: string | null;
  internalApiUrl: string | null;
  serviceKey: string;
  adminUser: string;
  adminPassword: string;
}

const COOLIFY_API_PREFIX = "/api/v1";
const ENV_POLL_DELAY_MS = 5000;
const ENV_POLL_ATTEMPTS = 24;
const PG_META_POLL_DELAY_MS = 5000;
const PG_META_POLL_ATTEMPTS = 24;
const DATA_API_POLL_DELAY_MS = 5000;
const DATA_API_POLL_ATTEMPTS = 24;
const COOLIFY_API_TIMEOUT_MS = 15000;
const SELF_HOSTED_PG_META_REF = "default";
const DISPOSABLE_STORE_RECREATE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CORE_BOOTSTRAP_SQL_FILES = [
  ["apps", "admin", "supabase", "schema.sql"],
  ["apps", "admin", "supabase", "migrations", "003_add_auth_integration.sql"],
  ["apps", "admin", "supabase", "migrations", "004_add_customer_addresses.sql"],
  ["apps", "admin", "supabase", "migrations", "005_add_customer_preferences.sql"],
  ["apps", "admin", "supabase", "migrations", "008_product_wizard_schema.sql"],
  ["apps", "admin", "supabase", "migrations", "20260209_admin_roles.sql"],
  ["apps", "admin", "supabase", "migrations", "20260219000000_seo_hub.sql"],
  ["apps", "admin", "supabase", "migrations", "020_create_pages_table.sql"],
  ["apps", "admin", "supabase", "migrations", "021_create_cart_system.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402000000_analytics_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402010000_abandoned_cart_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260224000000_product_customization.sql"],
  ["apps", "admin", "supabase", "migrations", "025_create_accounting_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260314000100_product_tag_suggestions.sql"],
  ["apps", "admin", "supabase", "migrations", "20260314001000_marketplace_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "20260315002000_lucky_wheel_production.sql"],
  ["apps", "admin", "supabase", "migrations", "20260328000000_payment_runtime.sql"],
  ["apps", "admin", "supabase", "migrations", "006_add_product_columns.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402020000_default_product_tax_rate_zero.sql"],
  ["apps", "admin", "supabase", "migrations", "20260402183000_products_subcategory_compat.sql"],
] as const;
const ADDITIVE_BOOTSTRAP_SQL_FILES = [
  ["apps", "admin", "supabase", "migrations", "20260331000000_customer_import_fields.sql"],
  ["apps", "admin", "supabase", "migrations", "20260331001000_shopify_product_import_fields.sql"],
  ["apps", "admin", "supabase", "migrations", "20260405010000_product_reviews.sql"],
  ["apps", "admin", "supabase", "migrations", "20260405120000_translation_cache.sql"],
  ["apps", "admin", "supabase", "migrations", "20260407013000_google_merchant_marketplace_provider.sql"],
] as const;

function getCoolifyApiUrl(): string {
  const raw = process.env.COOLIFY_API_URL?.trim();

  if (!raw) {
    throw new Error("COOLIFY_API_URL tanimli degil.");
  }

  return raw.replace(/\/+$/, "");
}

function getCoolifyApiToken(): string {
  const token = process.env.COOLIFY_API_TOKEN?.trim();

  if (!token) {
    throw new Error("COOLIFY_API_TOKEN tanimli degil.");
  }

  return token;
}

function getDefaultCoolifyProjectName(): string {
  return process.env.COOLIFY_PROJECT_NAME?.trim() || "CELEBIX E-COMMERCE YONETIM";
}

function getCoolifyProjectName(store?: StoreConfig): string {
  return store?.bootstrap?.coolifyProjectName?.trim() || getDefaultCoolifyProjectName();
}

function getCoolifyEnvironmentName(): string {
  return process.env.COOLIFY_ENVIRONMENT_NAME?.trim() || "production";
}

function getCoolifyServerUuid(): string {
  const value = process.env.COOLIFY_SERVER_UUID?.trim();

  if (!value) {
    throw new Error("COOLIFY_SERVER_UUID tanimli degil.");
  }

  return value;
}

function getCoolifyDestinationUuid(): string {
  const value = process.env.COOLIFY_DESTINATION_UUID?.trim();

  if (!value) {
    throw new Error("COOLIFY_DESTINATION_UUID tanimli degil.");
  }

  return value;
}

function getCoolifyServerPublicIp(): string | null {
  const value = process.env.COOLIFY_SERVER_PUBLIC_IP?.trim();
  return value || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getCoolifyApiToken()}`,
    "Content-Type": "application/json",
  };
}

function buildBasicAuthHeaders(
  user: string,
  password: string,
  extraHeaders: Record<string, string> = {},
): HeadersInit {
  const token = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
  return {
    Authorization: `Basic ${token}`,
    "Content-Type": "application/json",
    ...extraHeaders,
  };
}

async function coolifyFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${getCoolifyApiUrl()}${COOLIFY_API_PREFIX}${pathname}`, {
      ...init,
      headers: {
        ...buildHeaders(),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(COOLIFY_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Coolify API zaman asimina ugradi (${COOLIFY_API_TIMEOUT_MS}ms): ${pathname}`);
    }

    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Coolify API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function normalizeArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    if ("data" in payload && Array.isArray((payload as { data?: unknown }).data)) {
      return (payload as { data: T[] }).data;
    }

    if ("result" in payload && Array.isArray((payload as { result?: unknown }).result)) {
      return (payload as { result: T[] }).result;
    }

    if ("services" in payload && Array.isArray((payload as { services?: unknown }).services)) {
      return (payload as { services: T[] }).services;
    }

    if ("envs" in payload && Array.isArray((payload as { envs?: unknown }).envs)) {
      return (payload as { envs: T[] }).envs;
    }

    if ("variables" in payload && Array.isArray((payload as { variables?: unknown }).variables)) {
      return (payload as { variables: T[] }).variables;
    }

    if ("environments" in payload && Array.isArray((payload as { environments?: unknown }).environments)) {
      return (payload as { environments: T[] }).environments;
    }

    if ("projects" in payload && Array.isArray((payload as { projects?: unknown }).projects)) {
      return (payload as { projects: T[] }).projects;
    }
  }

  return [];
}

function buildSupabaseServiceName(store: StoreConfig): string {
  return `${sanitizeSupabaseHostLabel(store.slug)}-db`;
}

function buildSupabaseDashboardUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/project/default`;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function serializeJsonLiteral(value: unknown): string {
  return `'${escapeSqlLiteral(JSON.stringify(value))}'::jsonb`;
}

function buildStorefrontSiteUrl(store: StoreConfig): string {
  return `https://${store.domains.storefront}`;
}

function buildInitialStoreSettings(store: StoreConfig, publicUrl: string) {
  const storefrontUrl = buildStorefrontSiteUrl(store);
  const supportEmail =
    store.branding?.supportEmail?.trim() || `destek@${store.domains.storefront}`;
  const supportPhone = store.branding?.supportPhone?.trim() || "+90 532 000 00 00";
  const tagline =
    store.branding?.tagline?.trim() ||
    `${store.name} icin premium storefront deneyimi`;

  const storeInfo = {
    name: store.name,
    email: supportEmail,
    phone: supportPhone,
    address: `${store.name} Studio, Istanbul / Turkiye`,
    currency: "TRY",
    taxRate: 20,
    timezone: "Europe/Istanbul",
    logoUrl: "",
    faviconUrl: "",
    socialInstagram: "",
    socialTwitter: "",
  };

  const announcementBar = {
    message: `${store.name} vitrini hazir. Ilk koleksiyonunuzu yayina alin.`,
    link: "/urunler",
    linkText: "Hemen Kesfet",
    enabled: true,
    backgroundColor: "#7B1113",
  };

  const seoSettings = normalizeStoreSeoSettings({
    siteName: store.name,
    titleSuffix: store.name,
    defaultTitle: `${store.name} | Premium Magaza Deneyimi`,
    defaultDescription:
      `${store.name} icin admin baglantili premium storefront deneyimi. Urunlerinizi, kategorilerinizi ve vitrin iceriklerinizi tek panelden yonetin.`,
    keywords: [
      store.name,
      "premium storefront",
      "e-ticaret",
      "celebix",
      "urun vitrini",
    ],
    ogImageUrl: "",
    twitterHandle: "",
    robotsIndex: true,
    robotsFollow: true,
  });

  const marqueeSettings = {
    items: [
      { id: "1", text: `${store.name} vitrini hazir`, icon: "sparkle", badge: "Canli" },
      { id: "2", text: "Kategori ve urunler adminden baglanir", icon: "award", badge: "Otomatik" },
      { id: "3", text: "Banner ve yorum bloklari tek panelden yonetilir", icon: "shield", badge: "Merkezi" },
      { id: "4", text: supportPhone, icon: "truck", badge: "Destek" },
    ],
    speed: "normal",
    direction: "left",
    pauseOnHover: true,
    showStars: true,
    animation: "marquee",
    enabled: true,
  };

  return [
    { key: "store_info", value: storeInfo },
    { key: "announcement_bar", value: announcementBar },
    { key: "seo_settings", value: seoSettings },
    { key: "marquee_settings", value: marqueeSettings },
    { key: "hero_banners", value: [] },
    { key: "promo_banners", value: [] },
    {
      key: "translation_settings",
      value: {
        enabled: false,
        provider: "deepl",
        sourceLocale: "tr",
        enabledLocales: ["en", "de", "ru", "ar", "ka"],
        apiKey: "",
        translateCatalog: true,
        translateSeo: true,
        translateUi: true,
      },
    },
    {
      key: "storefront_bootstrap",
      value: {
        provider: "owner",
        siteUrl: storefrontUrl,
        generatedAt: new Date().toISOString(),
      },
    },
    {
      key: "payment_gateways",
      value: createDefaultStorePaymentGateways({
        storefrontUrl,
      }),
    },
  ] as const;
}

async function seedSelfHostedStoreSettings(
  store: StoreConfig,
  runtime: SupabaseRuntimeConnection,
  adminUser: string,
  adminPassword: string,
): Promise<void> {
  const values = buildInitialStoreSettings(store, runtime.publicUrl)
    .map(
      (entry) =>
        `('${escapeSqlLiteral(entry.key)}', ${serializeJsonLiteral(entry.value)})`,
    )
    .join(",\n");

  await runSelfHostedPgMetaQuery(
    runtime.studioUrl,
    runtime.publicUrl,
    runtime.publicUrl8000,
    runtime.internalApiUrl,
    adminUser,
    adminPassword,
    `
      insert into public.settings (key, value)
      values
      ${values}
      on conflict (key) do nothing;
    `,
  );
}

function buildBootstrapQueries(
  fileList: ReadonlyArray<readonly string[]>,
): Array<{ name: string; sql: string }> {
  const repoRoot = getRepoRoot();

  return fileList.map((segments) => ({
    name: segments[segments.length - 1],
    sql: fs.readFileSync(path.join(repoRoot, ...segments), "utf8"),
  }));
}

function sanitizeSupabaseHostLabel(value: string): string {
  const normalized = value
    .toLocaleLowerCase("tr")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, 40) || "store";
}

function pickSupabaseHostLabel(store: StoreConfig): string {
  return sanitizeSupabaseHostLabel(store.slug);
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

function resolveAdminEnvLocalPath(store: StoreConfig): string {
  const relativePath = store.bootstrap?.adminEnvLocalPath || `stores/${store.slug}/admin.env.local`;
  return path.isAbsolute(relativePath) ? relativePath : path.join(getRepoRoot(), relativePath);
}

function buildLegacyAdminAuthEnvEntries(store: StoreConfig, nextSupabaseUrl: string): Record<string, string> {
  const envLocalPath = resolveAdminEnvLocalPath(store);

  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  const envMap = parseEnvFile(fs.readFileSync(envLocalPath, "utf8"));
  const legacyUrl = envMap.SUPABASE_LEGACY_URL?.trim();
  const legacyAnonKey = envMap.SUPABASE_LEGACY_ANON_KEY?.trim();

  if (legacyUrl && legacyAnonKey) {
    return {
      SUPABASE_LEGACY_URL: legacyUrl,
      SUPABASE_LEGACY_ANON_KEY: legacyAnonKey,
    };
  }

  const currentUrl = envMap.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const currentAnonKey = envMap.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (
    currentUrl &&
    currentAnonKey &&
    currentUrl !== nextSupabaseUrl &&
    currentUrl !== "configure-in-env"
  ) {
    return {
      SUPABASE_LEGACY_URL: currentUrl,
      SUPABASE_LEGACY_ANON_KEY: currentAnonKey,
    };
  }

  return {};
}

function isIpv4Address(value: string): boolean {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value.trim());
}

async function resolveCoolifyPublicIp(): Promise<string> {
  const explicitIp = getCoolifyServerPublicIp();
  if (explicitIp) {
    if (!isIpv4Address(explicitIp)) {
      throw new Error("COOLIFY_SERVER_PUBLIC_IP gecersiz. IPv4 adresi bekleniyor.");
    }

    return explicitIp;
  }

  const server = await coolifyFetch<CoolifyServer>(`/servers/${getCoolifyServerUuid()}`);
  const serverIp = server.ip?.trim();

  if (serverIp && isIpv4Address(serverIp)) {
    return serverIp;
  }

  const apiHostname = new URL(getCoolifyApiUrl()).hostname;
  const resolved = await lookup(apiHostname, { family: 4 });

  if (!resolved.address || !isIpv4Address(resolved.address)) {
    throw new Error("Coolify public IPv4 adresi cozulmedi. COOLIFY_SERVER_PUBLIC_IP tanimlayin.");
  }

  return resolved.address;
}

async function buildSupabasePublicUrl(store: StoreConfig): Promise<string> {
  const publicIp = await resolveCoolifyPublicIp();
  const hostLabel = pickSupabaseHostLabel(store);
  return `https://supabasekong-${hostLabel}.${publicIp}.sslip.io`;
}

async function buildSupabaseStudioUrl(store: StoreConfig): Promise<string> {
  const publicIp = await resolveCoolifyPublicIp();
  const hostLabel = pickSupabaseHostLabel(store);
  return `https://supabasestudio-${hostLabel}.${publicIp}.sslip.io:3000`;
}

function deriveSupabaseStudioUrl(publicUrl: string | null): string | null {
  if (!publicUrl) {
    return null;
  }

  try {
    const parsed = new URL(publicUrl);
    const studioHost = parsed.hostname.replace(/^supabasekong-/i, "supabasestudio-");

    if (studioHost === parsed.hostname) {
      return null;
    }

    return `${parsed.protocol}//${studioHost}:3000`;
  } catch {
    return null;
  }
}

async function listCoolifyRoutingIps(): Promise<string[]> {
  const candidates = new Set<string>();
  const explicitIp = getCoolifyServerPublicIp();

  if (explicitIp && isIpv4Address(explicitIp)) {
    candidates.add(explicitIp);
  }

  try {
    const server = await coolifyFetch<CoolifyServer>(`/servers/${getCoolifyServerUuid()}`);
    const serverIp = server.ip?.trim();

    if (serverIp && isIpv4Address(serverIp)) {
      candidates.add(serverIp);
    }
  } catch {
    // Fallback probes are best-effort only.
  }

  try {
    const apiHostname = new URL(getCoolifyApiUrl()).hostname;
    const resolved = await lookup(apiHostname, { family: 4 });

    if (resolved.address && isIpv4Address(resolved.address)) {
      candidates.add(resolved.address);
    }
  } catch {
    // DNS fallback is best-effort only.
  }

  return Array.from(candidates);
}

function buildAdminEnvEntries(store: StoreConfig, projectUrl: string, publicKey: string, serviceKey: string): Record<string, string> {
  return {
    STORE_SLUG: store.slug,
    NEXT_PUBLIC_SUPABASE_URL: projectUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    NEXT_PUBLIC_STORE_DOMAIN: store.domains.storefront,
    NEXT_PUBLIC_ADMIN_DOMAIN: store.domains.admin,
    NEXT_PUBLIC_SITE_URL: `https://${store.domains.storefront}`,
    NEXT_PUBLIC_ADMIN_URL: `https://${store.domains.admin}`,
    CLOUDFLARE_ACCOUNT_ID: "your-r2-account-id",
    R2_ACCESS_KEY_ID: "your-r2-access-key",
    R2_SECRET_ACCESS_KEY: "your-r2-secret",
    R2_BUCKET_NAME: "your-r2-bucket",
    R2_PUBLIC_URL: `https://cdn.${store.domains.storefront}`,
  };
}

function getSharedRedisEnvEntries(): Record<string, string> {
  const redisUrl =
    process.env.COOLIFY_SHARED_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    process.env.CELEBIX_REDIS_URL?.trim() ||
    "";
  const redisPrefix =
    process.env.COOLIFY_SHARED_REDIS_PREFIX?.trim() ||
    process.env.REDIS_PREFIX?.trim() ||
    process.env.CELEBIX_REDIS_PREFIX?.trim() ||
    "";

  const entries: Record<string, string> = {};
  if (redisUrl) {
    entries.REDIS_URL = redisUrl;
  }
  if (redisPrefix) {
    entries.REDIS_PREFIX = redisPrefix;
  }

  return entries;
}

function resolveIdentifier(value: CoolifyProject | CoolifyEnvironment | CoolifyService): string {
  const identifier =
    value.uuid ||
    ("service_uuid" in value ? value.service_uuid : undefined) ||
    ("resource_uuid" in value ? value.resource_uuid : undefined);

  if (!identifier) {
    throw new Error("Coolify kaynagi icin UUID donmedi.");
  }

  return identifier;
}

async function listProjects(): Promise<CoolifyProject[]> {
  const payload = await coolifyFetch<unknown>("/projects");
  return normalizeArrayPayload<CoolifyProject>(payload);
}

async function ensureProject(store?: StoreConfig): Promise<CoolifyProject> {
  const targetName = getCoolifyProjectName(store);
  const existing = (await listProjects()).find((project) => project.name === targetName);

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyProject>("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: targetName,
      description: "Celebix store-level self-hosted Supabase resources",
    }),
  });
}

async function listEnvironments(projectUuid: string): Promise<CoolifyEnvironment[]> {
  const payload = await coolifyFetch<unknown>(`/projects/${projectUuid}/environments`);
  return normalizeArrayPayload<CoolifyEnvironment>(payload);
}

async function ensureEnvironment(projectUuid: string): Promise<CoolifyEnvironment> {
  const targetName = getCoolifyEnvironmentName();
  const existing = (await listEnvironments(projectUuid)).find((environment) => environment.name === targetName);

  if (existing) {
    return existing;
  }

  return coolifyFetch<CoolifyEnvironment>(`/projects/${projectUuid}/environments`, {
    method: "POST",
    body: JSON.stringify({
      name: targetName,
    }),
  });
}

async function createSupabaseService(store: StoreConfig, projectUuid: string, environmentUuid: string): Promise<CoolifyService> {
  const publicUrl = await buildSupabasePublicUrl(store);
  const studioUrl = await buildSupabaseStudioUrl(store);

  return coolifyFetch<CoolifyService>("/services", {
    method: "POST",
    body: JSON.stringify({
      type: "supabase",
      name: buildSupabaseServiceName(store),
      description: `Self-hosted Supabase for ${store.slug}`,
      project_uuid: projectUuid,
      environment_uuid: environmentUuid,
      server_uuid: getCoolifyServerUuid(),
      destination_uuid: getCoolifyDestinationUuid(),
      instant_deploy: true,
      urls: [
        {
          name: "supabase-kong",
          url: publicUrl,
        },
        {
          name: "supabase-studio",
          url: studioUrl,
        },
      ],
      force_domain_override: true,
    }),
  });
}

async function getService(serviceUuid: string): Promise<CoolifyService> {
  return coolifyFetch<CoolifyService>(`/services/${serviceUuid}`);
}

async function restartService(serviceUuid: string): Promise<void> {
  await coolifyFetch<unknown>(`/services/${serviceUuid}/restart`);
}

async function syncSupabaseServiceRouting(
  serviceUuid: string,
  store: StoreConfig,
): Promise<boolean> {
  const publicUrl = await buildSupabasePublicUrl(store);
  const studioUrl = await buildSupabaseStudioUrl(store);
  const service = await getService(serviceUuid);
  const configuredDomains = new Set(
    (service.domains ?? []).map((domain) => domain.trim()).filter(Boolean),
  );
  const desiredDomains = [publicUrl, studioUrl];
  const needsUpdate = desiredDomains.some((domain) => !configuredDomains.has(domain));

  if (!needsUpdate) {
    return false;
  }

  await coolifyFetch<CoolifyService>(`/services/${serviceUuid}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: buildSupabaseServiceName(store),
      description: `Self-hosted Supabase for ${store.slug}`,
      instant_deploy: true,
      urls: [
        {
          name: "supabase-kong",
          url: publicUrl,
        },
        {
          name: "supabase-studio",
          url: studioUrl,
        },
      ],
      force_domain_override: true,
    }),
  });

  return true;
}

async function listServices(): Promise<CoolifyService[]> {
  const payload = await coolifyFetch<unknown>("/services");
  return normalizeArrayPayload<CoolifyService>(payload);
}

async function deleteService(serviceUuid: string): Promise<void> {
  await coolifyFetch<unknown>(`/services/${serviceUuid}`, { method: "DELETE" });
}

async function waitForServiceDeletion(identifier: string): Promise<void> {
  for (let attempt = 0; attempt < ENV_POLL_ATTEMPTS; attempt += 1) {
    const services = await listServices();
    const stillExists = services.some((service) => {
      const serviceIdentifier =
        service.uuid ||
        service.service_uuid ||
        service.resource_uuid ||
        service.name ||
        "";
      return serviceIdentifier === identifier || service.name === identifier;
    });

    if (!stillExists) {
      return;
    }

    await sleep(ENV_POLL_DELAY_MS);
  }

  throw new Error(`Coolify self-hosted Supabase service silindikten sonra kaldirilmadi: ${identifier}`);
}

async function recreateSupabaseService(
  store: StoreConfig,
  projectUuid: string,
  environmentUuid: string,
  existingServiceUuid: string | null,
  existingServiceName: string,
): Promise<CoolifyService> {
  if (existingServiceUuid) {
    await deleteService(existingServiceUuid);
    await waitForServiceDeletion(existingServiceUuid);
  } else {
    await waitForServiceDeletion(existingServiceName).catch(() => undefined);
  }

  return createSupabaseService(store, projectUuid, environmentUuid);
}

async function readOwnerStoreBootstrapRow(slug: string): Promise<OwnerStoreBootstrapRow | null> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("id, created_at, metadata")
    .eq("slug", slug)
    .maybeSingle<OwnerStoreBootstrapRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}

function shouldAllowDisposableStoreRecreate(
  store: StoreConfig,
  ownerRow: OwnerStoreBootstrapRow | null,
): boolean {
  if (!ownerRow) {
    return false;
  }

  const bootstrap = asRecord(asRecord(ownerRow.metadata).bootstrap);
  const firstReadyAt = readOptionalString(bootstrap.firstReadyAt);

  if (firstReadyAt) {
    return false;
  }

  const createdAt = readOptionalString(ownerRow.created_at);

  if (!createdAt) {
    return false;
  }

  return Date.now() - new Date(createdAt).getTime() <= DISPOSABLE_STORE_RECREATE_WINDOW_MS;
}

async function updateSupabaseRecoveryState(input: {
  slug: string;
  mode: "standard" | "recreate";
  attemptCount: number;
  lastError?: string | null;
  recreateAttempted?: boolean;
  recreatedAt?: string | null;
}): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("metadata")
    .eq("slug", input.slug)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return;
  }

  const metadata = asRecord(data.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const currentRecovery = asRecord(bootstrap.supabaseRecovery);
  const nextMetadata = {
    ...metadata,
    bootstrap: {
      ...bootstrap,
      supabaseRecovery: {
        ...currentRecovery,
        attemptCount: Math.max(
          input.attemptCount,
          typeof currentRecovery.attemptCount === "number" ? currentRecovery.attemptCount : 0,
        ),
        lastMode: input.mode,
        lastError: input.lastError ?? null,
        lastAttemptAt: new Date().toISOString(),
        recreateAttempted:
          input.recreateAttempted ?? (typeof currentRecovery.recreateAttempted === "boolean" ? currentRecovery.recreateAttempted : false),
        recreatedAt:
          input.recreatedAt ??
          readOptionalString(currentRecovery.recreatedAt) ??
          null,
      },
    },
  };

  const { error: updateError } = await serviceClient
    .from("owner_stores")
    .update({
      metadata: nextMetadata,
    })
    .eq("slug", input.slug);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function ensureSupabaseService(store: StoreConfig, projectUuid: string, environmentUuid: string): Promise<CoolifyService> {
  const targetName = buildSupabaseServiceName(store);
  const existing = (await listServices()).find((service) => service.name === targetName);

  if (existing) {
    const serviceUuid = resolveIdentifier(existing);
    const routingUpdated = await syncSupabaseServiceRouting(
      serviceUuid,
      store,
    );

    if (routingUpdated || store.bootstrap?.supabaseProvisioning !== "configured") {
      try {
        await restartService(serviceUuid);
      } catch {
        // Restart is best-effort; runtime and data-api polling will surface any remaining issue.
      }
    }

    return existing;
  }

  return createSupabaseService(store, projectUuid, environmentUuid);
}

async function listServiceEnvs(serviceUuid: string): Promise<CoolifyEnvironmentVariable[]> {
  const payload = await coolifyFetch<unknown>(`/services/${serviceUuid}/envs`);
  return normalizeArrayPayload<CoolifyEnvironmentVariable>(payload);
}

function sanitizeErrorMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function appendPgMetaTarget(
  targets: PgMetaTarget[],
  seen: Set<string>,
  input: PgMetaTarget | null,
): void {
  if (!input?.baseUrl?.trim()) {
    return;
  }

  const normalizedBaseUrl = input.baseUrl.replace(/\/+$/, "");
  const hostHeader = input.extraHeaders?.Host || "";
  const dedupeKey = `${normalizedBaseUrl}::${hostHeader}`;

  if (seen.has(dedupeKey)) {
    return;
  }

  seen.add(dedupeKey);
  targets.push({
    ...input,
    baseUrl: normalizedBaseUrl,
  });
}

async function buildPgMetaTargets(
  studioUrl: string | null,
  publicUrl: string,
  publicUrl8000: string | null,
  internalApiUrl: string | null,
): Promise<PgMetaTarget[]> {
  const targets: PgMetaTarget[] = [];
  const seen = new Set<string>();
  const normalizedPublicUrl = publicUrl.replace(/\/+$/, "");
  const publicHost = new URL(normalizedPublicUrl).host;
  const normalizedStudioUrl = studioUrl?.replace(/\/+$/, "") || null;
  const studioHost = normalizedStudioUrl ? new URL(normalizedStudioUrl).host : null;

  appendPgMetaTarget(targets, seen, {
    baseUrl: normalizedStudioUrl,
    label: "studio-url",
  });
  appendPgMetaTarget(targets, seen, {
    baseUrl: internalApiUrl,
    label: "runtime-internal-api",
  });
  appendPgMetaTarget(targets, seen, {
    baseUrl: normalizedPublicUrl,
    label: "public-url",
  });
  appendPgMetaTarget(targets, seen, {
    baseUrl: publicUrl8000,
    label: "public-url-8000",
  });

  for (const ip of await listCoolifyRoutingIps()) {
    appendPgMetaTarget(targets, seen, studioHost ? {
      baseUrl: `http://${ip}`,
      label: `host-header-studio-http:${ip}`,
      extraHeaders: {
        Host: studioHost,
        "X-Forwarded-Host": studioHost,
        "X-Forwarded-Proto": "https",
      },
    } : null);
    appendPgMetaTarget(targets, seen, {
      baseUrl: `http://${ip}`,
      label: `host-header-http:${ip}`,
      extraHeaders: {
        Host: publicHost,
        "X-Forwarded-Host": publicHost,
        "X-Forwarded-Proto": "https",
      },
    });
  }

  return targets;
}

async function runSelfHostedPgMetaQuery(
  studioUrl: string | null,
  publicUrl: string,
  publicUrl8000: string | null,
  internalApiUrl: string | null,
  adminUser: string,
  adminPassword: string,
  query: string,
) {
  const failures: string[] = [];
  const targets = await buildPgMetaTargets(studioUrl, publicUrl, publicUrl8000, internalApiUrl);

  for (const target of targets) {
    try {
      const response = await fetch(
        `${target.baseUrl}/api/platform/pg-meta/${SELF_HOSTED_PG_META_REF}/query`,
        {
          method: "POST",
          headers: buildBasicAuthHeaders(adminUser, adminPassword, target.extraHeaders),
          body: JSON.stringify({ query }),
          cache: "no-store",
          signal: AbortSignal.timeout(COOLIFY_API_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        failures.push(
          `${target.label} -> HTTP ${response.status}: ${sanitizeErrorMessage(errorText || response.statusText)}`,
        );
        continue;
      }

      return response.json();
    } catch (error) {
      const message =
        error instanceof Error
          ? sanitizeErrorMessage(error.message)
          : "Bilinmeyen fetch hatasi";
      failures.push(`${target.label} -> ${message}`);
    }
  }

  throw new Error(`Self-hosted pg-meta erisilemedi. ${failures.join(" | ")}`);
}

function findEnvValue(variables: CoolifyEnvironmentVariable[], candidates: string[]): string | null {
  const candidateSet = new Set(candidates.map((value) => value.toUpperCase()));
  const match = variables.find((variable) => {
    const key = (variable.key || variable.name || "").toUpperCase();
    return key && candidateSet.has(key);
  });

  return match?.value?.trim() || null;
}

async function waitForSupabaseRuntime(serviceUuid: string): Promise<SupabaseRuntimeConnection> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < ENV_POLL_ATTEMPTS; attempt += 1) {
    try {
      const variables = await listServiceEnvs(serviceUuid);
      const publicUrl = findEnvValue(variables, [
        "SERVICE_URL_SUPABASEKONG",
        "SUPABASE_URL",
      ])?.replace(/\/+$/, "") || null;
      const publicKey = findEnvValue(variables, [
        "SERVICE_SUPABASEANON_KEY",
        "SERVICE_SUPABASE_ANON_KEY",
        "SUPABASE_ANON_KEY",
      ]);
      const serviceKey = findEnvValue(variables, [
        "SERVICE_SUPABASESERVICE_KEY",
        "SERVICE_SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]);
      const publicUrl8000 =
        findEnvValue(variables, ["SERVICE_URL_SUPABASEKONG_8000"])?.replace(/\/+$/, "") || null;
      const studioUrl =
        findEnvValue(variables, [
          "SERVICE_URL_SUPABASESTUDIO_3000",
          "SERVICE_URL_SUPABASESTUDIO",
        ])?.replace(/\/+$/, "") || deriveSupabaseStudioUrl(publicUrl);
      const internalApiUrl =
        findEnvValue(variables, ["API_EXTERNAL_URL"])?.replace(/\/+$/, "") || null;
      const adminUser = findEnvValue(variables, ["SERVICE_USER_ADMIN"]);
      const adminPassword = findEnvValue(variables, ["SERVICE_PASSWORD_ADMIN"]);

      if (publicUrl && publicKey && serviceKey && adminUser && adminPassword) {
        return {
          publicKey,
          publicUrl,
          publicUrl8000,
          studioUrl,
          internalApiUrl,
          serviceKey,
          adminUser,
          adminPassword,
        };
      }

      lastError = new Error("Coolify Supabase runtime env bilgileri henuz hazir degil.");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Coolify service env bilgileri okunamadi.");
    }

    await sleep(ENV_POLL_DELAY_MS);
  }

  throw lastError ?? new Error("Coolify Supabase runtime env bilgileri alinmadi.");
}

async function ensureSelfHostedStoreSchema(
  runtime: SupabaseRuntimeConnection,
  adminUser: string,
  adminPassword: string,
): Promise<void> {
  const coreSchemaStatus = await runSelfHostedPgMetaQuery(
    runtime.studioUrl,
    runtime.publicUrl,
    runtime.publicUrl8000,
    runtime.internalApiUrl,
    adminUser,
    adminPassword,
    `
      select
        to_regclass('public.products') is not null as products_exists,
        to_regclass('public.product_variants') is not null as product_variants_exists,
        to_regclass('public.categories') is not null as categories_exists,
        to_regclass('public.settings') is not null as settings_exists,
        to_regclass('public.blog_posts') is not null as blog_posts_exists,
        to_regclass('public.product_reviews') is not null as product_reviews_exists;
    `,
  );
  const statusRow = (coreSchemaStatus?.[0] ?? {}) as Record<string, unknown>;
  const coreTableFlags = [
    "products_exists",
    "product_variants_exists",
    "categories_exists",
    "settings_exists",
    "blog_posts_exists",
    "product_reviews_exists",
  ];
  const needsCoreBundle = coreTableFlags.some((key) => statusRow[key] !== true);
  const queries = needsCoreBundle
    ? buildBootstrapQueries([...CORE_BOOTSTRAP_SQL_FILES, ...ADDITIVE_BOOTSTRAP_SQL_FILES])
    : buildBootstrapQueries(ADDITIVE_BOOTSTRAP_SQL_FILES);

  for (const query of queries) {
    await runSelfHostedPgMetaQuery(
      runtime.studioUrl,
      runtime.publicUrl,
      runtime.publicUrl8000,
      runtime.internalApiUrl,
      adminUser,
      adminPassword,
      query.sql,
    );
  }
}

async function waitForSelfHostedPgMetaRuntime(
  runtime: SupabaseRuntimeConnection,
  adminUser: string,
  adminPassword: string,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < PG_META_POLL_ATTEMPTS; attempt += 1) {
    try {
      await runSelfHostedPgMetaQuery(
        runtime.studioUrl,
        runtime.publicUrl,
        runtime.publicUrl8000,
        runtime.internalApiUrl,
        adminUser,
        adminPassword,
        "select 1 as ok;",
      );
      return;
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Self-hosted pg-meta hazir degil.");
    }

    await sleep(PG_META_POLL_DELAY_MS);
  }

  throw new Error(
    `Self-hosted pg-meta hazir olmadi. ${lastError?.message ?? "Bilinmeyen pg-meta hatasi."}`,
  );
}

function formatSelfHostedDataApiError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return fallback;
  }

  const record = error as Record<string, unknown>;
  const parts = [
    typeof record.message === "string" ? sanitizeErrorMessage(record.message) : null,
    typeof record.details === "string" ? sanitizeErrorMessage(record.details) : null,
    typeof record.hint === "string" ? sanitizeErrorMessage(record.hint) : null,
    typeof record.code === "string" ? sanitizeErrorMessage(record.code) : null,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : fallback;
}

function isRetryableSelfHostedDataApiError(message: string): boolean {
  const normalized = message.toLowerCase();

  return [
    "no available server",
    "fetch failed",
    "econnrefused",
    "connection refused",
    "connection terminated",
    "timeout",
    "timed out",
    "temporarily unavailable",
    "socket hang up",
    "network",
    "failed to fetch",
    "schema cache",
    "could not find the table",
    "relation",
    "does not exist",
    "pgrst",
  ].some((fragment) => normalized.includes(fragment));
}

async function waitForSelfHostedDataApiRuntime(
  runtime: SupabaseRuntimeConnection,
  serviceUuid: string,
): Promise<void> {
  const supabase = createClient(runtime.publicUrl, runtime.serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  let lastError: Error | null = null;
  let restartAttempted = false;

  for (let attempt = 0; attempt < DATA_API_POLL_ATTEMPTS; attempt += 1) {
    const [categories, products, settings] = await Promise.all([
      supabase.from("categories").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("settings").select("key", { count: "exact", head: true }),
    ]);

    const firstError = categories.error ?? products.error ?? settings.error;

    if (!firstError) {
      return;
    }

    const message = formatSelfHostedDataApiError(
      firstError,
      "Self-hosted data API hazir degil.",
    );
    lastError = new Error(`Self-hosted data API hazir degil. ${message}`);

    if (!restartAttempted && isRetryableSelfHostedDataApiError(message)) {
      restartAttempted = true;
      try {
        await restartService(serviceUuid);
      } catch {
        // Restart is best-effort; continued polling will surface persistent failures.
      }
    }

    await sleep(DATA_API_POLL_DELAY_MS);
  }

  throw new Error(
    `Self-hosted data API hazir olmadi. ${lastError?.message ?? "Bilinmeyen REST katmani hatasi."}`,
  );
}

function buildProjectReference(store: StoreConfig, serviceUuid: string): string {
  return `coolify:${store.slug}:${serviceUuid}`;
}

async function syncOwnerStoreSupabaseAuthority(input: {
  slug: string;
  projectRef: string;
  projectUrl: string;
  organizationSlug: string;
  provisioningStatus: "configured" | "failed";
  projectName?: string;
  resourceId?: string;
  dashboardUrl?: string;
  adminEnvLocalPath?: string;
  lastProvisionError?: string;
}): Promise<void> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient
    .from("owner_stores")
    .select("id, metadata")
    .eq("slug", input.slug)
    .maybeSingle<OwnerStoreMetadataRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return;
  }

  const metadata = asRecord(data.metadata);
  const bootstrap = asRecord(metadata.bootstrap);
  const supabase = asRecord(metadata.supabase);
  const nextMetadata = {
    ...metadata,
    bootstrap: {
      ...bootstrap,
      adminEnvLocalPath: input.adminEnvLocalPath ?? bootstrap.adminEnvLocalPath ?? null,
      organizationSlug: input.organizationSlug || bootstrap.organizationSlug || null,
      supabaseProvider: "self_hosted_coolify",
      supabaseProjectName: input.projectName ?? bootstrap.supabaseProjectName ?? null,
      supabaseResourceId: input.resourceId ?? bootstrap.supabaseResourceId ?? null,
      supabaseDashboardUrl: input.dashboardUrl ?? bootstrap.supabaseDashboardUrl ?? null,
      provisionedAt:
        input.provisioningStatus === "configured"
          ? new Date().toISOString()
          : bootstrap.provisionedAt ?? null,
      lastProvisionError: input.lastProvisionError ?? null,
      supabaseProvisioning: input.provisioningStatus,
    },
    supabase: {
      ...supabase,
      provider: "self_hosted_coolify",
      dashboardUrl: input.dashboardUrl ?? supabase.dashboardUrl ?? null,
      storage: "separate-project-per-store",
    },
  };

  const { error: updateError } = await serviceClient
    .from("owner_stores")
    .update({
      supabase_project_ref:
        input.projectRef === "pending-owner-bootstrap" ? null : input.projectRef,
      supabase_url: input.projectUrl === "configure-in-env" ? null : input.projectUrl,
      metadata: nextMetadata,
    })
    .eq("slug", input.slug);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function buildOrganization(store?: StoreConfig): SupabaseOrganization {
  const projectName = getCoolifyProjectName(store);
  return {
    id: crypto.createHash("sha1").update(projectName).digest("hex").slice(0, 12),
    slug: projectName.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-"),
    name: projectName,
  };
}

export async function getSupabaseBootstrapStatus(): Promise<SupabaseBootstrapStatus> {
  const hasApiUrl = Boolean(process.env.COOLIFY_API_URL?.trim());
  const hasToken = Boolean(process.env.COOLIFY_API_TOKEN?.trim());
  const hasServer = Boolean(process.env.COOLIFY_SERVER_UUID?.trim());
  const hasDestination = Boolean(process.env.COOLIFY_DESTINATION_UUID?.trim());
  const configured = hasApiUrl && hasToken && hasServer && hasDestination;

  return {
    configured,
    provider: "self_hosted_coolify",
    hasAccessToken: hasToken,
    hasOrgId: Boolean(process.env.COOLIFY_PROJECT_NAME?.trim()),
    defaultRegion: "self-hosted",
    defaultPlan: "coolify",
    organizations: configured ? [buildOrganization()] : [],
    resolvedOrganizationSlug: configured ? buildOrganization().slug : null,
    lastError: configured
      ? undefined
      : "Self-hosted Supabase icin COOLIFY_API_URL, COOLIFY_API_TOKEN, COOLIFY_SERVER_UUID ve COOLIFY_DESTINATION_UUID gerekli.",
  };
}

export async function provisionSupabaseForStore(store: StoreConfig): Promise<SupabaseProvisioningResult> {
  const organization = buildOrganization(store);
  const project = await ensureProject(store);
  const projectUuid = resolveIdentifier(project);
  const environment = await ensureEnvironment(projectUuid);
  const environmentUuid = resolveIdentifier(environment);
  const targetPublicUrl = await buildSupabasePublicUrl(store);
  const targetDashboardUrl = buildSupabaseDashboardUrl(targetPublicUrl);
  const targetServiceName = buildSupabaseServiceName(store);
  const ownerRow = await readOwnerStoreBootstrapRow(store.slug).catch(() => null);
  const existingRecovery = asRecord(asRecord(ownerRow?.metadata).bootstrap).supabaseRecovery;
  let attemptCount =
    typeof existingRecovery === "object" &&
    existingRecovery &&
    typeof asRecord(existingRecovery).attemptCount === "number"
      ? (asRecord(existingRecovery).attemptCount as number)
      : 0;
  let recreateAttempted =
    typeof existingRecovery === "object" &&
    existingRecovery &&
    typeof asRecord(existingRecovery).recreateAttempted === "boolean"
      ? Boolean(asRecord(existingRecovery).recreateAttempted)
      : false;
  const allowDisposableRecreate = shouldAllowDisposableStoreRecreate(store, ownerRow);

  const persistFailure = async (
    error: unknown,
    mode: "standard" | "recreate",
    serviceUuid: string | null,
    runtime: SupabaseRuntimeConnection | null,
    recreatedAt?: string | null,
  ): Promise<never> => {
    const failedProjectRef = serviceUuid
      ? buildProjectReference(store, serviceUuid)
      : store.supabase.projectRef || "pending-owner-bootstrap";
    const failedProjectUrl = runtime?.publicUrl || targetPublicUrl || store.supabase.url;
    const failedDashboardUrl =
      runtime?.publicUrl
        ? buildSupabaseDashboardUrl(runtime.publicUrl)
        : targetDashboardUrl || store.supabase.dashboardUrl;
    const failedMessage =
      error instanceof Error ? error.message : "Coolify Supabase provisioning basarisiz oldu.";

    updateStoreSupabaseConfig(store.slug, {
      projectRef: failedProjectRef,
      url: failedProjectUrl,
      provider: "self_hosted_coolify",
      organizationSlug: organization.slug,
      provisioningStatus: "failed",
      dashboardUrl: failedDashboardUrl,
      projectName: targetServiceName,
      resourceId: serviceUuid ?? undefined,
      lastProvisionError: failedMessage,
    });
    await syncOwnerStoreSupabaseAuthority({
      slug: store.slug,
      projectRef: failedProjectRef,
      projectUrl: failedProjectUrl,
      organizationSlug: organization.slug,
      provisioningStatus: "failed",
      projectName: targetServiceName,
      resourceId: serviceUuid ?? undefined,
      dashboardUrl: failedDashboardUrl,
      lastProvisionError: failedMessage,
    }).catch(() => undefined);
    await updateSupabaseRecoveryState({
      slug: store.slug,
      mode,
      attemptCount,
      lastError: failedMessage,
      recreateAttempted,
      recreatedAt: recreatedAt ?? null,
    }).catch(() => undefined);

    throw error instanceof Error ? error : new Error(failedMessage);
  };

  const executeProvisionAttempt = async (
    mode: "standard" | "recreate",
    recreatedAt?: string | null,
  ): Promise<SupabaseProvisioningResult> => {
    let serviceUuid: string | null = null;
    let runtime: SupabaseRuntimeConnection | null = null;

    try {
      const service =
        mode === "recreate"
          ? await (async () => {
              const existingService = (await listServices()).find((entry) => entry.name === targetServiceName);
              return recreateSupabaseService(
                store,
                projectUuid,
                environmentUuid,
                existingService ? resolveIdentifier(existingService) : null,
                targetServiceName,
              );
            })()
          : await ensureSupabaseService(store, projectUuid, environmentUuid);
      serviceUuid = resolveIdentifier(service);
      runtime = await waitForSupabaseRuntime(serviceUuid);
      const resolvedProjectUrl = runtime.publicUrl || targetPublicUrl;
      const resolvedDashboardUrl = buildSupabaseDashboardUrl(resolvedProjectUrl);
      await waitForSelfHostedPgMetaRuntime(runtime, runtime.adminUser, runtime.adminPassword);
      await ensureSelfHostedStoreSchema(runtime, runtime.adminUser, runtime.adminPassword);
      await seedSelfHostedStoreSettings(store, runtime, runtime.adminUser, runtime.adminPassword);
      await waitForSelfHostedDataApiRuntime(runtime, serviceUuid);
      const legacyAdminAuthEntries = buildLegacyAdminAuthEnvEntries(store, resolvedProjectUrl);
      const adminEnvLocalPath = upsertStoreAdminEnvLocal(store.slug, {
        ...legacyAdminAuthEntries,
        ...buildAdminEnvEntries(store, resolvedProjectUrl, runtime.publicKey, runtime.serviceKey),
        ...getSharedRedisEnvEntries(),
      });
      await upsertStoreSupabaseSecret({
        slug: store.slug,
        supabaseUrl: resolvedProjectUrl,
        supabaseServiceRoleKey: runtime.serviceKey,
        supabaseAnonKey: runtime.publicKey,
        supabaseLegacyUrl: legacyAdminAuthEntries.SUPABASE_LEGACY_URL ?? null,
        supabaseLegacyAnonKey: legacyAdminAuthEntries.SUPABASE_LEGACY_ANON_KEY ?? null,
      });

      updateStoreSupabaseConfig(store.slug, {
        projectRef: buildProjectReference(store, serviceUuid),
        url: resolvedProjectUrl,
        provider: "self_hosted_coolify",
        organizationSlug: organization.slug,
        provisioningStatus: "configured",
        dashboardUrl: resolvedDashboardUrl,
        projectName: service.name || buildSupabaseServiceName(store),
        resourceId: serviceUuid,
        adminEnvLocalPath: path.relative(getRepoRoot(), adminEnvLocalPath).replace(/\\/g, "/"),
      });
      await syncOwnerStoreSupabaseAuthority({
        slug: store.slug,
        projectRef: buildProjectReference(store, serviceUuid),
        projectUrl: resolvedProjectUrl,
        organizationSlug: organization.slug,
        provisioningStatus: "configured",
        projectName: service.name || targetServiceName,
        resourceId: serviceUuid,
        dashboardUrl: resolvedDashboardUrl,
        adminEnvLocalPath: path.relative(getRepoRoot(), adminEnvLocalPath).replace(/\\/g, "/"),
      }).catch(() => undefined);
      await updateSupabaseRecoveryState({
        slug: store.slug,
        mode,
        attemptCount,
        lastError: null,
        recreateAttempted,
        recreatedAt: recreatedAt ?? null,
      }).catch(() => undefined);

      return {
        provider: "self_hosted_coolify",
        organization,
        projectRef: buildProjectReference(store, serviceUuid),
        projectUrl: resolvedProjectUrl,
        adminEnvLocalPath,
        dashboardUrl: resolvedDashboardUrl,
        projectName: service.name || targetServiceName,
        resourceId: serviceUuid,
      };
    } catch (error) {
      return persistFailure(error, mode, serviceUuid, runtime, recreatedAt);
    }
  };

  attemptCount += 1;
  await updateSupabaseRecoveryState({
    slug: store.slug,
    mode: "standard",
    attemptCount,
    lastError: null,
    recreateAttempted,
  }).catch(() => undefined);

  try {
    return await executeProvisionAttempt("standard");
  } catch (error) {
    if (!allowDisposableRecreate || recreateAttempted) {
      throw error;
    }

    recreateAttempted = true;
    attemptCount += 1;
    const recreatedAt = new Date().toISOString();
    await updateSupabaseRecoveryState({
      slug: store.slug,
      mode: "recreate",
      attemptCount,
      lastError: error instanceof Error ? error.message : "Self-hosted Supabase recreate baslatildi.",
      recreateAttempted: true,
      recreatedAt,
    }).catch(() => undefined);

    return executeProvisionAttempt("recreate", recreatedAt);
  }
}
