import "server-only";

import { queryAdminLightPostgres } from "@/lib/db/light-postgres-client";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";

let ensureCustomizationSchemaPromise: Promise<boolean> | null = null;

const REQUIRED_CUSTOMIZATION_COLUMNS: Record<string, string[]> = {
  product_customization_schemas: [
    "id",
    "name",
    "description",
    "slug",
    "is_active",
    "sort_order",
    "settings",
    "created_at",
    "updated_at",
    "created_by",
  ],
  product_customization_steps: [
    "id",
    "schema_id",
    "type",
    "key",
    "label",
    "placeholder",
    "help_text",
    "is_required",
    "validation_rules",
    "sort_order",
    "grid_width",
    "style_config",
    "show_conditions",
    "price_config",
    "default_value",
    "created_at",
    "updated_at",
  ],
  product_customization_options: [
    "id",
    "step_id",
    "label",
    "value",
    "description",
    "image_url",
    "icon",
    "color",
    "price_adjustment",
    "price_adjustment_type",
    "stock_quantity",
    "track_stock",
    "show_conditions",
    "sort_order",
    "is_default",
    "is_disabled",
    "dependent_step_ids",
    "created_at",
    "updated_at",
  ],
  product_schema_assignments: [
    "id",
    "schema_id",
    "product_id",
    "is_default",
    "sort_order",
    "created_at",
  ],
  category_schema_assignments: [
    "id",
    "schema_id",
    "category_id",
    "is_auto_apply",
    "created_at",
  ],
};

const REQUIRED_CUSTOMIZATION_TABLES = Object.keys(REQUIRED_CUSTOMIZATION_COLUMNS);

async function customizationSchemaLooksReady() {
  const tableRows = await queryAdminLightPostgres<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [REQUIRED_CUSTOMIZATION_TABLES],
  );
  const existingTables = new Set(tableRows.map((row) => row.table_name));
  if (REQUIRED_CUSTOMIZATION_TABLES.some((tableName) => !existingTables.has(tableName))) {
    return false;
  }

  const columnRows = await queryAdminLightPostgres<{ table_name: string; column_name: string }>(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [REQUIRED_CUSTOMIZATION_TABLES],
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  return Object.entries(REQUIRED_CUSTOMIZATION_COLUMNS).every(([tableName, requiredColumns]) => {
    const columns = columnsByTable.get(tableName);
    return Boolean(columns && requiredColumns.every((columnName) => columns.has(columnName)));
  });
}

export async function maybeEnsureAdminCustomizationSchema() {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  if (!ensureCustomizationSchemaPromise) {
    ensureCustomizationSchemaPromise = (async () => {
      if (await customizationSchemaLooksReady()) {
        return true;
      }

      await queryAdminLightPostgres(`
      create extension if not exists pgcrypto;

      create or replace function public.celebix_set_updated_at()
      returns trigger
      language plpgsql
      as $$
      begin
        new.updated_at = now();
        return new;
      end;
      $$;

      create table if not exists public.product_customization_schemas (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        description text,
        slug text not null unique,
        is_active boolean not null default true,
        sort_order integer not null default 0,
        settings jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        created_by uuid
      );

      create table if not exists public.product_customization_steps (
        id uuid primary key default gen_random_uuid(),
        schema_id uuid not null references public.product_customization_schemas(id) on delete cascade,
        type text not null,
        key text not null,
        label text not null,
        placeholder text,
        help_text text,
        is_required boolean not null default false,
        validation_rules jsonb not null default '{}'::jsonb,
        sort_order integer not null default 0,
        grid_width text not null default 'full',
        style_config jsonb not null default '{}'::jsonb,
        show_conditions jsonb,
        price_config jsonb,
        default_value jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (schema_id, key)
      );

      create table if not exists public.product_customization_options (
        id uuid primary key default gen_random_uuid(),
        step_id uuid not null references public.product_customization_steps(id) on delete cascade,
        label text not null,
        value text not null,
        description text,
        image_url text,
        icon text,
        color text,
        price_adjustment numeric(12,2) not null default 0,
        price_adjustment_type text not null default 'fixed',
        stock_quantity integer,
        track_stock boolean not null default false,
        show_conditions jsonb,
        sort_order integer not null default 0,
        is_default boolean not null default false,
        is_disabled boolean not null default false,
        dependent_step_ids jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists public.product_schema_assignments (
        id uuid primary key default gen_random_uuid(),
        schema_id uuid not null references public.product_customization_schemas(id) on delete cascade,
        product_id uuid not null references public.products(id) on delete cascade,
        is_default boolean not null default false,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        unique (schema_id, product_id)
      );

      create table if not exists public.category_schema_assignments (
        id uuid primary key default gen_random_uuid(),
        schema_id uuid not null references public.product_customization_schemas(id) on delete cascade,
        category_id uuid not null references public.categories(id) on delete cascade,
        is_auto_apply boolean not null default false,
        created_at timestamptz not null default now(),
        unique (schema_id, category_id)
      );

      alter table public.product_schema_assignments
        add column if not exists id uuid,
        add column if not exists is_default boolean not null default false,
        add column if not exists sort_order integer not null default 0,
        add column if not exists created_at timestamptz not null default now();

      update public.product_schema_assignments
      set id = gen_random_uuid()
      where id is null;

      alter table public.product_schema_assignments
        alter column id set default gen_random_uuid();

      alter table public.category_schema_assignments
        add column if not exists id uuid,
        add column if not exists is_auto_apply boolean not null default false,
        add column if not exists created_at timestamptz not null default now();

      update public.category_schema_assignments
      set id = gen_random_uuid()
      where id is null;

      alter table public.category_schema_assignments
        alter column id set default gen_random_uuid();

      alter table public.product_customization_schemas
        add column if not exists description text,
        add column if not exists is_active boolean not null default true,
        add column if not exists sort_order integer not null default 0,
        add column if not exists settings jsonb not null default '{}'::jsonb,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now(),
        add column if not exists created_by uuid;

      alter table public.product_customization_schemas
        alter column id set default gen_random_uuid();

      alter table public.product_customization_steps
        add column if not exists placeholder text,
        add column if not exists help_text text,
        add column if not exists is_required boolean not null default false,
        add column if not exists validation_rules jsonb not null default '{}'::jsonb,
        add column if not exists sort_order integer not null default 0,
        add column if not exists grid_width text not null default 'full',
        add column if not exists style_config jsonb not null default '{}'::jsonb,
        add column if not exists show_conditions jsonb,
        add column if not exists price_config jsonb,
        add column if not exists default_value jsonb,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now();

      alter table public.product_customization_steps
        alter column id set default gen_random_uuid();

      alter table public.product_customization_options
        add column if not exists description text,
        add column if not exists image_url text,
        add column if not exists icon text,
        add column if not exists color text,
        add column if not exists price_adjustment numeric(12,2) not null default 0,
        add column if not exists price_adjustment_type text not null default 'fixed',
        add column if not exists stock_quantity integer,
        add column if not exists track_stock boolean not null default false,
        add column if not exists show_conditions jsonb,
        add column if not exists sort_order integer not null default 0,
        add column if not exists is_default boolean not null default false,
        add column if not exists is_disabled boolean not null default false,
        add column if not exists dependent_step_ids jsonb not null default '[]'::jsonb,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now();

      alter table public.product_customization_options
        alter column id set default gen_random_uuid();

      create index if not exists idx_customization_schemas_sort on public.product_customization_schemas(sort_order, created_at);
      create index if not exists idx_customization_steps_schema on public.product_customization_steps(schema_id, sort_order);
      create index if not exists idx_customization_options_step on public.product_customization_options(step_id, sort_order);
      create index if not exists idx_schema_assignments_product on public.product_schema_assignments(product_id, sort_order);
      create index if not exists idx_schema_assignments_schema on public.product_schema_assignments(schema_id, sort_order);
      create index if not exists idx_category_schema_assignments_category on public.category_schema_assignments(category_id);
      create index if not exists idx_category_schema_assignments_schema on public.category_schema_assignments(schema_id);

      drop trigger if exists product_customization_schemas_set_updated_at on public.product_customization_schemas;
      create trigger product_customization_schemas_set_updated_at
      before update on public.product_customization_schemas
      for each row execute function public.celebix_set_updated_at();

      drop trigger if exists product_customization_steps_set_updated_at on public.product_customization_steps;
      create trigger product_customization_steps_set_updated_at
      before update on public.product_customization_steps
      for each row execute function public.celebix_set_updated_at();

      drop trigger if exists product_customization_options_set_updated_at on public.product_customization_options;
      create trigger product_customization_options_set_updated_at
      before update on public.product_customization_options
      for each row execute function public.celebix_set_updated_at();
      `);

      return true;
    })();
  }

  return ensureCustomizationSchemaPromise;
}
