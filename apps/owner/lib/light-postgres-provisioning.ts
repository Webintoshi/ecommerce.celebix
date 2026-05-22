import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  getRepoRoot,
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

function runPsql(connectionString: string, sql: string): void {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "celebix-light-pg-"));
  const sqlPath = path.join(tempDirectory, "provision.sql");

  try {
    fs.writeFileSync(sqlPath, sql, "utf8");
    execFileSync(
      "psql",
      ["--dbname", connectionString, "--file", sqlPath, "--set", "ON_ERROR_STOP=1", "--quiet"],
      {
        stdio: "pipe",
      },
    );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function buildDatabaseBootstrapSql(databaseName: string): string {
  return `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '${escapeSqlLiteral(databaseName)}') THEN
    EXECUTE format('CREATE DATABASE %I', '${escapeSqlLiteral(databaseName)}');
  END IF;
END
$$;
`;
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
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  brand text NOT NULL DEFAULT '',
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  compare_at_price numeric(12,2),
  currency text NOT NULL DEFAULT 'TRY',
  stock integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  name text NOT NULL DEFAULT 'Varsayilan',
  price numeric(12,2) NOT NULL DEFAULT 0,
  compare_at_price numeric(12,2),
  stock integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
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
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_pages_status ON public.pages(status);

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

INSERT INTO public.settings (key, value)
VALUES
  ('store_info', ${toSqlJsonLiteral(storeInfo)}),
  ('analytics', ${toSqlJsonLiteral(analytics)}),
  ('runtime', ${toSqlJsonLiteral({
    databaseMode: "light_postgres",
    generatedBy: "owner",
    generatedAt: new Date().toISOString(),
  })})
ON CONFLICT (key) DO UPDATE
SET value = excluded.value;
`;
}

function writeOptionalAdminEnvLocal(store: StoreConfig, databaseName: string): void {
  const runtimeDatabaseUrl = buildRuntimeDatabaseUrl(databaseName);

  if (!runtimeDatabaseUrl) {
    return;
  }

  upsertStoreAdminEnvLocal(store.slug, {
    DATABASE_URL: runtimeDatabaseUrl,
    DATABASE_DIRECT_URL: runtimeDatabaseUrl,
    DATABASE_MODE: "light_postgres",
    NEXT_PUBLIC_RUNTIME_DATABASE_MODE: "light_postgres",
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
    runPsql(adminDatabaseUrl, buildDatabaseBootstrapSql(databaseName));
    runPsql(databaseConnectionString, buildLightPostgresSchemaSql(store));
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
