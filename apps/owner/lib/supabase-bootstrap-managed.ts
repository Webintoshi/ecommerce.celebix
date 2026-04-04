import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getRepoRoot,
  type StoreConfig,
  updateStoreSupabaseConfig,
  writeStoreAdminEnvLocal
} from "@celebix/platform-config";
import { upsertStoreSupabaseSecret } from "@/lib/store-secrets";
import type { SupabaseBootstrapStatus, SupabaseOrganization, SupabaseProvisioningResult } from "@/lib/supabase-bootstrap.shared";

const SUPABASE_MANAGEMENT_API_URL = "https://api.supabase.com/v1";
const DATABASE_POLL_DELAY_MS = 5000;
const DATABASE_POLL_ATTEMPTS = 18;
const API_KEY_POLL_ATTEMPTS = 18;

const SQL_BOOTSTRAP_FILES = [
  { name: "base_schema", relativePath: ["apps", "admin", "supabase", "schema.sql"] },
  {
    name: "customer_auth_integration",
    relativePath: ["apps", "admin", "supabase", "migrations", "003_add_auth_integration.sql"]
  },
  {
    name: "customer_addresses",
    relativePath: ["apps", "admin", "supabase", "migrations", "004_add_customer_addresses.sql"]
  },
  {
    name: "customer_preferred_products",
    relativePath: ["apps", "admin", "supabase", "migrations", "005_add_customer_preferences.sql"]
  },
  {
    name: "product_discount_rules",
    relativePath: ["apps", "admin", "supabase", "migrations", "008_product_wizard_schema.sql"]
  },
  { name: "admin_roles", relativePath: ["apps", "admin", "supabase", "migrations", "20260209_admin_roles.sql"] },
  { name: "seo_hub", relativePath: ["apps", "admin", "supabase", "migrations", "20260219000000_seo_hub.sql"] },
  { name: "pages", relativePath: ["apps", "admin", "supabase", "migrations", "020_create_pages_table.sql"] },
  { name: "cart_system", relativePath: ["apps", "admin", "supabase", "migrations", "021_create_cart_system.sql"] },
  {
    name: "analytics_runtime",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260402000000_analytics_runtime.sql"]
  },
  {
    name: "abandoned_cart_runtime",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260402010000_abandoned_cart_runtime.sql"]
  },
  {
    name: "product_customization",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260224000000_product_customization.sql"]
  },
  {
    name: "accounting_runtime",
    relativePath: ["apps", "admin", "supabase", "migrations", "025_create_accounting_runtime.sql"]
  },
  {
    name: "product_tag_suggestions",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260314000100_product_tag_suggestions.sql"]
  },
  {
    name: "marketplace_runtime",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260314001000_marketplace_runtime.sql"]
  },
  {
    name: "lucky_wheel",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260315002000_lucky_wheel_production.sql"]
  },
  {
    name: "payment_runtime",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260328000000_payment_runtime.sql"]
  },
  {
    name: "product_columns",
    relativePath: ["apps", "admin", "supabase", "migrations", "006_add_product_columns.sql"]
  },
  {
    name: "products_subcategory_compat",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260402183000_products_subcategory_compat.sql"]
  },
  {
    name: "product_reviews",
    relativePath: ["apps", "admin", "supabase", "migrations", "20260405010000_product_reviews.sql"]
  }
] as const;

interface SupabaseManagementProject {
  id?: string;
  ref?: string;
  name?: string;
  status?: string;
  region?: string;
}

interface SupabaseManagementApiKey {
  id?: string;
  name?: string;
  type?: string;
  api_key?: string;
  apiKey?: string;
  value?: string;
}

function getAccessToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error("SUPABASE_ACCESS_TOKEN tanimli degil.");
  }

  return token;
}

function getConfiguredOrganizationSlug(): string | null {
  return process.env.SUPABASE_ORG_SLUG?.trim() || process.env.SUPABASE_ORG_ID?.trim() || null;
}

function getDefaultRegionGroup(): string {
  const configuredValue = (process.env.SUPABASE_DEFAULT_REGION_GROUP || process.env.SUPABASE_DEFAULT_REGION || "emea")
    .trim()
    .toLowerCase();

  return ["americas", "emea", "apac"].includes(configuredValue) ? configuredValue : "emea";
}

function getDefaultPlan(): string {
  return (process.env.SUPABASE_DEFAULT_PLAN || "micro").trim().toLowerCase();
}

function buildHeaders(extraHeaders?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${getAccessToken()}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeOrganizations(payload: unknown): SupabaseOrganization[] {
  if (Array.isArray(payload)) {
    return payload as SupabaseOrganization[];
  }

  if (payload && typeof payload === "object") {
    if ("organizations" in payload && Array.isArray(payload.organizations)) {
      return payload.organizations as SupabaseOrganization[];
    }

    if ("value" in payload && Array.isArray(payload.value)) {
      return payload.value as SupabaseOrganization[];
    }
  }

  return [];
}

function normalizeApiKeys(payload: unknown): SupabaseManagementApiKey[] {
  if (Array.isArray(payload)) {
    return payload as SupabaseManagementApiKey[];
  }

  if (payload && typeof payload === "object") {
    if ("api_keys" in payload && Array.isArray(payload.api_keys)) {
      return payload.api_keys as SupabaseManagementApiKey[];
    }

    if ("value" in payload && Array.isArray(payload.value)) {
      return payload.value as SupabaseManagementApiKey[];
    }
  }

  return [];
}

function readSqlBootstrapBundle(): Array<{ name: string; sql: string }> {
  const repoRoot = getRepoRoot();

  return SQL_BOOTSTRAP_FILES.map((entry) => ({
    name: entry.name,
    sql: fs.readFileSync(path.join(repoRoot, ...entry.relativePath), "utf8")
  }));
}

function resolveProjectRef(project: SupabaseManagementProject): string {
  const projectRef = typeof project.ref === "string" && project.ref.trim() ? project.ref.trim() : null;

  if (!projectRef) {
    throw new Error("Supabase proje ref bilgisi donmedi.");
  }

  return projectRef;
}

function getApiKeyValue(keys: SupabaseManagementApiKey[], allowedTypes: string[]): string | null {
  const match = keys.find((key) => {
    const type = key.type?.trim().toLowerCase();
    return type ? allowedTypes.includes(type) : false;
  });

  return match?.api_key || match?.apiKey || match?.value || null;
}

function buildAdminEnvLocal(store: StoreConfig, projectUrl: string, publicKey: string, serviceKey: string): string {
  return [
    `STORE_SLUG=${store.slug}`,
    "",
    `NEXT_PUBLIC_SUPABASE_URL=${projectUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${publicKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "",
    `NEXT_PUBLIC_SITE_URL=https://${store.domains.storefront}`,
    `NEXT_PUBLIC_ADMIN_URL=https://${store.domains.admin}`,
    "",
    "CLOUDFLARE_ACCOUNT_ID=your-r2-account-id",
    "R2_ACCESS_KEY_ID=your-r2-access-key",
    "R2_SECRET_ACCESS_KEY=your-r2-secret",
    "R2_BUCKET_NAME=your-r2-bucket",
    `R2_PUBLIC_URL=https://cdn.${store.domains.storefront}`,
    ""
  ].join("\n");
}

function buildProjectName(store: StoreConfig): string {
  const baseName = `celebix-${store.slug}`.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return baseName.slice(0, 48);
}

function hasExistingProvisionedProject(store: StoreConfig): boolean {
  const projectRef = store.supabase.projectRef?.trim();
  return Boolean(projectRef && projectRef !== "pending-owner-bootstrap");
}

async function managementFetch<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SUPABASE_MANAGEMENT_API_URL}${pathname}`, {
    ...init,
    headers: buildHeaders(init.headers),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase API hatasi (${response.status}): ${errorText || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function listOrganizations(): Promise<SupabaseOrganization[]> {
  const payload = await managementFetch<unknown>("/organizations");
  return normalizeOrganizations(payload);
}

async function resolveOrganization(): Promise<SupabaseOrganization> {
  const organizations = await listOrganizations();
  const configuredSlug = getConfiguredOrganizationSlug();

  if (configuredSlug) {
    const match = organizations.find((organization) => organization.slug === configuredSlug || organization.id === configuredSlug);

    if (!match) {
      throw new Error(`Supabase organization bulunamadi: ${configuredSlug}`);
    }

    return match;
  }

  if (organizations.length === 1) {
    return organizations[0];
  }

  if (organizations.length === 0) {
    throw new Error("Token ile erisilebilen Supabase organization bulunamadi.");
  }

  throw new Error("Birden fazla organization bulundu. SUPABASE_ORG_SLUG tanimlanmalidir.");
}

async function createProjectApiKey(ref: string, body: Record<string, unknown>) {
  await managementFetch(`/projects/${ref}/api-keys`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function getProjectApiKeys(ref: string): Promise<SupabaseManagementApiKey[]> {
  const payload = await managementFetch<unknown>(`/projects/${ref}/api-keys?reveal=true`);
  return normalizeApiKeys(payload);
}

async function ensureRecommendedApiKeys(ref: string): Promise<SupabaseManagementApiKey[]> {
  let keys = await getProjectApiKeys(ref);
  const hasPublicKey = Boolean(getApiKeyValue(keys, ["publishable", "anon"]));
  const hasSecretKey = Boolean(getApiKeyValue(keys, ["secret", "service_role"]));

  if (!hasPublicKey) {
    await createProjectApiKey(ref, {
      type: "publishable",
      name: "default"
    });
  }

  if (!hasSecretKey) {
    await createProjectApiKey(ref, {
      type: "secret",
      name: "default",
      secret_jwt_template: {
        role: "service_role"
      }
    });
  }

  if (!hasPublicKey || !hasSecretKey) {
    keys = await getProjectApiKeys(ref);
  }

  return keys;
}

async function waitForProjectApiKeys(ref: string): Promise<{ publicKey: string; serviceKey: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < API_KEY_POLL_ATTEMPTS; attempt += 1) {
    try {
      const keys = await ensureRecommendedApiKeys(ref);
      const publicKey = getApiKeyValue(keys, ["publishable", "anon"]);
      const serviceKey = getApiKeyValue(keys, ["secret", "service_role"]);

      if (publicKey && serviceKey) {
        return { publicKey, serviceKey };
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(DATABASE_POLL_DELAY_MS);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Supabase API key bilgileri zamaninda alinmadi.");
}

async function runDatabaseQuery(ref: string, query: string, name: string) {
  await managementFetch(`/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({
      name,
      query
    })
  });
}

async function waitForDatabaseQuery(ref: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < DATABASE_POLL_ATTEMPTS; attempt += 1) {
    try {
      await runDatabaseQuery(ref, "select 1;", "bootstrap_healthcheck");
      return;
    } catch (error) {
      lastError = error;
      await sleep(DATABASE_POLL_DELAY_MS);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Supabase veritabani sorgu endpoint'i hazir olmadi.");
}

async function applySqlBootstrapBundle(ref: string): Promise<void> {
  const files = readSqlBootstrapBundle();

  for (const file of files) {
    await runDatabaseQuery(ref, file.sql, `celebix_${file.name}`);
  }
}

function generateDatabasePassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function getSupabaseBootstrapStatus(): Promise<SupabaseBootstrapStatus> {
  const hasAccessToken = Boolean(process.env.SUPABASE_ACCESS_TOKEN);
  const configuredOrganization = getConfiguredOrganizationSlug();

  if (!hasAccessToken) {
    return {
      configured: false,
      provider: "managed",
      hasAccessToken: false,
      hasOrgId: Boolean(configuredOrganization),
      defaultRegion: getDefaultRegionGroup(),
      defaultPlan: getDefaultPlan(),
      organizations: [],
      resolvedOrganizationSlug: configuredOrganization
    };
  }

  try {
    const organizations = await listOrganizations();
    const resolvedOrganization = await resolveOrganization();

    return {
      configured: true,
      provider: "managed",
      hasAccessToken: true,
      hasOrgId: Boolean(configuredOrganization) || organizations.length === 1,
      defaultRegion: getDefaultRegionGroup(),
      defaultPlan: getDefaultPlan(),
      organizations,
      resolvedOrganizationSlug: resolvedOrganization.slug
    };
  } catch (error) {
    return {
      configured: false,
      provider: "managed",
      hasAccessToken: true,
      hasOrgId: Boolean(configuredOrganization),
      defaultRegion: getDefaultRegionGroup(),
      defaultPlan: getDefaultPlan(),
      organizations: [],
      resolvedOrganizationSlug: configuredOrganization,
      lastError: error instanceof Error ? error.message : "Supabase bootstrap durumu okunamadi."
    };
  }
}

export async function provisionSupabaseForStore(store: StoreConfig): Promise<SupabaseProvisioningResult> {
  if (hasExistingProvisionedProject(store)) {
    throw new Error(
      `Bu magaza icin zaten bir Supabase projesi olusturulmus: ${store.supabase.projectRef}. Yeni proje acmadan once mevcut projeyi temizleyin veya store kaydini sifirlayin.`
    );
  }

  const organization = await resolveOrganization();
  const project = await managementFetch<SupabaseManagementProject>("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: buildProjectName(store),
      organization_id: organization.id,
      organization_slug: organization.slug,
      db_pass: generateDatabasePassword(),
      region_selection: {
        type: "smartGroup",
        code: getDefaultRegionGroup()
      },
      desired_instance_size: getDefaultPlan()
    })
  });
  const projectRef = resolveProjectRef(project);
  const projectUrl = `https://${projectRef}.supabase.co`;

  try {
    await waitForDatabaseQuery(projectRef);
    await applySqlBootstrapBundle(projectRef);

    const { publicKey, serviceKey } = await waitForProjectApiKeys(projectRef);
    const adminEnvLocalPath = writeStoreAdminEnvLocal(store.slug, buildAdminEnvLocal(store, projectUrl, publicKey, serviceKey));
    await upsertStoreSupabaseSecret({
      slug: store.slug,
      supabaseUrl: projectUrl,
      supabaseServiceRoleKey: serviceKey
    });

    updateStoreSupabaseConfig(store.slug, {
      projectRef,
      url: projectUrl,
      provider: "managed",
      organizationSlug: organization.slug,
      provisioningStatus: "configured",
      adminEnvLocalPath: path.relative(getRepoRoot(), adminEnvLocalPath).replace(/\\/g, "/")
    });

    return {
      provider: "managed",
      organization,
      projectRef,
      projectUrl,
      adminEnvLocalPath
    };
  } catch (error) {
    updateStoreSupabaseConfig(store.slug, {
      projectRef,
      url: projectUrl,
      provider: "managed",
      organizationSlug: organization.slug,
      provisioningStatus: "failed",
      lastProvisionError: error instanceof Error ? error.message : "Supabase provisioning basarisiz oldu."
    });

    throw error;
  }
}
