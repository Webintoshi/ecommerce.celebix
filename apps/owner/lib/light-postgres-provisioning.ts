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
  schemaProfile: "storefront_core";
  lastError?: string;
}

export interface LightPostgresProvisioningResult {
  cluster: string;
  databaseName: string;
  schemaProfile: "storefront_core";
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
  "product_customization_schemas",
  "product_customization_steps",
  "product_customization_options",
  "product_schema_assignments",
  "category_schema_assignments",
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
  return process.env.LIGHT_POSTGRES_DATABASE_URL_TEMPLATE?.trim() || null;
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

function buildRuntimeDatabaseUrl(databaseName: string): string | null {
  const template = getRuntimeDatabaseUrlTemplate();

  if (!template) {
    return null;
  }

  return template.replace(/\$\{database\}/g, databaseName);
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

CREATE TABLE IF NOT EXISTS public.product_customization_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.product_customization_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id uuid NOT NULL REFERENCES public.product_customization_schemas(id) ON DELETE CASCADE,
  type text NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  placeholder text,
  help_text text,
  is_required boolean NOT NULL DEFAULT false,
  validation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  grid_width text NOT NULL DEFAULT 'full',
  style_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  show_conditions jsonb,
  price_config jsonb,
  default_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_id, key)
);

CREATE TABLE IF NOT EXISTS public.product_customization_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.product_customization_steps(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  description text,
  image_url text,
  icon text,
  color text,
  price_adjustment numeric(12,2) NOT NULL DEFAULT 0,
  price_adjustment_type text NOT NULL DEFAULT 'fixed',
  stock_quantity integer,
  track_stock boolean NOT NULL DEFAULT false,
  show_conditions jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_disabled boolean NOT NULL DEFAULT false,
  dependent_step_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_schema_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id uuid NOT NULL REFERENCES public.product_customization_schemas(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.category_schema_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id uuid NOT NULL REFERENCES public.product_customization_schemas(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_auto_apply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schema_id, category_id)
);

ALTER TABLE public.product_schema_assignments
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.product_schema_assignments
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.product_schema_assignments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.category_schema_assignments
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS is_auto_apply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.category_schema_assignments
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.category_schema_assignments
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.product_customization_schemas
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.product_customization_steps
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.product_customization_options
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

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

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_customization_schemas_sort ON public.product_customization_schemas(sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_customization_steps_schema ON public.product_customization_steps(schema_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_customization_options_step ON public.product_customization_options(step_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_schema_assignments_product ON public.product_schema_assignments(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_schema_assignments_schema ON public.product_schema_assignments(schema_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_category_schema_assignments_category ON public.category_schema_assignments(category_id);
CREATE INDEX IF NOT EXISTS idx_category_schema_assignments_schema ON public.category_schema_assignments(schema_id);
CREATE INDEX IF NOT EXISTS idx_pages_sort_order ON public.pages(sort_order);

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

DROP TRIGGER IF EXISTS product_customization_schemas_set_updated_at ON public.product_customization_schemas;
CREATE TRIGGER product_customization_schemas_set_updated_at
BEFORE UPDATE ON public.product_customization_schemas
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS product_customization_steps_set_updated_at ON public.product_customization_steps;
CREATE TRIGGER product_customization_steps_set_updated_at
BEFORE UPDATE ON public.product_customization_steps
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS product_customization_options_set_updated_at ON public.product_customization_options;
CREATE TRIGGER product_customization_options_set_updated_at
BEFORE UPDATE ON public.product_customization_options
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS settings_set_updated_at ON public.settings;
CREATE TRIGGER settings_set_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.celebix_set_updated_at();

DROP TRIGGER IF EXISTS pages_set_updated_at ON public.pages;
CREATE TRIGGER pages_set_updated_at
BEFORE UPDATE ON public.pages
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
  })})
ON CONFLICT (key) DO UPDATE
SET value = excluded.value;

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

function writeOptionalAdminEnvLocal(store: StoreConfig, databaseName: string): void {
  const runtimeDatabaseUrl = buildRuntimeDatabaseUrl(databaseName);
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
  const hasAdminDatabaseUrl = Boolean(process.env.LIGHT_POSTGRES_ADMIN_DATABASE_URL?.trim());
  const hasRuntimeDatabaseTemplate = Boolean(getRuntimeDatabaseUrlTemplate());
  const configured = hasAdminDatabaseUrl;

  return {
    configured,
    cluster: getClusterName(),
    hasAdminDatabaseUrl,
    hasRuntimeDatabaseTemplate,
    schemaProfile: "storefront_core",
    lastError: configured
      ? undefined
      : "light_postgres icin LIGHT_POSTGRES_ADMIN_DATABASE_URL gerekli.",
  };
}

export async function provisionLightPostgresForStore(
  store: StoreConfig,
): Promise<LightPostgresProvisioningResult> {
  const cluster = store.lightPostgres?.cluster ?? getClusterName();
  const databaseName = store.lightPostgres?.databaseName ?? store.slug;
  const adminDatabaseUrl = getAdminDatabaseUrl();
  const databaseConnectionString = replaceDatabaseName(adminDatabaseUrl, databaseName);

  try {
    await ensureLightPostgresDatabase(adminDatabaseUrl, databaseName);
    await runSql(databaseConnectionString, buildLightPostgresSchemaSql(store));
    writeOptionalAdminEnvLocal(store, databaseName);

    updateStoreLightPostgresConfig(store.slug, {
      cluster,
      databaseName,
      schemaProfile: "storefront_core",
      provisioningStatus: "configured",
      umamiReady: true,
    });

    return {
      cluster,
      databaseName,
      schemaProfile: "storefront_core",
    };
  } catch (error) {
    updateStoreLightPostgresConfig(store.slug, {
      cluster,
      databaseName,
      schemaProfile: "storefront_core",
      provisioningStatus: "failed",
      lastProvisionError:
        error instanceof Error
          ? error.message
          : "light_postgres provisioning basarisiz oldu.",
      umamiReady: true,
    });

    throw error;
  }
}

export function resolveLightPostgresSchemaPath(): string {
  return path.join(getRepoRoot(), "apps", "owner", "lib", "light-postgres-provisioning.ts");
}
