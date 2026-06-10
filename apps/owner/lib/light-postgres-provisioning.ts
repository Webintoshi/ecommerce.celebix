import "server-only";

import path from "node:path";
import {
  getRepoRoot,
  resolveLightPostgresDefaultSslMode,
  upsertStoreAdminEnvLocal,
  updateStoreLightPostgresConfig,
  type StoreConfig,
} from "@celebix/platform-config";

export interface LightPostgresProvisioningStatus {
  configured: boolean;
  cluster: string;
  hasAdminDatabaseUrl: boolean;
  hasRuntimeDatabaseTemplate: boolean;
  hasStoreRolePasswordTemplate: boolean;
  requirements: LightPostgresEnvRequirementStatus[];
  schemaProfile: "storefront_core";
  lastError?: string;
}

export interface LightPostgresProvisioningResult {
  cluster: string;
  databaseName: string;
  schemaProfile: "storefront_core";
  roleName: string;
  readiness: LightPostgresReadinessResult;
}

export interface LightPostgresReadinessResult {
  ready: boolean;
  databaseName: string;
  roleName: string;
  schemaProfile: "storefront_core";
  checkedAt: string;
  missingTables: string[];
  missingSeedKeys: string[];
  missingOptionalModules: string[];
  missingPaymentGatewayKeys: string[];
  missingAuthBridgeTables: string[];
  roleReady: boolean;
  runtimeConnectReady: boolean;
  nextRepairAction: string | null;
  message: string;
}

export interface LightPostgresEnvRequirementStatus {
  key: string;
  aliases: string[];
  required: boolean;
  scope: "owner" | "generated-runtime";
  usedBy: string;
  missingBehavior: string;
  secret: boolean;
  present: boolean;
}

export const LIGHT_POSTGRES_SCHEMA_PROFILE = "storefront_core" as const;

export const LIGHT_POSTGRES_REQUIRED_TABLES = [
  "categories",
  "products",
  "product_variants",
  "settings",
  "pages",
  "customers",
  "customer_addresses",
  "customer_preferred_products",
  "orders",
  "order_items",
  "order_item_customizations",
  "payment_attempts",
  "payment_webhook_events",
  "payment_gateways",
  "auth_principals",
  "auth_store_memberships",
  "auth_store_customer_links",
  "auth_events",
  "optional_module_state",
] as const;

export const LIGHT_POSTGRES_AUTH_BRIDGE_TABLES = [
  "auth_principals",
  "auth_store_memberships",
  "auth_store_customer_links",
  "auth_events",
] as const;

export const LIGHT_POSTGRES_REQUIRED_SEED_KEYS = [
  "store_info",
  "analytics",
  "seo_settings",
  "runtime",
  "payment_gateways",
  "customer_auth",
  "admin_auth",
  "optional_modules",
  "schema_version",
] as const;

export const LIGHT_POSTGRES_REQUIRED_PAYMENT_GATEWAYS = [
  "bank_transfer",
  "cod",
] as const;

export const LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS = [
  "marketplaces",
  "accounting",
  "email_marketing",
  "customer_loyalty",
  "subscriptions",
  "advanced_analytics",
] as const;

interface SqlQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> {
  rows: TRow[];
}

function getClusterName(): string {
  return process.env.CELEBIX_LIGHT_POSTGRES_CLUSTER?.trim() || "celebix-light-postgres";
}

function getAdminDatabaseUrl(): string {
  const value = process.env.LIGHT_POSTGRES_ADMIN_DATABASE_URL?.trim();

  if (!value) {
    throw new Error("LIGHT_POSTGRES_ADMIN_DATABASE_URL tanimli degil.");
  }

  return value;
}

function getRuntimeDatabaseUrlTemplate(): string | null {
  return (
    process.env.LIGHT_POSTGRES_RUNTIME_DATABASE_URL_TEMPLATE?.trim() ||
    process.env.LIGHT_POSTGRES_DATABASE_URL_TEMPLATE?.trim() ||
    null
  );
}

function getStoreRolePasswordTemplate(): string | null {
  return process.env.LIGHT_POSTGRES_STORE_ROLE_PASSWORD_TEMPLATE?.trim() || null;
}

export function getLightPostgresEnvRequirementStatus(): LightPostgresEnvRequirementStatus[] {
  return [
    {
      key: "LIGHT_POSTGRES_ADMIN_DATABASE_URL",
      aliases: [],
      required: true,
      scope: "owner",
      usedBy: "Owner preflight, CREATE DATABASE, schema bootstrap, readiness checks",
      missingBehavior: "Create/provision preflight fails before store artifacts or DB resources are created.",
      secret: true,
      present: Boolean(process.env.LIGHT_POSTGRES_ADMIN_DATABASE_URL?.trim()),
    },
    {
      key: "LIGHT_POSTGRES_RUNTIME_DATABASE_URL_TEMPLATE",
      aliases: ["LIGHT_POSTGRES_DATABASE_URL_TEMPLATE"],
      required: true,
      scope: "owner",
      usedBy: "Per-store runtime DATABASE_URL generation with ${database}, ${role}, ${password}",
      missingBehavior: "Create/provision preflight fails before store artifacts or DB resources are created.",
      secret: true,
      present: Boolean(getRuntimeDatabaseUrlTemplate()),
    },
    {
      key: "LIGHT_POSTGRES_STORE_ROLE_PASSWORD_TEMPLATE",
      aliases: [],
      required: true,
      scope: "owner",
      usedBy: "Per-store runtime role password generation",
      missingBehavior: "Create/provision preflight fails before store artifacts or DB resources are created.",
      secret: true,
      present: Boolean(getStoreRolePasswordTemplate()),
    },
    {
      key: "CELEBIX_LIGHT_POSTGRES_CLUSTER",
      aliases: [],
      required: false,
      scope: "owner",
      usedBy: "Display/metadata cluster label",
      missingBehavior: "Falls back to celebix-light-postgres.",
      secret: false,
      present: Boolean(process.env.CELEBIX_LIGHT_POSTGRES_CLUSTER?.trim()),
    },
    {
      key: "LIGHT_POSTGRES_DEFAULT_SSLMODE",
      aliases: ["LIGHT_POSTGRES_DATABASE_SSLMODE", "DATABASE_SSLMODE"],
      required: false,
      scope: "generated-runtime",
      usedBy: "Postgres SSL option resolution",
      missingBehavior: "Falls back to platform default SSL mode.",
      secret: false,
      present: Boolean(
        process.env.LIGHT_POSTGRES_DEFAULT_SSLMODE?.trim() ||
          process.env.LIGHT_POSTGRES_DATABASE_SSLMODE?.trim() ||
          process.env.DATABASE_SSLMODE?.trim(),
      ),
    },
  ];
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlJsonLiteral(value: unknown): string {
  return `'${escapeSqlLiteral(JSON.stringify(value))}'::jsonb`;
}

function replaceDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function buildLightPostgresRoleName(databaseName: string): string {
  const normalized = databaseName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 46);
  return `celebix_store_${normalized || "store"}`;
}

function buildStoreRolePassword(databaseName: string, roleName: string): string | null {
  const template = getStoreRolePasswordTemplate();

  if (!template) {
    return null;
  }

  return template
    .replace(/\$\{database\}/g, databaseName)
    .replace(/\$\{role\}/g, roleName);
}

function buildRuntimeDatabaseUrl(databaseName: string, roleName: string, rolePassword: string): string | null {
  const template = getRuntimeDatabaseUrlTemplate();

  if (!template) {
    return null;
  }

  return template
    .replace(/\$\{database\}/g, databaseName)
    .replace(/\$\{role\}/g, encodeURIComponent(roleName))
    .replace(/\$\{password\}/g, encodeURIComponent(rolePassword));
}

function normalizeSslOption(value: string): false | { rejectUnauthorized: false } {
  return value === "disable" || value === "allow" || value === "prefer"
    ? false
    : { rejectUnauthorized: false };
}

function quotePostgresIdentifier(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("light_postgres database name bos olamaz.");
  }

  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

async function querySql<TRow extends Record<string, unknown> = Record<string, unknown>>(
  connectionString: string,
  sql: string,
  params: unknown[] = [],
): Promise<SqlQueryResult<TRow>> {
  const { Client } = await import("pg");
  const sslMode = resolveLightPostgresDefaultSslMode();
  const client = new Client({
    connectionString,
    ssl: normalizeSslOption(sslMode),
  });

  await client.connect();

  try {
    const result = await client.query(sql, params);
    return {
      rows: result.rows as TRow[],
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runSql(connectionString: string, sql: string): Promise<void> {
  await querySql(connectionString, sql);
}

export function buildLightPostgresCreateDatabaseStatement(databaseName: string): string {
  return `CREATE DATABASE ${quotePostgresIdentifier(databaseName)};`;
}

function buildLightPostgresEnsureRoleStatement(roleName: string, rolePassword: string): string {
  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${escapeSqlLiteral(roleName)}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${escapeSqlLiteral(roleName)}', '${escapeSqlLiteral(rolePassword)}');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', '${escapeSqlLiteral(roleName)}', '${escapeSqlLiteral(rolePassword)}');
  END IF;
END;
$$;
`;
}

function buildLightPostgresGrantSql(databaseName: string, roleName: string): string {
  const quotedRole = quotePostgresIdentifier(roleName);

  return `
GRANT CONNECT ON DATABASE ${quotePostgresIdentifier(databaseName)} TO ${quotedRole};
GRANT USAGE ON SCHEMA public TO ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quotedRole};
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quotedRole};
`;
}

export async function ensureLightPostgresDatabaseWithExecutor(
  databaseName: string,
  execute: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<SqlQueryResult<TRow>>,
): Promise<{ created: boolean }> {
  const existing = await execute<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname = $1 LIMIT 1;",
    [databaseName],
  );

  if (existing.rows.length > 0) {
    return { created: false };
  }

  await execute(buildLightPostgresCreateDatabaseStatement(databaseName));
  return { created: true };
}

async function ensureLightPostgresDatabase(
  connectionString: string,
  databaseName: string,
): Promise<{ created: boolean }> {
  return ensureLightPostgresDatabaseWithExecutor(databaseName, (sql, params) =>
    querySql(connectionString, sql, params),
  );
}

async function ensureLightPostgresStoreRole(
  adminConnectionString: string,
  databaseConnectionString: string,
  databaseName: string,
  roleName: string,
  rolePassword: string,
): Promise<void> {
  await runSql(adminConnectionString, buildLightPostgresEnsureRoleStatement(roleName, rolePassword));
  await runSql(databaseConnectionString, buildLightPostgresGrantSql(databaseName, roleName));
}

function buildLightPostgresSchemaSql(store: StoreConfig): string {
  const storeInfo = {
    slug: store.slug,
    name: store.name,
    storefrontDomain: store.domains.storefront,
    adminDomain: store.domains.admin,
    demoDomain: store.domains.demo,
    supportEmail: store.branding?.supportEmail ?? `destek@${store.domains.storefront}`,
    supportPhone: store.branding?.supportPhone ?? "+90 532 000 00 00",
  };

  const analytics = {
    provider: "umami",
    ready: true,
  };

  const publishedCms = (content: string, entities: string[]) => ({
    keyTakeaways: [],
    entities,
    cms: {
      content,
      status: "published",
    },
  });

  return `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.celebix_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image text,
  icon text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  seo_title text,
  seo_description text,
  seo_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  geo_data jsonb NOT NULL DEFAULT '{"keyTakeaways":[],"entities":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text,
  subcategory text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  images_v2 jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  is_bestseller boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  vegan boolean NOT NULL DEFAULT false,
  gluten_free boolean NOT NULL DEFAULT false,
  sugar_free boolean NOT NULL DEFAULT false,
  high_protein boolean NOT NULL DEFAULT false,
  rating numeric(4,2) NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  seo_title text,
  seo_description text,
  seo_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_focus_keyword text,
  og_image text,
  canonical_url text,
  seo_robots text NOT NULL DEFAULT 'index,follow',
  status text NOT NULL DEFAULT 'draft',
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  tax_rate integer NOT NULL DEFAULT 0,
  brand text NOT NULL DEFAULT '',
  country_of_origin text,
  sku text,
  gtin text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  complementary_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  track_stock boolean NOT NULL DEFAULT true,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  nutrition_basis text NOT NULL DEFAULT 'per_100g',
  serving_size integer NOT NULL DEFAULT 100,
  serving_per_container integer NOT NULL DEFAULT 1,
  allergens jsonb NOT NULL DEFAULT '[]'::jsonb,
  vitamins jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingredients text,
  storage_conditions text,
  shelf_life_days integer,
  calories numeric(12,2) NOT NULL DEFAULT 0,
  protein numeric(12,2) NOT NULL DEFAULT 0,
  carbs numeric(12,2) NOT NULL DEFAULT 0,
  fat numeric(12,2) NOT NULL DEFAULT 0,
  fiber numeric(12,2) NOT NULL DEFAULT 0,
  sugar numeric(12,2) NOT NULL DEFAULT 0,
  saturated_fat numeric(12,2) NOT NULL DEFAULT 0,
  sodium numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  name text NOT NULL DEFAULT 'Varsayilan',
  weight text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  original_price numeric(12,2),
  cost numeric(12,2),
  stock integer NOT NULL DEFAULT 0,
  barcode text,
  group_name text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  unit text,
  max_purchase_quantity integer,
  warehouse_location text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  schema_type text NOT NULL DEFAULT 'WebPage',
  icon text,
  seo_title text,
  seo_description text,
  seo_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  geo_data jsonb NOT NULL DEFAULT '{"keyTakeaways":[],"entities":[],"cms":{"content":"","status":"draft"}}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  average_order_value numeric(12,2) NOT NULL DEFAULT 0,
  last_order_date timestamptz,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text,
  first_name text,
  last_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  district text,
  state text,
  postal_code text,
  country text NOT NULL DEFAULT 'TR',
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_preferred_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY',
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending',
  notes text,
  source_type text NOT NULL DEFAULT 'storefront_checkout',
  source_ref_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_name text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  total numeric(12,2) NOT NULL DEFAULT 0,
  category text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_item_customizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  quick_order_link_id uuid,
  gateway_id text NOT NULL,
  provider text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'TRY',
  status text NOT NULL DEFAULT 'created',
  idempotency_key text NOT NULL UNIQUE,
  checkout_token text UNIQUE,
  redirect_url text,
  provider_payment_id text,
  provider_reference_id text,
  conversation_id text,
  customer_email text,
  customer_ip text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  callback_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  callback_received_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  gateway_id text,
  payment_attempt_id uuid REFERENCES public.payment_attempts(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  quick_order_link_id uuid,
  event_type text,
  status text NOT NULL DEFAULT 'received',
  signature text,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  key text PRIMARY KEY,
  label text NOT NULL,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'manual_setup_required',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auth_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'logto',
  subject text NOT NULL,
  email text,
  role text NOT NULL DEFAULT 'customer',
  status text NOT NULL DEFAULT 'pending_auth_setup',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS public.auth_store_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL REFERENCES public.auth_principals(id) ON DELETE CASCADE,
  store_slug text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (principal_id, store_slug, role)
);

CREATE TABLE IF NOT EXISTS public.auth_store_customer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid NOT NULL REFERENCES public.auth_principals(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'logto',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (principal_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_id uuid REFERENCES public.auth_principals(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.optional_module_state (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'disabled',
  required_action text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pages_sort_order ON public.pages(sort_order);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_preferred_products_customer_id ON public.customer_preferred_products(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id ON public.payment_attempts(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_reference_id ON public.payment_attempts(provider_reference_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_attempt_id ON public.payment_webhook_events(payment_attempt_id);
CREATE INDEX IF NOT EXISTS idx_auth_principals_email ON public.auth_principals(email);
CREATE INDEX IF NOT EXISTS idx_auth_store_memberships_store_slug ON public.auth_store_memberships(store_slug);

DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS product_variants_set_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_set_updated_at
BEFORE UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS settings_set_updated_at ON public.settings;
CREATE TRIGGER settings_set_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS pages_set_updated_at ON public.pages;
CREATE TRIGGER pages_set_updated_at
BEFORE UPDATE ON public.pages
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;
CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS customer_addresses_set_updated_at ON public.customer_addresses;
CREATE TRIGGER customer_addresses_set_updated_at
BEFORE UPDATE ON public.customer_addresses
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS customer_preferred_products_set_updated_at ON public.customer_preferred_products;
CREATE TRIGGER customer_preferred_products_set_updated_at
BEFORE UPDATE ON public.customer_preferred_products
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS order_items_set_updated_at ON public.order_items;
CREATE TRIGGER order_items_set_updated_at
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS payment_attempts_set_updated_at ON public.payment_attempts;
CREATE TRIGGER payment_attempts_set_updated_at
BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS payment_webhook_events_set_updated_at ON public.payment_webhook_events;
CREATE TRIGGER payment_webhook_events_set_updated_at
BEFORE UPDATE ON public.payment_webhook_events
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS payment_gateways_set_updated_at ON public.payment_gateways;
CREATE TRIGGER payment_gateways_set_updated_at
BEFORE UPDATE ON public.payment_gateways
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS auth_principals_set_updated_at ON public.auth_principals;
CREATE TRIGGER auth_principals_set_updated_at
BEFORE UPDATE ON public.auth_principals
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS auth_store_memberships_set_updated_at ON public.auth_store_memberships;
CREATE TRIGGER auth_store_memberships_set_updated_at
BEFORE UPDATE ON public.auth_store_memberships
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS auth_store_customer_links_set_updated_at ON public.auth_store_customer_links;
CREATE TRIGGER auth_store_customer_links_set_updated_at
BEFORE UPDATE ON public.auth_store_customer_links
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS optional_module_state_set_updated_at ON public.optional_module_state;
CREATE TRIGGER optional_module_state_set_updated_at
BEFORE UPDATE ON public.optional_module_state
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

INSERT INTO public.settings (key, value)
VALUES
  ('store_info', ${toSqlJsonLiteral(storeInfo)}),
  ('analytics', ${toSqlJsonLiteral(analytics)}),
  ('seo_settings', ${toSqlJsonLiteral({
    titleTemplate: `%s | ${store.name}`,
    defaultTitle: `${store.name} | Premium Magaza Deneyimi`,
    defaultDescription: `${store.name} magazasinin urunleri, koleksiyonlari ve kurumsal icerikleri ortak Celebix storefront deneyimi ile yayinlanir.`,
    ogImageUrl: '',
  })}),
  ('announcement_bar', ${toSqlJsonLiteral({
    enabled: false,
    text: '',
    link: '',
  })}),
  ('marquee_settings', ${toSqlJsonLiteral({
    enabled: false,
    text: '',
    speed: 30,
    animation: 'marquee',
  })}),
  ('translation_settings', ${toSqlJsonLiteral({
    enabled: false,
    provider: 'deepl',
    apiKey: '',
    defaultLocale: 'tr',
    locales: ['tr', 'en'],
  })}),
  ('notification_settings', ${toSqlJsonLiteral({
    email: {
      provider: 'resend',
      senderName: store.name,
      senderEmail: storeInfo.supportEmail,
      replyTo: storeInfo.supportEmail,
      apiKey: '',
    },
    sms: {
      provider: 'netgsm',
      apiKey: '',
      apiSecret: '',
      senderTitle: store.slug.replace(/-/g, '').slice(0, 11).toUpperCase(),
    },
    push: {
      provider: 'firebase',
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    },
  })}),
  ('shipping_options', ${toSqlJsonLiteral({ options: [] })}),
  ('shipping_integrations', ${toSqlJsonLiteral({
    version: 1,
    defaultProvider: null,
    integrations: [],
  })}),
  ('product_listing_order', ${toSqlJsonLiteral({ positions: {} })}),
  ('variant_attributes_registry', ${toSqlJsonLiteral({ attributes: [] })}),
  ('runtime', ${toSqlJsonLiteral({
    databaseMode: "light_postgres",
    generatedBy: "owner",
    generatedAt: new Date().toISOString(),
  })}),
  ('payment_gateways', ${toSqlJsonLiteral({
    gateways: [
      {
        id: "bank_transfer",
        gateway: "bank_transfer",
        key: "bank_transfer",
        provider: "bank_transfer",
        name: "Havale/EFT",
        label: "Havale/EFT",
        status: "active",
        enabled: true,
        mode: "manual_ready",
        environment: "production",
        bankAccount: {
          bankName: "Celebix Manuel Havale",
          iban: "TR000000000000000000000000",
          accountHolder: store.name,
          swift: "",
          currency: "TRY",
        },
        configuration: {
          paymentNote: "Siparis numarasini aciklama alanina yaziniz. Banka bilgileri admin panelinden guncellenebilir.",
        },
        requiredAction: "Banka hesap bilgileri canli kullanim oncesi admin panelinden dogrulanmali.",
      },
      {
        id: "cod",
        gateway: "cod",
        key: "cod",
        provider: "cod",
        name: "Kapida Odeme",
        label: "Kapida Odeme",
        status: "inactive",
        enabled: false,
        mode: "manual_setup_required",
        environment: "production",
        requiredAction: "Kapida odeme bolge ve limit ayarlari admin panelinden tamamlanmali.",
      },
    ],
  })}),
  ('customer_auth', ${toSqlJsonLiteral({
    provider: "logto",
    status: "pending_auth_setup",
    enabled: false,
    requiredAction: "Logto customer app kurulumu tamamlandiktan sonra aktiflestirilir.",
  })}),
  ('admin_auth', ${toSqlJsonLiteral({
    provider: "logto",
    status: "pending_auth_setup",
    enabled: false,
    requiredAction: "Logto admin app kurulumu tamamlandiktan sonra aktiflestirilir.",
  })}),
  ('optional_modules', ${toSqlJsonLiteral({
    mode: "safe_disabled",
    modules: LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS.map((key) => ({
      key,
      enabled: false,
      status: "disabled",
      requiredAction: "Owner tarafindan bilincli olarak etkinlestirilmelidir.",
    })),
  })}),
  ('schema_version', ${toSqlJsonLiteral({
    profile: LIGHT_POSTGRES_SCHEMA_PROFILE,
    version: 2,
    ownerPackage: "light_postgres_provisioning_hardening",
  })})
ON CONFLICT (key) DO UPDATE
SET value = excluded.value;

INSERT INTO public.payment_gateways (key, label, provider, enabled, mode, configuration, required_action)
VALUES
  (
    'bank_transfer',
    'Havale/EFT',
    'bank_transfer',
    true,
    'manual_ready',
    ${toSqlJsonLiteral({
      bankAccount: {
        bankName: "Celebix Manuel Havale",
        iban: "TR000000000000000000000000",
        accountHolder: store.name,
        swift: "",
        currency: "TRY",
      },
      paymentNote: "Siparis numarasini aciklama alanina yaziniz. Banka bilgileri admin panelinden guncellenebilir.",
    })},
    'Banka hesap bilgileri canli kullanim oncesi admin panelinden dogrulanmali.'
  ),
  (
    'cod',
    'Kapida Odeme',
    'cod',
    false,
    'manual_setup_required',
    ${toSqlJsonLiteral({ minOrderAmount: 0, maxOrderAmount: 10000 })},
    'Kapida odeme bolge ve limit ayarlari admin panelinden tamamlanmali.'
  )
ON CONFLICT (key) DO UPDATE
SET
  label = excluded.label,
  provider = excluded.provider,
  mode = excluded.mode,
  configuration = excluded.configuration,
  required_action = excluded.required_action;

INSERT INTO public.optional_module_state (key, enabled, status, required_action, metadata)
VALUES
  ${LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS.map(
    (key) => `('${key}', false, 'disabled', 'Owner tarafindan bilincli olarak etkinlestirilmelidir.', '{}'::jsonb)`,
  ).join(",\n  ")}
ON CONFLICT (key) DO UPDATE
SET
  enabled = false,
  status = 'disabled',
  required_action = excluded.required_action;

INSERT INTO public.pages (
  slug,
  name,
  schema_type,
  icon,
  seo_title,
  seo_description,
  seo_keywords,
  faq,
  geo_data,
  is_active,
  sort_order
)
VALUES
  (
    '',
    'Ana Sayfa',
    'WebSite',
    'Home',
    '${escapeSqlLiteral(`${store.name} | Premium Magaza Deneyimi`)}',
    '${escapeSqlLiteral(`${store.name} magazasinin vitrini bu sayfada yayinlanir.`)}',
    ${toSqlJsonLiteral([store.slug, 'ana sayfa', 'premium storefront'])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Ana sayfa icerigi admin panelinden guncellenebilir.', ['WebSite', 'Organization']))},
    true,
    1
  ),
  (
    'urunler',
    'Urunler',
    'CollectionPage',
    'Package',
    '${escapeSqlLiteral(`Tum Urunler | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} katalogundaki urunleri bu sayfada kesfedebilirsiniz.`)}',
    ${toSqlJsonLiteral(['urunler', 'katalog', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Urun katalogu storefront tarafinda otomatik listelenir.', ['CollectionPage']))},
    true,
    2
  ),
  (
    'iletisim',
    'Iletisim',
    'ContactPage',
    'Mail',
    '${escapeSqlLiteral(`Iletisim | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} ile iletisime gecmek icin bu sayfayi kullanabilirsiniz.`)}',
    ${toSqlJsonLiteral(['iletisim', 'destek', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Iletisim bilgileri admin ayarlarindan otomatik okunur.', ['ContactPage']))},
    true,
    3
  ),
  (
    'hakkimizda',
    'Hakkimizda',
    'AboutPage',
    'Info',
    '${escapeSqlLiteral(`Hakkimizda | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} markasinin hikayesi ve pozisyonu.`)}',
    ${toSqlJsonLiteral(['hakkimizda', 'marka', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Marka hikayenizi bu alandan duzenleyebilirsiniz.', ['AboutPage']))},
    true,
    4
  ),
  (
    'sss',
    'SSS',
    'FAQPage',
    'HelpCircle',
    '${escapeSqlLiteral(`Sikca Sorulan Sorular | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} siparis ve teslimat surecleriyle ilgili temel sorular.`)}',
    ${toSqlJsonLiteral(['sss', 'yardim', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Sik sorulan sorular bu alan uzerinden guncellenir.', ['FAQPage']))},
    true,
    5
  ),
  (
    'gizlilik',
    'Gizlilik Politikasi',
    'WebPage',
    'Shield',
    '${escapeSqlLiteral(`Gizlilik Politikasi | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} gizlilik politikasi.`)}',
    ${toSqlJsonLiteral(['gizlilik', 'politika', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Bu politika sayfasi admin CMS uzerinden zenginlestirilebilir.', ['WebPage']))},
    true,
    20
  ),
  (
    'kvkk',
    'KVKK',
    'WebPage',
    'Scale',
    '${escapeSqlLiteral(`KVKK | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} KVKK aydinlatma metni.`)}',
    ${toSqlJsonLiteral(['kvkk', 'aydinlatma', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('KVKK metnini bu sayfadan yonetebilirsiniz.', ['WebPage']))},
    true,
    21
  ),
  (
    'kargo',
    'Kargo ve Teslimat',
    'WebPage',
    'Truck',
    '${escapeSqlLiteral(`Kargo ve Teslimat | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} teslimat sureci.`)}',
    ${toSqlJsonLiteral(['kargo', 'teslimat', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Teslimat detaylari admin CMS uzerinden duzenlenir.', ['WebPage']))},
    true,
    22
  ),
  (
    'iade',
    'Iade ve Degisim',
    'WebPage',
    'RefreshCw',
    '${escapeSqlLiteral(`Iade ve Degisim | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} iade ve degisim politikasi.`)}',
    ${toSqlJsonLiteral(['iade', 'degisim', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Iade politikasi bu sayfadan yonetilir.', ['WebPage']))},
    true,
    23
  ),
  (
    'mesafeli-satis-sozlesmesi',
    'Mesafeli Satis Sozlesmesi',
    'WebPage',
    'FileText',
    '${escapeSqlLiteral(`Mesafeli Satis Sozlesmesi | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} mesafeli satis sozlesmesi.`)}',
    ${toSqlJsonLiteral(['mesafeli satis', 'sozlesme', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Mesafeli satis sozlesmesi bu sayfadan duzenlenebilir.', ['WebPage']))},
    true,
    24
  ),
  (
    'sartlar',
    'Kullanim Sartlari',
    'WebPage',
    'ScrollText',
    '${escapeSqlLiteral(`Kullanim Sartlari | ${store.name}`)}',
    '${escapeSqlLiteral(`${store.name} kullanim sartlari.`)}',
    ${toSqlJsonLiteral(['sartlar', 'kullanim', store.slug])},
    '[]'::jsonb,
    ${toSqlJsonLiteral(publishedCms('Kullanim sartlari bu sayfadan guncellenir.', ['WebPage']))},
    true,
    25
  )
ON CONFLICT (slug) DO NOTHING;
`;
}

function writeOptionalAdminEnvLocal(
  store: StoreConfig,
  databaseName: string,
  roleName: string,
  rolePassword: string,
): void {
  const runtimeDatabaseUrl = buildRuntimeDatabaseUrl(databaseName, roleName, rolePassword);
  const runtimeSslMode = resolveLightPostgresDefaultSslMode();

  if (!runtimeDatabaseUrl) {
    return;
  }

  upsertStoreAdminEnvLocal(store.slug, {
    DATABASE_URL: runtimeDatabaseUrl,
    DATABASE_DIRECT_URL: runtimeDatabaseUrl,
    LIGHT_POSTGRES_DATABASE_URL: runtimeDatabaseUrl,
    LIGHT_POSTGRES_DATABASE_NAME: databaseName,
    LIGHT_POSTGRES_DATABASE_SSLMODE: runtimeSslMode,
    DATABASE_SSLMODE: runtimeSslMode,
    ADMIN_DATABASE_MODE: "light_postgres",
    DATABASE_MODE: "light_postgres",
    NEXT_PUBLIC_RUNTIME_DATABASE_MODE: "light_postgres",
    AUTH_SETUP_STATUS: "blocked_auth_setup",
    NEXT_PUBLIC_AUTH_SETUP_STATUS: "blocked_auth_setup",
  });
}

export async function getLightPostgresBootstrapStatus(): Promise<LightPostgresProvisioningStatus> {
  const requirements = getLightPostgresEnvRequirementStatus();
  const hasAdminDatabaseUrl = requirements.find((entry) => entry.key === "LIGHT_POSTGRES_ADMIN_DATABASE_URL")?.present ?? false;
  const hasRuntimeDatabaseTemplate = requirements.find((entry) => entry.key === "LIGHT_POSTGRES_RUNTIME_DATABASE_URL_TEMPLATE")?.present ?? false;
  const hasStoreRolePasswordTemplate = requirements.find((entry) => entry.key === "LIGHT_POSTGRES_STORE_ROLE_PASSWORD_TEMPLATE")?.present ?? false;
  const missing = requirements
    .filter((entry) => entry.required && !entry.present)
    .map((entry) =>
      entry.aliases.length > 0 ? `${entry.key} veya ${entry.aliases.join("/")}` : entry.key,
    );
  const configured = missing.length === 0;

  return {
    configured,
    cluster: getClusterName(),
    hasAdminDatabaseUrl,
    hasRuntimeDatabaseTemplate,
    hasStoreRolePasswordTemplate,
    requirements,
    schemaProfile: LIGHT_POSTGRES_SCHEMA_PROFILE,
    lastError: configured
      ? undefined
      : `light_postgres icin owner env eksik: ${missing.join(", ")}.`,
  };
}

function withoutExpected<T extends string>(expected: readonly T[], actual: Iterable<string>): T[] {
  const actualSet = new Set(Array.from(actual));
  return expected.filter((value) => !actualSet.has(value));
}

function resolveLightPostgresRepairAction(result: Omit<LightPostgresReadinessResult, "nextRepairAction" | "message">): string | null {
  if (!result.roleReady) {
    return "light_postgres role/password authority tekrar provision edilmeli.";
  }

  if (!result.runtimeConnectReady) {
    return "light_postgres runtime connection template ve role grant ayarlari kontrol edilmeli.";
  }

  if (result.missingTables.length > 0) {
    return "light_postgres schema bootstrap tekrar calistirilmali.";
  }

  if (
    result.missingSeedKeys.length > 0 ||
    result.missingPaymentGatewayKeys.length > 0 ||
    result.missingOptionalModules.length > 0
  ) {
    return "light_postgres baseline seed tekrar calistirilmali.";
  }

  if (result.missingAuthBridgeTables.length > 0) {
    return "Logto auth bridge tablolarini iceren schema bootstrap tekrar calistirilmali.";
  }

  return null;
}

export async function checkLightPostgresReadinessForStore(
  store: StoreConfig,
): Promise<LightPostgresReadinessResult> {
  const databaseName = store.lightPostgres?.databaseName ?? store.slug;
  const roleName = store.lightPostgres?.roleName ?? buildLightPostgresRoleName(databaseName);
  const rolePassword = buildStoreRolePassword(databaseName, roleName);
  const adminDatabaseUrl = getAdminDatabaseUrl();
  const databaseConnectionString = replaceDatabaseName(adminDatabaseUrl, databaseName);
  const checkedAt = new Date().toISOString();

  const roleRows = await querySql<{ rolname: string }>(
    adminDatabaseUrl,
    "SELECT rolname FROM pg_roles WHERE rolname = $1 LIMIT 1;",
    [roleName],
  );
  const roleReady = roleRows.rows.length > 0;
  let runtimeConnectReady = false;

  if (rolePassword) {
    const runtimeDatabaseUrl = buildRuntimeDatabaseUrl(databaseName, roleName, rolePassword);

    if (runtimeDatabaseUrl) {
      try {
        await querySql(runtimeDatabaseUrl, "SELECT 1 AS ok;");
        runtimeConnectReady = true;
      } catch {
        runtimeConnectReady = false;
      }
    }
  }

  const tableRows = await querySql<{ table_name: string }>(
    databaseConnectionString,
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[]);
    `,
    [[...LIGHT_POSTGRES_REQUIRED_TABLES]],
  );
  const existingTables = tableRows.rows.map((row) => row.table_name);
  const missingTables = withoutExpected(LIGHT_POSTGRES_REQUIRED_TABLES, existingTables);
  const missingAuthBridgeTables = withoutExpected(LIGHT_POSTGRES_AUTH_BRIDGE_TABLES, existingTables);
  let missingSeedKeys = [...LIGHT_POSTGRES_REQUIRED_SEED_KEYS];
  let missingPaymentGatewayKeys = [...LIGHT_POSTGRES_REQUIRED_PAYMENT_GATEWAYS];
  let missingOptionalModules = [...LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS];

  if (!missingTables.includes("settings")) {
    const settingRows = await querySql<{ key: string }>(
      databaseConnectionString,
      "SELECT key FROM public.settings WHERE key = ANY($1::text[]);",
      [[...LIGHT_POSTGRES_REQUIRED_SEED_KEYS]],
    );
    missingSeedKeys = withoutExpected(
      LIGHT_POSTGRES_REQUIRED_SEED_KEYS,
      settingRows.rows.map((row) => row.key),
    );
  }

  if (!missingTables.includes("payment_gateways")) {
    const gatewayRows = await querySql<{ key: string }>(
      databaseConnectionString,
      "SELECT key FROM public.payment_gateways WHERE key = ANY($1::text[]);",
      [[...LIGHT_POSTGRES_REQUIRED_PAYMENT_GATEWAYS]],
    );
    missingPaymentGatewayKeys = withoutExpected(
      LIGHT_POSTGRES_REQUIRED_PAYMENT_GATEWAYS,
      gatewayRows.rows.map((row) => row.key),
    );
  }

  if (!missingTables.includes("optional_module_state")) {
    const moduleRows = await querySql<{ key: string }>(
      databaseConnectionString,
      "SELECT key FROM public.optional_module_state WHERE key = ANY($1::text[]) AND enabled = false AND status = 'disabled';",
      [[...LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS]],
    );
    missingOptionalModules = withoutExpected(
      LIGHT_POSTGRES_OPTIONAL_MODULE_KEYS,
      moduleRows.rows.map((row) => row.key),
    );
  }

  const partialResult = {
    ready: false,
    databaseName,
    roleName,
    schemaProfile: LIGHT_POSTGRES_SCHEMA_PROFILE,
    checkedAt,
    missingTables,
    missingSeedKeys,
    missingOptionalModules,
    missingPaymentGatewayKeys,
    missingAuthBridgeTables,
    roleReady,
    runtimeConnectReady,
  } satisfies Omit<LightPostgresReadinessResult, "nextRepairAction" | "message">;
  const nextRepairAction = resolveLightPostgresRepairAction(partialResult);
  const ready = nextRepairAction === null;

  return {
    ...partialResult,
    ready,
    nextRepairAction,
    message: ready
      ? "light_postgres schema, seed, role ve runtime connection hazir."
      : nextRepairAction ?? "light_postgres readiness kontrolu basarisiz oldu.",
  };
}

export async function provisionLightPostgresForStore(
  store: StoreConfig,
): Promise<LightPostgresProvisioningResult> {
  const cluster = store.lightPostgres?.cluster ?? getClusterName();
  const databaseName = store.lightPostgres?.databaseName ?? store.slug;
  const roleName = store.lightPostgres?.roleName ?? buildLightPostgresRoleName(databaseName);
  const rolePassword = buildStoreRolePassword(databaseName, roleName);

  if (!rolePassword) {
    throw new Error("LIGHT_POSTGRES_STORE_ROLE_PASSWORD_TEMPLATE tanimli degil.");
  }

  const adminDatabaseUrl = getAdminDatabaseUrl();
  const databaseConnectionString = replaceDatabaseName(adminDatabaseUrl, databaseName);

  try {
    await ensureLightPostgresDatabase(adminDatabaseUrl, databaseName);
    await runSql(databaseConnectionString, buildLightPostgresSchemaSql(store));
    await ensureLightPostgresStoreRole(
      adminDatabaseUrl,
      databaseConnectionString,
      databaseName,
      roleName,
      rolePassword,
    );
    writeOptionalAdminEnvLocal(store, databaseName, roleName, rolePassword);
    const readiness = await checkLightPostgresReadinessForStore(store);

    updateStoreLightPostgresConfig(store.slug, {
      cluster,
      databaseName,
      schemaProfile: LIGHT_POSTGRES_SCHEMA_PROFILE,
      provisioningStatus: readiness.ready ? "configured" : "failed",
      umamiReady: true,
      roleName,
      roleStatus: readiness.roleReady && readiness.runtimeConnectReady ? "configured" : "failed",
      schemaStatus: readiness.missingTables.length === 0 ? "ready" : "failed",
      seedStatus:
        readiness.missingSeedKeys.length === 0 &&
        readiness.missingPaymentGatewayKeys.length === 0 &&
        readiness.missingOptionalModules.length === 0
          ? "ready"
          : "failed",
      readinessStatus: readiness.ready ? "ready" : "failed",
      readinessCheckedAt: readiness.checkedAt,
      readinessRepairAction: readiness.nextRepairAction,
      missingTables: readiness.missingTables,
      missingSeedKeys: readiness.missingSeedKeys,
      missingOptionalModules: readiness.missingOptionalModules,
      missingPaymentGatewayKeys: readiness.missingPaymentGatewayKeys,
      missingAuthBridgeTables: readiness.missingAuthBridgeTables,
      lastReadinessError: readiness.ready ? null : readiness.message,
    });

    if (!readiness.ready) {
      throw new Error(readiness.message);
    }

    return {
      cluster,
      databaseName,
      schemaProfile: LIGHT_POSTGRES_SCHEMA_PROFILE,
      roleName,
      readiness,
    };
  } catch (error) {
    updateStoreLightPostgresConfig(store.slug, {
      cluster,
      databaseName,
      schemaProfile: LIGHT_POSTGRES_SCHEMA_PROFILE,
      provisioningStatus: "failed",
      lastProvisionError:
        error instanceof Error
          ? error.message
          : "light_postgres provisioning basarisiz oldu.",
      umamiReady: true,
      roleName,
      roleStatus: "failed",
      schemaStatus: "failed",
      seedStatus: "failed",
      readinessStatus: "failed",
      readinessCheckedAt: new Date().toISOString(),
      readinessRepairAction: "light_postgres provisioning retry calistirilmali.",
      lastReadinessError:
        error instanceof Error
          ? error.message
          : "light_postgres provisioning basarisiz oldu.",
    });

    throw error;
  }
}

export function resolveLightPostgresSchemaPath(): string {
  return path.join(getRepoRoot(), "apps", "owner", "lib", "light-postgres-provisioning.ts");
}
