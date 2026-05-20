import "server-only";

import type { Category, CategoryGEO, CategoryInput } from "@/types/category";
import type { PageGEO, PageInput, StaticPage } from "@/types/page";
import {
  queryLightPostgres,
  queryLightPostgresOne,
} from "@/lib/db/light-postgres-client";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type SettingRow = {
  key: string;
  value: JsonValue | null;
  updated_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parent_id: string | null;
  sort_order: number | string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[] | null;
  created_at: string | null;
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
  seo_keywords: string[] | null;
  faq: JsonValue[] | null;
  geo_data: JsonValue | null;
  is_active: boolean | null;
  sort_order: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type HomepageCurationProductCandidate = {
  id: string;
  category: string | null;
  subcategory: string | null;
};

const EMPTY_CATEGORY_GEO: CategoryGEO = {
  keyTakeaways: [],
  entities: [],
};

const EMPTY_PAGE_GEO: PageGEO = {
  keyTakeaways: [],
  entities: [],
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["1", "true", "t", "yes", "y"].includes(value.trim().toLowerCase());
  }

  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizePageGeo(value: unknown): PageGEO {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_PAGE_GEO;
  }

  const record = value as {
    keyTakeaways?: unknown;
    entities?: unknown;
    cms?: unknown;
  };
  const normalized: PageGEO = {
    keyTakeaways: Array.isArray(record.keyTakeaways)
      ? record.keyTakeaways.filter((entry): entry is string => typeof entry === "string")
      : [],
    entities: Array.isArray(record.entities)
      ? record.entities.filter((entry): entry is string => typeof entry === "string")
      : [],
  };

  if (record.cms && typeof record.cms === "object" && !Array.isArray(record.cms)) {
    const cms = record.cms as { content?: unknown; status?: unknown };
    normalized.cms = {
      content: typeof cms.content === "string" ? cms.content : null,
      status:
        cms.status === "published" || cms.status === "draft" || cms.status === "archived"
          ? cms.status
          : null,
    };
  }

  return normalized;
}

function normalizeCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image,
    icon: null,
    parent_id: row.parent_id,
    sort_order: toNumber(row.sort_order),
    is_active: true,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    seo_keywords: toStringArray(row.seo_keywords),
    faq: [],
    geo_data: EMPTY_CATEGORY_GEO,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}

function normalizePageRow(row: PageRow): StaticPage {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    schema_type: row.schema_type,
    icon: row.icon ?? undefined,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    seo_keywords: toStringArray(row.seo_keywords),
    faq: Array.isArray(row.faq)
      ? row.faq.map((entry) => {
          const record = entry && typeof entry === "object" && !Array.isArray(entry)
            ? (entry as Record<string, unknown>)
            : {};

          return {
            question: typeof record.question === "string" ? record.question : "",
            answer: typeof record.answer === "string" ? record.answer : "",
          };
        })
      : [],
    geo_data: normalizePageGeo(row.geo_data),
    is_active: toBoolean(row.is_active, true),
    sort_order: toNumber(row.sort_order),
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
  };
}

function mapAdapterError(error: unknown, fallbackMessage: string): never {
  if (error && typeof error === "object" && "code" in error) {
    throw error;
  }

  throw new Error(fallbackMessage);
}

function duplicateSlugError(message: string) {
  const error = new Error(message) as Error & { code: string };
  error.code = "23505";
  return error;
}

export async function listLightPostgresSettingRows(): Promise<SettingRow[]> {
  return queryLightPostgres<SettingRow>(
    `
      select key, value, updated_at
      from public.settings
      order by key asc
    `,
  );
}

export async function getLightPostgresSettingRow(
  key: string,
): Promise<SettingRow | null> {
  return queryLightPostgresOne<SettingRow>(
    `
      select key, value, updated_at
      from public.settings
      where key = $1
      limit 1
    `,
    [key],
  );
}

export async function upsertLightPostgresSettingRow(
  key: string,
  value: Record<string, unknown>,
): Promise<SettingRow> {
  const row = await queryLightPostgresOne<SettingRow>(
    `
      insert into public.settings (key, value)
      values ($1, $2::jsonb)
      on conflict (key)
      do update set value = excluded.value, updated_at = now()
      returning key, value, updated_at
    `,
    [key, JSON.stringify(value ?? {})],
  );

  if (!row) {
    throw new Error("Setting upsert sonucu bos dondu.");
  }

  return row;
}

export async function deleteLightPostgresSettingRow(key: string): Promise<boolean> {
  await queryLightPostgres(
    `
      delete from public.settings
      where key = $1
    `,
    [key],
  );

  return true;
}

export async function getLightPostgresHomepageCatalogSnapshot(): Promise<{
  categories: Array<{ slug: string; is_active: boolean }>;
  products: HomepageCurationProductCandidate[];
}> {
  const [categories, products] = await Promise.all([
    queryLightPostgres<{ slug: string }>(
      `
        select slug
        from public.categories
        order by sort_order asc, id asc
      `,
    ),
    queryLightPostgres<HomepageCurationProductCandidate>(
      `
        select id, category, subcategory
        from public.products
        order by created_at asc, id asc
      `,
    ),
  ]);

  return {
    categories: categories.map((category) => ({
      slug: category.slug,
      is_active: true,
    })),
    products,
  };
}

export async function listLightPostgresCategories(): Promise<Category[]> {
  const rows = await queryLightPostgres<CategoryRow>(
    `
      select id, name, slug, description, image, parent_id, sort_order,
             seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             created_at, updated_at
      from public.categories
      order by sort_order asc, id asc
    `,
  );

  return rows.map(normalizeCategoryRow);
}

export async function getLightPostgresCategoryById(
  id: string,
): Promise<Category | null> {
  const row = await queryLightPostgresOne<CategoryRow>(
    `
      select id, name, slug, description, image, parent_id, sort_order,
             seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             created_at, updated_at
      from public.categories
      where id = $1
      limit 1
    `,
    [id],
  );

  return row ? normalizeCategoryRow(row) : null;
}

export async function getLightPostgresCategoryBySlug(
  slug: string,
): Promise<Category | null> {
  const row = await queryLightPostgresOne<CategoryRow>(
    `
      select id, name, slug, description, image, parent_id, sort_order,
             seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             created_at, updated_at
      from public.categories
      where slug = $1
      limit 1
    `,
    [slug],
  );

  return row ? normalizeCategoryRow(row) : null;
}

export async function createLightPostgresCategory(
  input: CategoryInput,
): Promise<Category> {
  try {
    const row = await queryLightPostgresOne<CategoryRow>(
      `
        insert into public.categories (
          name,
          slug,
          description,
          image,
          parent_id,
          sort_order,
          seo_title,
          seo_description,
          seo_keywords
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[])
        returning id, name, slug, description, image, parent_id, sort_order,
                  seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
                  created_at, updated_at
      `,
      [
        input.name ?? "",
        input.slug ?? "",
        input.description ?? null,
        input.image ?? null,
        input.parent_id ?? null,
        input.sort_order ?? 0,
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.seo_keywords ?? [],
      ],
    );

    if (!row) {
      throw new Error("Kategori olusturma sonucu bos dondu.");
    }

    return normalizeCategoryRow(row);
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Category with this slug already exists");
    }

    mapAdapterError(error, "Failed to create category");
  }
}

export async function updateLightPostgresCategory(
  id: string,
  input: CategoryInput,
): Promise<Category | null> {
  try {
    const row = await queryLightPostgresOne<CategoryRow>(
      `
        update public.categories
        set
          name = coalesce($2, name),
          slug = coalesce($3, slug),
          description = $4,
          image = $5,
          parent_id = $6,
          sort_order = coalesce($7, sort_order),
          seo_title = $8,
          seo_description = $9,
          seo_keywords = $10::text[]
        where id = $1
        returning id, name, slug, description, image, parent_id, sort_order,
                  seo_title, seo_description, coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
                  created_at, updated_at
      `,
      [
        id,
        input.name ?? null,
        input.slug ?? null,
        input.description ?? null,
        input.image ?? null,
        input.parent_id ?? null,
        input.sort_order ?? null,
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.seo_keywords ?? [],
      ],
    );

    return row ? normalizeCategoryRow(row) : null;
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Category with this slug already exists");
    }

    mapAdapterError(error, "Failed to update category");
  }
}

async function getLightPostgresChildCategoryIds(parentId: string): Promise<string[]> {
  const rows = await queryLightPostgres<{ id: string }>(
    `
      select id
      from public.categories
      where parent_id = $1
    `,
    [parentId],
  );

  return rows.map((row) => row.id);
}

export async function deleteLightPostgresCategoryHierarchy(
  categoryId: string,
): Promise<void> {
  const childIds = await getLightPostgresChildCategoryIds(categoryId);

  for (const childId of childIds) {
    await deleteLightPostgresCategoryHierarchy(childId);
  }

  await queryLightPostgres(
    `
      delete from public.categories
      where id = $1
    `,
    [categoryId],
  );
}

export async function listLightPostgresPages(
  includeInactive = false,
): Promise<StaticPage[]> {
  const rows = await queryLightPostgres<PageRow>(
    `
      select id, name, slug, schema_type, icon, seo_title, seo_description,
             coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             coalesce(faq, '[]'::jsonb) as faq,
             coalesce(geo_data, '{"keyTakeaways": [], "entities": []}'::jsonb) as geo_data,
             coalesce(is_active, true) as is_active,
             sort_order, created_at, updated_at
      from public.pages
      ${includeInactive ? "" : "where coalesce(is_active, true) = true"}
      order by sort_order asc, id asc
    `,
  );

  return rows.map(normalizePageRow);
}

export async function getLightPostgresPageById(
  id: string,
): Promise<StaticPage | null> {
  const row = await queryLightPostgresOne<PageRow>(
    `
      select id, name, slug, schema_type, icon, seo_title, seo_description,
             coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             coalesce(faq, '[]'::jsonb) as faq,
             coalesce(geo_data, '{"keyTakeaways": [], "entities": []}'::jsonb) as geo_data,
             coalesce(is_active, true) as is_active,
             sort_order, created_at, updated_at
      from public.pages
      where id = $1
      limit 1
    `,
    [id],
  );

  return row ? normalizePageRow(row) : null;
}

export async function getLightPostgresPageBySlug(
  slug: string,
  includeInactive = false,
): Promise<StaticPage | null> {
  const row = await queryLightPostgresOne<PageRow>(
    `
      select id, name, slug, schema_type, icon, seo_title, seo_description,
             coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
             coalesce(faq, '[]'::jsonb) as faq,
             coalesce(geo_data, '{"keyTakeaways": [], "entities": []}'::jsonb) as geo_data,
             coalesce(is_active, true) as is_active,
             sort_order, created_at, updated_at
      from public.pages
      where slug = $1
        ${includeInactive ? "" : "and coalesce(is_active, true) = true"}
      limit 1
    `,
    [slug],
  );

  return row ? normalizePageRow(row) : null;
}

export async function createLightPostgresPage(
  input: PageInput,
): Promise<StaticPage> {
  try {
    const row = await queryLightPostgresOne<PageRow>(
      `
        insert into public.pages (
          name,
          slug,
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
        values ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9::jsonb, $10, $11)
        returning id, name, slug, schema_type, icon, seo_title, seo_description,
                  coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
                  coalesce(faq, '[]'::jsonb) as faq,
                  coalesce(geo_data, '{"keyTakeaways": [], "entities": []}'::jsonb) as geo_data,
                  coalesce(is_active, true) as is_active,
                  sort_order, created_at, updated_at
      `,
      [
        input.name ?? "",
        input.slug ?? "",
        input.schema_type ?? "WebPage",
        input.icon ?? null,
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.seo_keywords ?? [],
        JSON.stringify(input.faq ?? []),
        JSON.stringify(input.geo_data ?? EMPTY_PAGE_GEO),
        input.is_active ?? true,
        input.sort_order ?? 0,
      ],
    );

    if (!row) {
      throw new Error("Sayfa olusturma sonucu bos dondu.");
    }

    return normalizePageRow(row);
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Page with this slug already exists");
    }

    mapAdapterError(error, "Failed to create page");
  }
}

export async function updateLightPostgresPage(
  id: string,
  input: PageInput,
): Promise<StaticPage | null> {
  try {
    const row = await queryLightPostgresOne<PageRow>(
      `
        update public.pages
        set
          name = coalesce($2, name),
          slug = coalesce($3, slug),
          schema_type = coalesce($4, schema_type),
          icon = $5,
          seo_title = $6,
          seo_description = $7,
          seo_keywords = $8::text[],
          faq = $9::jsonb,
          geo_data = $10::jsonb,
          is_active = coalesce($11, is_active),
          sort_order = coalesce($12, sort_order)
        where id = $1
        returning id, name, slug, schema_type, icon, seo_title, seo_description,
                  coalesce(seo_keywords, '{}'::text[]) as seo_keywords,
                  coalesce(faq, '[]'::jsonb) as faq,
                  coalesce(geo_data, '{"keyTakeaways": [], "entities": []}'::jsonb) as geo_data,
                  coalesce(is_active, true) as is_active,
                  sort_order, created_at, updated_at
      `,
      [
        id,
        input.name ?? null,
        input.slug ?? null,
        input.schema_type ?? null,
        input.icon ?? null,
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.seo_keywords ?? [],
        JSON.stringify(input.faq ?? []),
        JSON.stringify(input.geo_data ?? EMPTY_PAGE_GEO),
        input.is_active ?? null,
        input.sort_order ?? null,
      ],
    );

    return row ? normalizePageRow(row) : null;
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Page with this slug already exists");
    }

    mapAdapterError(error, "Failed to update page");
  }
}

export async function deleteLightPostgresPage(id: string): Promise<boolean> {
  await queryLightPostgres(
    `
      delete from public.pages
      where id = $1
    `,
    [id],
  );

  return true;
}
