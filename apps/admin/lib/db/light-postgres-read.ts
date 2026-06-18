import "server-only";

import {
  getLightPostgresCustomizationSchemaDetailById,
  getLightPostgresCustomizationSchemaForProduct,
  listLightPostgresCustomizationSchemas,
  type LightPostgresCustomizationSchemaDetail,
  type LightPostgresCustomizationSchemaPayload,
  type LightPostgresCustomizationSchemaSummary,
} from "../../../../packages/platform-config/src/light-postgres-customization-read";
import { queryAdminLightPostgres, queryAdminLightPostgresOne } from "@/lib/db/light-postgres-client";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export interface AdminLightPostgresSettingRow {
  key: string;
  value: JsonValue | null;
  updated_at: string | null;
}

export interface AdminLightPostgresPageRow {
  id: string;
  name: string;
  slug: string;
  schema_type: string;
  icon: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  faq: JsonValue[] | null;
  geo_data: JsonValue | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminLightPostgresAssignableProduct {
  id: string;
  name: string;
  slug: string;
  category: string | null;
}

export interface AdminLightPostgresAssignableCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
}

type SettingRow = {
  key: string;
  value: unknown;
  updated_at: string | null;
};

type PageRow = {
  id: string;
  name: string;
  slug: string;
  schema_type: string;
  icon: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: unknown;
  faq: unknown;
  geo_data: unknown;
  is_active: unknown;
  sort_order: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type AssignableProductRow = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
};

type AssignableCategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: unknown;
};

function normalizeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["true", "t", "1", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return false;
}

function normalizeJsonValue(value: unknown): JsonValue | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeJsonValue(entry))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>).flatMap(
      ([key, entry]) => {
        const normalized = normalizeJsonValue(entry);
        return normalized === undefined ? [] : [[key, normalized] as const];
      },
    );

    return Object.fromEntries(normalizedEntries);
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function mapSettingRow(row: SettingRow): AdminLightPostgresSettingRow {
  return {
    key: row.key,
    value: normalizeJsonValue(row.value),
    updated_at: row.updated_at,
  };
}

function mapPageRow(row: PageRow): AdminLightPostgresPageRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    schema_type: row.schema_type,
    icon: row.icon,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    seo_keywords: normalizeStringArray(row.seo_keywords),
    faq: Array.isArray(row.faq)
      ? row.faq
          .map((entry) => normalizeJsonValue(entry))
          .filter((entry): entry is JsonValue => entry !== undefined)
      : null,
    geo_data: normalizeJsonValue(row.geo_data),
    is_active: normalizeBoolean(row.is_active),
    sort_order: normalizeNumber(row.sort_order),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function executeLightPostgres<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
) {
  return queryAdminLightPostgres<TRow>(sql, params);
}

export async function maybeGetAdminSetting(key: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const row = await queryAdminLightPostgresOne<SettingRow>(
    `
      select key, value, updated_at
      from public.settings
      where key = $1
      limit 1
    `,
    [key],
  );

  return row ? mapSettingRow(row).value : null;
}

export async function maybeSetAdminSetting(key: string, value: JsonValue | Record<string, unknown> | null) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const row = await queryAdminLightPostgresOne<SettingRow>(
    `
      insert into public.settings (key, value, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (key) do update
      set value = excluded.value,
          updated_at = now()
      returning key, value, updated_at
    `,
    [key, JSON.stringify(normalizeJsonValue(value))],
  );

  return row ? mapSettingRow(row) : null;
}

export async function maybeDeleteAdminSetting(key: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  await executeLightPostgres(
    `
      delete from public.settings
      where key = $1
    `,
    [key],
  );

  return true;
}

export async function maybeGetAllAdminSettings() {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const rows = await queryAdminLightPostgres<SettingRow>(
    `
      select key, value, updated_at
      from public.settings
    `,
  );

  return rows.map(mapSettingRow);
}

export async function maybeListAdminPages(includeInactive = false) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const rows = await queryAdminLightPostgres<PageRow>(
    `
      select
        id,
        name,
        slug,
        schema_type,
        null::text as icon,
        seo_title,
        seo_description,
        seo_keywords,
        faq,
        geo_data,
        is_active,
        sort_order,
        created_at,
        updated_at
      from public.pages
      ${includeInactive ? "" : "where is_active = true"}
      order by sort_order asc, name asc
    `,
  );

  return rows.map(mapPageRow);
}

export async function maybeGetAdminPageById(id: string) {
  const pages = await maybeListAdminPages(true);
  if (pages === undefined) {
    return undefined;
  }

  return pages.find((page) => page.id === id) ?? null;
}

export async function maybeGetAdminPageBySlug(slug: string, includeInactive = false) {
  const pages = await maybeListAdminPages(includeInactive);
  if (pages === undefined) {
    return undefined;
  }

  return pages.find((page) => page.slug === slug) ?? null;
}

export async function maybeListAdminAssignableProducts() {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const rows = await queryAdminLightPostgres<AssignableProductRow>(
    `
      select id, name, slug, category
      from public.products
      order by name asc
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
  })) as AdminLightPostgresAssignableProduct[];
}

export async function maybeListAdminAssignableCategories() {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  const rows = await queryAdminLightPostgres<AssignableCategoryRow>(
    `
      select id, name, slug, parent_id, sort_order
      from public.categories
      order by sort_order asc, name asc
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parent_id,
    sort_order: normalizeNumber(row.sort_order),
  })) as AdminLightPostgresAssignableCategory[];
}

export async function maybeListAdminCustomizationSchemas() {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  try {
    return await listLightPostgresCustomizationSchemas(
      executeLightPostgres,
    ) as LightPostgresCustomizationSchemaSummary[];
  } catch (error) {
    if (isMissingDatabaseObjectError(error)) {
      return [];
    }

    throw error;
  }
}

export async function maybeGetAdminCustomizationSchemaById(id: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  try {
    return await getLightPostgresCustomizationSchemaDetailById(
      executeLightPostgres,
      id,
    ) as LightPostgresCustomizationSchemaDetail | null;
  } catch (error) {
    if (isMissingDatabaseObjectError(error)) {
      return null;
    }

    throw error;
  }
}

export async function maybeGetAdminCustomizationSchemaForProduct(productId: string) {
  if (!shouldUseLightPostgresAdmin()) {
    return undefined;
  }

  try {
    return await getLightPostgresCustomizationSchemaForProduct(
      executeLightPostgres,
      productId,
    ) as LightPostgresCustomizationSchemaPayload | null;
  } catch (error) {
    if (isMissingDatabaseObjectError(error)) {
      return null;
    }

    throw error;
  }
}
