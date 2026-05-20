import "server-only";

import type { Category, CategoryGEO, CategoryInput } from "@/types/category";
import type { PageGEO, PageInput, StaticPage } from "@/types/page";
import type { PoolClient, QueryResultRow } from "pg";
import {
  queryLightPostgres,
  queryLightPostgresOne,
  withLightPostgresTransaction,
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

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[] | null;
  images_v2: JsonValue[] | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  is_bestseller: boolean | null;
  is_active: boolean | null;
  is_new: boolean | null;
  vegan: boolean | null;
  gluten_free: boolean | null;
  sugar_free: boolean | null;
  high_protein: boolean | null;
  rating: number | string | null;
  review_count: number | string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string | null;
  is_draft: boolean | null;
  published_at: string | null;
  tax_rate: number | string | null;
  brand: string | null;
  country_of_origin: string | null;
  sku: string | null;
  gtin: string | null;
  dimensions: JsonValue | null;
  related_products: string[] | null;
  complementary_products: string[] | null;
  seo_keywords: string[] | null;
  seo_focus_keyword: string | null;
  og_image: string | null;
  canonical_url: string | null;
  seo_robots: string | null;
  track_stock: boolean | null;
  low_stock_threshold: number | string | null;
  allergens: string[] | null;
  nutrition_basis: string | null;
  serving_size: number | string | null;
  serving_per_container: number | string | null;
  vitamins: JsonValue | null;
  ingredients: string | null;
  storage_conditions: string | null;
  shelf_life_days: number | string | null;
  calories: number | string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  fiber: number | string | null;
  sugar: number | string | null;
  saturated_fat: number | string | null;
  sodium: number | string | null;
  shopify_metadata: JsonValue | null;
  shopify_metafields: JsonValue | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | string | null;
  original_price: number | string | null;
  stock: number | string | null;
  weight: string | null;
  cost: number | string | null;
  barcode: string | null;
  group_name: string | null;
  images: string[] | null;
  unit: string | null;
  max_purchase_quantity: number | string | null;
  warehouse_location: string | null;
  attributes: JsonValue[] | null;
  shopify_metadata: JsonValue | null;
  created_at: string | null;
};

export type LightPostgresProductRecord = ProductRow & {
  variants: ProductVariantRow[];
  discount_rules: JsonValue[];
};

export type LightPostgresProductListOptions = {
  category?: string | null;
  matchedProductIds?: string[] | null;
  featured?: boolean;
  bestseller?: boolean;
};

export type LightPostgresProductMutationPayload = {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  short_description?: string | null;
  images?: string[];
  images_v2?: JsonValue[];
  category?: string | null;
  subcategory?: string | null;
  tags?: string[];
  is_active?: boolean;
  is_featured?: boolean;
  is_bestseller?: boolean;
  is_new?: boolean;
  vegan?: boolean;
  gluten_free?: boolean;
  sugar_free?: boolean;
  high_protein?: boolean;
  rating?: number;
  review_count?: number;
  status?: string | null;
  is_draft?: boolean;
  published_at?: string | null;
  tax_rate?: number;
  brand?: string | null;
  country_of_origin?: string | null;
  sku?: string | null;
  gtin?: string | null;
  dimensions?: Record<string, unknown>;
  related_products?: string[];
  complementary_products?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[];
  seo_focus_keyword?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
  seo_robots?: string | null;
  track_stock?: boolean;
  low_stock_threshold?: number;
  allergens?: string[];
  nutrition_basis?: string | null;
  serving_size?: number;
  serving_per_container?: number;
  vitamins?: Record<string, unknown>;
  ingredients?: string | null;
  storage_conditions?: string | null;
  shelf_life_days?: number | null;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  saturated_fat?: number;
  sodium?: number;
  shopify_metadata?: Record<string, unknown>;
  shopify_metafields?: Record<string, unknown>;
};

export type LightPostgresProductVariantMutationPayload = {
  id?: string | null;
  name?: string | null;
  sku?: string | null;
  price?: number;
  original_price?: number | null;
  stock?: number;
  weight?: string | number | null;
  cost?: number | null;
  barcode?: string | null;
  group_name?: string | null;
  images?: string[];
  unit?: string | null;
  max_purchase_quantity?: number | null;
  warehouse_location?: string | null;
  attributes?: JsonValue[];
  shopify_metadata?: Record<string, unknown>;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonObjectValue(value: unknown): { [key: string]: JsonValue } {
  return isPlainObject(value) ? (value as { [key: string]: JsonValue }) : {};
}

function toJsonArrayValue(value: unknown): JsonValue[] {
  return Array.isArray(value) ? (value as JsonValue[]) : [];
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toNumber(value);
}

function normalizeProductRow(row: ProductRow): ProductRow {
  return {
    ...row,
    images: toStringArray(row.images),
    images_v2: toJsonArrayValue(row.images_v2),
    tags: toStringArray(row.tags),
    is_featured: toBoolean(row.is_featured),
    is_bestseller: toBoolean(row.is_bestseller),
    is_active: toBoolean(row.is_active, true),
    is_new: toBoolean(row.is_new),
    vegan: toBoolean(row.vegan),
    gluten_free: toBoolean(row.gluten_free),
    sugar_free: toBoolean(row.sugar_free),
    high_protein: toBoolean(row.high_protein),
    rating: toNumber(row.rating, 0),
    review_count: toNumber(row.review_count, 0),
    tax_rate: toNumber(row.tax_rate, 0),
    dimensions: toJsonObjectValue(row.dimensions),
    related_products: toStringArray(row.related_products),
    complementary_products: toStringArray(row.complementary_products),
    seo_keywords: toStringArray(row.seo_keywords),
    track_stock: toBoolean(row.track_stock, true),
    low_stock_threshold: toNumber(row.low_stock_threshold, 10),
    allergens: toStringArray(row.allergens),
    serving_size: toNumber(row.serving_size, 100),
    serving_per_container: toNumber(row.serving_per_container, 1),
    vitamins: toJsonObjectValue(row.vitamins),
    shelf_life_days: toNullableNumber(row.shelf_life_days),
    calories: toNumber(row.calories, 0),
    protein: toNumber(row.protein, 0),
    carbs: toNumber(row.carbs, 0),
    fat: toNumber(row.fat, 0),
    fiber: toNumber(row.fiber, 0),
    sugar: toNumber(row.sugar, 0),
    saturated_fat: toNumber(row.saturated_fat, 0),
    sodium: toNumber(row.sodium, 0),
    shopify_metadata: toJsonObjectValue(row.shopify_metadata),
    shopify_metafields: toJsonObjectValue(row.shopify_metafields),
  };
}

function normalizeProductVariantRow(row: ProductVariantRow): ProductVariantRow {
  return {
    ...row,
    price: toNumber(row.price, 0),
    original_price: toNullableNumber(row.original_price),
    stock: toNumber(row.stock, 0),
    cost: toNullableNumber(row.cost),
    images: toStringArray(row.images),
    max_purchase_quantity: toNullableNumber(row.max_purchase_quantity),
    attributes: toJsonArrayValue(row.attributes),
    shopify_metadata: toJsonObjectValue(row.shopify_metadata),
  };
}

function groupVariantsByProductId(
  rows: ProductVariantRow[],
): Map<string, ProductVariantRow[]> {
  const grouped = new Map<string, ProductVariantRow[]>();

  for (const row of rows) {
    const normalized = normalizeProductVariantRow(row);
    const existing = grouped.get(normalized.product_id);
    if (existing) {
      existing.push(normalized);
    } else {
      grouped.set(normalized.product_id, [normalized]);
    }
  }

  return grouped;
}

function attachVariantsToProducts(
  productRows: ProductRow[],
  variantRows: ProductVariantRow[],
): LightPostgresProductRecord[] {
  const variantsByProductId = groupVariantsByProductId(variantRows);

  return productRows.map((row) => ({
    ...normalizeProductRow(row),
    variants: variantsByProductId.get(row.id) ?? [],
    discount_rules: [],
  }));
}

async function queryLightPostgresWithClient<
  TRow extends QueryResultRow = QueryResultRow,
>(
  client: PoolClient,
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow[]> {
  const result = await client.query<TRow>(text, [...params]);
  return result.rows;
}

async function queryLightPostgresOneWithClient<
  TRow extends QueryResultRow = QueryResultRow,
>(
  client: PoolClient,
  text: string,
  params: readonly unknown[] = [],
): Promise<TRow | null> {
  const [row] = await queryLightPostgresWithClient<TRow>(client, text, params);
  return row ?? null;
}

async function fetchLightPostgresVariantsByProductIds(
  productIds: string[],
): Promise<ProductVariantRow[]> {
  if (productIds.length === 0) {
    return [];
  }

  return queryLightPostgres<ProductVariantRow>(
    `
      select id, product_id, name, sku, price, original_price, stock, weight, cost,
             barcode, group_name, images, unit, max_purchase_quantity,
             warehouse_location, attributes, shopify_metadata, created_at
      from public.product_variants
      where product_id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [productIds],
  );
}

async function fetchLightPostgresVariantsByProductIdsWithClient(
  client: PoolClient,
  productIds: string[],
): Promise<ProductVariantRow[]> {
  if (productIds.length === 0) {
    return [];
  }

  return queryLightPostgresWithClient<ProductVariantRow>(
    client,
    `
      select id, product_id, name, sku, price, original_price, stock, weight, cost,
             barcode, group_name, images, unit, max_purchase_quantity,
             warehouse_location, attributes, shopify_metadata, created_at
      from public.product_variants
      where product_id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [productIds],
  );
}

async function getLightPostgresProductByIdWithClient(
  client: PoolClient,
  id: string,
): Promise<LightPostgresProductRecord | null> {
  const row = await queryLightPostgresOneWithClient<ProductRow>(
    client,
    `
      select *
      from public.products
      where id = $1
      limit 1
    `,
    [id],
  );

  if (!row) {
    return null;
  }

  const variants = await fetchLightPostgresVariantsByProductIdsWithClient(client, [row.id]);
  return attachVariantsToProducts([row], variants)[0] ?? null;
}

function buildProductListWhereClause(
  options: LightPostgresProductListOptions,
): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (options.category) {
    params.push(options.category);
    clauses.push(`category = $${params.length}`);
  }

  if (options.matchedProductIds && options.matchedProductIds.length > 0) {
    params.push(options.matchedProductIds);
    clauses.push(`id = any($${params.length}::uuid[])`);
  }

  if (options.featured) {
    clauses.push("coalesce(is_featured, false) = true");
  }

  if (options.bestseller) {
    clauses.push("coalesce(is_bestseller, false) = true");
  }

  return {
    whereSql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    params,
  };
}

function buildProductInsertParams(
  payload: LightPostgresProductMutationPayload,
): unknown[] {
  return [
    payload.name ?? "",
    payload.slug ?? "",
    payload.description ?? null,
    payload.short_description ?? null,
    payload.images ?? [],
    JSON.stringify(payload.images_v2 ?? []),
    payload.category ?? null,
    payload.subcategory ?? null,
    payload.tags ?? [],
    payload.is_featured ?? false,
    payload.is_bestseller ?? false,
    payload.is_active ?? true,
    payload.is_new ?? false,
    payload.vegan ?? false,
    payload.gluten_free ?? false,
    payload.sugar_free ?? false,
    payload.high_protein ?? false,
    payload.rating ?? 5,
    payload.review_count ?? 0,
    payload.seo_title ?? null,
    payload.seo_description ?? null,
    payload.status ?? "published",
    payload.is_draft ?? false,
    payload.published_at ?? null,
    payload.tax_rate ?? 0,
    payload.brand ?? null,
    payload.country_of_origin ?? "Türkiye",
    payload.sku ?? null,
    payload.gtin ?? null,
    JSON.stringify(payload.dimensions ?? {}),
    payload.related_products ?? [],
    payload.complementary_products ?? [],
    payload.seo_keywords ?? [],
    payload.seo_focus_keyword ?? null,
    payload.og_image ?? null,
    payload.canonical_url ?? null,
    payload.seo_robots ?? "index,follow",
    payload.track_stock ?? true,
    payload.low_stock_threshold ?? 10,
    payload.allergens ?? [],
    payload.nutrition_basis ?? "per_100g",
    payload.serving_size ?? 100,
    payload.serving_per_container ?? 1,
    JSON.stringify(payload.vitamins ?? {}),
    payload.ingredients ?? null,
    payload.storage_conditions ?? null,
    payload.shelf_life_days ?? null,
    payload.calories ?? 0,
    payload.protein ?? 0,
    payload.carbs ?? 0,
    payload.fat ?? 0,
    payload.fiber ?? 0,
    payload.sugar ?? 0,
    payload.saturated_fat ?? 0,
    payload.sodium ?? 0,
    JSON.stringify(payload.shopify_metadata ?? {}),
    JSON.stringify(payload.shopify_metafields ?? {}),
  ];
}

function buildProductUpdateAssignments(
  payload: LightPostgresProductMutationPayload,
): Array<{ sql: string; value: unknown }> {
  const assignments: Array<{ sql: string; value: unknown }> = [];
  const push = (sql: string, value: unknown) => {
    assignments.push({ sql, value });
  };

  if ("name" in payload) push("name = $%d", payload.name ?? "");
  if ("slug" in payload) push("slug = $%d", payload.slug ?? "");
  if ("description" in payload) push("description = $%d", payload.description ?? null);
  if ("short_description" in payload) push("short_description = $%d", payload.short_description ?? null);
  if ("images" in payload) push("images = $%d::text[]", payload.images ?? []);
  if ("images_v2" in payload) push("images_v2 = $%d::jsonb", JSON.stringify(payload.images_v2 ?? []));
  if ("category" in payload) push("category = $%d", payload.category ?? null);
  if ("subcategory" in payload) push("subcategory = $%d", payload.subcategory ?? null);
  if ("tags" in payload) push("tags = $%d::text[]", payload.tags ?? []);
  if ("is_active" in payload) push("is_active = $%d", payload.is_active ?? true);
  if ("is_featured" in payload) push("is_featured = $%d", payload.is_featured ?? false);
  if ("is_bestseller" in payload) push("is_bestseller = $%d", payload.is_bestseller ?? false);
  if ("is_new" in payload) push("is_new = $%d", payload.is_new ?? false);
  if ("vegan" in payload) push("vegan = $%d", payload.vegan ?? false);
  if ("gluten_free" in payload) push("gluten_free = $%d", payload.gluten_free ?? false);
  if ("sugar_free" in payload) push("sugar_free = $%d", payload.sugar_free ?? false);
  if ("high_protein" in payload) push("high_protein = $%d", payload.high_protein ?? false);
  if ("rating" in payload) push("rating = $%d", payload.rating ?? 0);
  if ("review_count" in payload) push("review_count = $%d", payload.review_count ?? 0);
  if ("seo_title" in payload) push("seo_title = $%d", payload.seo_title ?? null);
  if ("seo_description" in payload) push("seo_description = $%d", payload.seo_description ?? null);
  if ("status" in payload) push("status = $%d", payload.status ?? null);
  if ("is_draft" in payload) push("is_draft = $%d", payload.is_draft ?? false);
  if ("published_at" in payload) push("published_at = $%d", payload.published_at ?? null);
  if ("tax_rate" in payload) push("tax_rate = $%d", payload.tax_rate ?? 0);
  if ("brand" in payload) push("brand = $%d", payload.brand ?? null);
  if ("country_of_origin" in payload) push("country_of_origin = $%d", payload.country_of_origin ?? null);
  if ("sku" in payload) push("sku = $%d", payload.sku ?? null);
  if ("gtin" in payload) push("gtin = $%d", payload.gtin ?? null);
  if ("dimensions" in payload) push("dimensions = $%d::jsonb", JSON.stringify(payload.dimensions ?? {}));
  if ("related_products" in payload) push("related_products = $%d::uuid[]", payload.related_products ?? []);
  if ("complementary_products" in payload) push("complementary_products = $%d::uuid[]", payload.complementary_products ?? []);
  if ("seo_keywords" in payload) push("seo_keywords = $%d::text[]", payload.seo_keywords ?? []);
  if ("seo_focus_keyword" in payload) push("seo_focus_keyword = $%d", payload.seo_focus_keyword ?? null);
  if ("og_image" in payload) push("og_image = $%d", payload.og_image ?? null);
  if ("canonical_url" in payload) push("canonical_url = $%d", payload.canonical_url ?? null);
  if ("seo_robots" in payload) push("seo_robots = $%d", payload.seo_robots ?? null);
  if ("track_stock" in payload) push("track_stock = $%d", payload.track_stock ?? true);
  if ("low_stock_threshold" in payload) push("low_stock_threshold = $%d", payload.low_stock_threshold ?? 10);
  if ("allergens" in payload) push("allergens = $%d::text[]", payload.allergens ?? []);
  if ("nutrition_basis" in payload) push("nutrition_basis = $%d", payload.nutrition_basis ?? null);
  if ("serving_size" in payload) push("serving_size = $%d", payload.serving_size ?? 100);
  if ("serving_per_container" in payload) push("serving_per_container = $%d", payload.serving_per_container ?? 1);
  if ("vitamins" in payload) push("vitamins = $%d::jsonb", JSON.stringify(payload.vitamins ?? {}));
  if ("ingredients" in payload) push("ingredients = $%d", payload.ingredients ?? null);
  if ("storage_conditions" in payload) push("storage_conditions = $%d", payload.storage_conditions ?? null);
  if ("shelf_life_days" in payload) push("shelf_life_days = $%d", payload.shelf_life_days ?? null);
  if ("calories" in payload) push("calories = $%d", payload.calories ?? 0);
  if ("protein" in payload) push("protein = $%d", payload.protein ?? 0);
  if ("carbs" in payload) push("carbs = $%d", payload.carbs ?? 0);
  if ("fat" in payload) push("fat = $%d", payload.fat ?? 0);
  if ("fiber" in payload) push("fiber = $%d", payload.fiber ?? 0);
  if ("sugar" in payload) push("sugar = $%d", payload.sugar ?? 0);
  if ("saturated_fat" in payload) push("saturated_fat = $%d", payload.saturated_fat ?? 0);
  if ("sodium" in payload) push("sodium = $%d", payload.sodium ?? 0);
  if ("shopify_metadata" in payload) push("shopify_metadata = $%d::jsonb", JSON.stringify(payload.shopify_metadata ?? {}));
  if ("shopify_metafields" in payload) push("shopify_metafields = $%d::jsonb", JSON.stringify(payload.shopify_metafields ?? {}));

  return assignments;
}

function buildVariantInsertValues(
  productId: string,
  payload: LightPostgresProductVariantMutationPayload,
): unknown[] {
  return [
    productId,
    payload.name ?? "",
    payload.sku ?? null,
    payload.price ?? 0,
    payload.original_price ?? null,
    payload.stock ?? 0,
    payload.weight === undefined || payload.weight === null ? null : String(payload.weight),
    payload.cost ?? null,
    payload.barcode ?? null,
    payload.group_name ?? null,
    payload.images ?? [],
    payload.unit ?? "adet",
    payload.max_purchase_quantity ?? null,
    payload.warehouse_location ?? null,
    JSON.stringify(payload.attributes ?? []),
    JSON.stringify(payload.shopify_metadata ?? {}),
  ];
}

function buildVariantUpdateAssignments(
  payload: LightPostgresProductVariantMutationPayload,
): Array<{ sql: string; value: unknown }> {
  const assignments: Array<{ sql: string; value: unknown }> = [];
  const push = (sql: string, value: unknown) => {
    assignments.push({ sql, value });
  };

  if ("name" in payload) push("name = $%d", payload.name ?? "");
  if ("sku" in payload) push("sku = $%d", payload.sku ?? null);
  if ("price" in payload) push("price = $%d", payload.price ?? 0);
  if ("original_price" in payload) push("original_price = $%d", payload.original_price ?? null);
  if ("stock" in payload) push("stock = $%d", payload.stock ?? 0);
  if ("weight" in payload) {
    push(
      "weight = $%d",
      payload.weight === undefined || payload.weight === null ? null : String(payload.weight),
    );
  }
  if ("cost" in payload) push("cost = $%d", payload.cost ?? null);
  if ("barcode" in payload) push("barcode = $%d", payload.barcode ?? null);
  if ("group_name" in payload) push("group_name = $%d", payload.group_name ?? null);
  if ("images" in payload) push("images = $%d::text[]", payload.images ?? []);
  if ("unit" in payload) push("unit = $%d", payload.unit ?? "adet");
  if ("max_purchase_quantity" in payload) push("max_purchase_quantity = $%d", payload.max_purchase_quantity ?? null);
  if ("warehouse_location" in payload) push("warehouse_location = $%d", payload.warehouse_location ?? null);
  if ("attributes" in payload) push("attributes = $%d::jsonb", JSON.stringify(payload.attributes ?? []));
  if ("shopify_metadata" in payload) push("shopify_metadata = $%d::jsonb", JSON.stringify(payload.shopify_metadata ?? {}));

  return assignments;
}

function formatAssignments(
  assignments: Array<{ sql: string; value: unknown }>,
  startIndex = 1,
): { sql: string; params: unknown[] } {
  return {
    sql: assignments
      .map((assignment, index) =>
        assignment.sql.replace("%d", String(startIndex + index)),
      )
      .join(", "),
    params: assignments.map((assignment) => assignment.value),
  };
}

function isTemporaryVariantId(value: string | null | undefined): boolean {
  return !value || value.startsWith("variant-");
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

export async function findLightPostgresMatchingProductIds(
  rawSearch: string,
): Promise<string[]> {
  const trimmedSearch = rawSearch.trim();

  if (!trimmedSearch) {
    return [];
  }

  const ilikePattern = `%${trimmedSearch}%`;
  const [productsByName, productsByDescription, productsBySku, variantsBySku, variantsByBarcode] =
    await Promise.all([
      queryLightPostgres<{ id: string }>(
        `
          select id
          from public.products
          where name ilike $1
          limit 2000
        `,
        [ilikePattern],
      ),
      queryLightPostgres<{ id: string }>(
        `
          select id
          from public.products
          where description ilike $1
          limit 2000
        `,
        [ilikePattern],
      ),
      queryLightPostgres<{ id: string }>(
        `
          select id
          from public.products
          where sku ilike $1
          limit 2000
        `,
        [ilikePattern],
      ),
      queryLightPostgres<{ product_id: string }>(
        `
          select product_id
          from public.product_variants
          where sku ilike $1
          limit 2000
        `,
        [ilikePattern],
      ),
      queryLightPostgres<{ product_id: string }>(
        `
          select product_id
          from public.product_variants
          where barcode ilike $1
          limit 2000
        `,
        [ilikePattern],
      ),
    ]);

  return [
    ...new Set(
      [
        ...productsByName.map((row) => row.id),
        ...productsByDescription.map((row) => row.id),
        ...productsBySku.map((row) => row.id),
        ...variantsBySku.map((row) => row.product_id),
        ...variantsByBarcode.map((row) => row.product_id),
      ].filter((value) => typeof value === "string" && value.length > 0),
    ),
  ];
}

export async function listLightPostgresProducts(
  options: LightPostgresProductListOptions = {},
): Promise<LightPostgresProductRecord[]> {
  if (options.matchedProductIds && options.matchedProductIds.length === 0) {
    return [];
  }

  const { whereSql, params } = buildProductListWhereClause(options);
  const productRows = await queryLightPostgres<ProductRow>(
    `
      select *
      from public.products
      ${whereSql}
      order by created_at desc, id asc
    `,
    params,
  );

  const variantRows = await fetchLightPostgresVariantsByProductIds(
    productRows.map((row) => row.id),
  );

  return attachVariantsToProducts(productRows, variantRows);
}

export async function getLightPostgresProductById(
  id: string,
): Promise<LightPostgresProductRecord | null> {
  const productRows = await queryLightPostgres<ProductRow>(
    `
      select *
      from public.products
      where id = $1
      limit 1
    `,
    [id],
  );

  if (productRows.length === 0) {
    return null;
  }

  const variantRows = await fetchLightPostgresVariantsByProductIds([id]);
  return attachVariantsToProducts(productRows, variantRows)[0] ?? null;
}

export async function getLightPostgresProductBySlug(
  slug: string,
): Promise<LightPostgresProductRecord | null> {
  const productRows = await queryLightPostgres<ProductRow>(
    `
      select *
      from public.products
      where slug = $1
      order by updated_at desc, created_at desc
      limit 1
    `,
    [slug],
  );

  if (productRows.length === 0) {
    return null;
  }

  const product = productRows[0];
  const variantRows = await fetchLightPostgresVariantsByProductIds([product.id]);
  return attachVariantsToProducts([product], variantRows)[0] ?? null;
}

export async function createLightPostgresProductWithVariants(
  payload: LightPostgresProductMutationPayload,
  variants: LightPostgresProductVariantMutationPayload[] = [],
): Promise<LightPostgresProductRecord> {
  try {
    return await withLightPostgresTransaction(async (client) => {
      const inserted = await queryLightPostgresOneWithClient<ProductRow>(
        client,
        `
          insert into public.products (
            name, slug, description, short_description, images, images_v2,
            category, subcategory, tags, is_featured, is_bestseller, is_active,
            is_new, vegan, gluten_free, sugar_free, high_protein, rating,
            review_count, seo_title, seo_description, status, is_draft,
            published_at, tax_rate, brand, country_of_origin, sku, gtin,
            dimensions, related_products, complementary_products, seo_keywords,
            seo_focus_keyword, og_image, canonical_url, seo_robots, track_stock,
            low_stock_threshold, allergens, nutrition_basis, serving_size,
            serving_per_container, vitamins, ingredients, storage_conditions,
            shelf_life_days, calories, protein, carbs, fat, fiber, sugar,
            saturated_fat, sodium, shopify_metadata, shopify_metafields
          )
          values (
            $1, $2, $3, $4, $5::text[], $6::jsonb,
            $7, $8, $9::text[], $10, $11, $12,
            $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23,
            $24, $25, $26, $27, $28, $29,
            $30::jsonb, $31::uuid[], $32::uuid[], $33::text[],
            $34, $35, $36, $37, $38,
            $39, $40::text[], $41, $42,
            $43, $44::jsonb, $45, $46,
            $47, $48, $49, $50, $51, $52, $53,
            $54, $55, $56::jsonb, $57::jsonb
          )
          returning *
        `,
        buildProductInsertParams(payload),
      );

      if (!inserted) {
        throw new Error("Urun olusturma sonucu bos dondu.");
      }

      for (const variant of variants) {
        await queryLightPostgresWithClient(
          client,
          `
            insert into public.product_variants (
              product_id, name, sku, price, original_price, stock, weight,
              cost, barcode, group_name, images, unit, max_purchase_quantity,
              warehouse_location, attributes, shopify_metadata
            )
            values (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11::text[], $12, $13,
              $14, $15::jsonb, $16::jsonb
            )
          `,
          buildVariantInsertValues(inserted.id, variant),
        );
      }

      const fullProduct = await getLightPostgresProductByIdWithClient(client, inserted.id);

      if (!fullProduct) {
        throw new Error("Olusturulan urun tekrar okunamadi.");
      }

      return fullProduct;
    });
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Product with this slug already exists");
    }

    mapAdapterError(error, "Failed to create product");
  }
}

export async function updateLightPostgresProductWithVariants(
  id: string,
  payload: LightPostgresProductMutationPayload,
  variants?: LightPostgresProductVariantMutationPayload[],
): Promise<LightPostgresProductRecord | null> {
  try {
    return await withLightPostgresTransaction(async (client) => {
      const updateAssignments = buildProductUpdateAssignments(payload);

      if (updateAssignments.length > 0) {
        const formatted = formatAssignments(updateAssignments, 2);
        const updated = await queryLightPostgresOneWithClient<ProductRow>(
          client,
          `
            update public.products
            set ${formatted.sql}
            where id = $1
            returning *
          `,
          [id, ...formatted.params],
        );

        if (!updated) {
          return null;
        }
      } else {
        const existing = await queryLightPostgresOneWithClient<ProductRow>(
          client,
          `
            select *
            from public.products
            where id = $1
            limit 1
          `,
          [id],
        );

        if (!existing) {
          return null;
        }
      }

      if (Array.isArray(variants)) {
        for (const variant of variants) {
          if (isTemporaryVariantId(variant.id)) {
            await queryLightPostgresWithClient(
              client,
              `
                insert into public.product_variants (
                  product_id, name, sku, price, original_price, stock, weight,
                  cost, barcode, group_name, images, unit, max_purchase_quantity,
                  warehouse_location, attributes, shopify_metadata
                )
                values (
                  $1, $2, $3, $4, $5, $6, $7,
                  $8, $9, $10, $11::text[], $12, $13,
                  $14, $15::jsonb, $16::jsonb
                )
              `,
              buildVariantInsertValues(id, variant),
            );
            continue;
          }

          const variantAssignments = buildVariantUpdateAssignments(variant);
          if (variantAssignments.length === 0) {
            continue;
          }

          const formatted = formatAssignments(variantAssignments, 3);
          const updatedVariant = await queryLightPostgresOneWithClient<ProductVariantRow>(
            client,
            `
              update public.product_variants
              set ${formatted.sql}
              where id = $1 and product_id = $2
              returning id
            `,
            [variant.id, id, ...formatted.params],
          );

          if (!updatedVariant) {
            throw new Error(`Varyant bulunamadi veya urune ait degil: ${variant.id}`);
          }
        }
      }

      return getLightPostgresProductByIdWithClient(client, id);
    });
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code === "23505") {
      throw duplicateSlugError("Product with this slug already exists");
    }

    mapAdapterError(error, "Failed to update product");
  }
}
