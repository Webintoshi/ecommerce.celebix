type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export type StorefrontPublicReadMode = "supabase" | "light_postgres";

export interface LightPostgresPublicReadExecutor {
  <TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<TRow[]>;
}

export interface LightPostgresVariantRecord {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  weight: string | null;
  images: string[];
  rawAttributes: JsonValue | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LightPostgresProductRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  category: string | null;
  images: string[];
  imagesV2: JsonValue[] | null;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  status: string | null;
  isActive: boolean;
  isDraft: boolean;
  isFeatured: boolean;
  isBestseller: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  variants: LightPostgresVariantRecord[];
}

export interface LightPostgresCategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LightPostgresSettingRecord {
  key: string;
  value: JsonValue | null;
  updatedAt: string | null;
}

export interface LightPostgresPageRecord {
  id: string;
  name: string;
  slug: string;
  schemaType: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  faq: JsonValue[] | null;
  geoData: JsonValue | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LightPostgresPublicReadAdapter {
  listProducts(): Promise<LightPostgresProductRecord[]>;
  getProductBySlug(slug: string): Promise<LightPostgresProductRecord | null>;
  listProductVariants(): Promise<LightPostgresVariantRecord[]>;
  listCategories(): Promise<LightPostgresCategoryRecord[]>;
  getCategoryBySlug(slug: string): Promise<LightPostgresCategoryRecord | null>;
  getAllSettings(): Promise<Record<string, JsonValue | null>>;
  getSetting(key: string): Promise<JsonValue | null>;
  listPages(): Promise<LightPostgresPageRecord[]>;
  getPageBySlug(slug: string): Promise<LightPostgresPageRecord | null>;
}

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  category: string | null;
  images: unknown;
  images_v2: unknown;
  tags: unknown;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: unknown;
  status: string | null;
  is_active: unknown;
  is_draft: unknown;
  is_featured: unknown;
  is_bestseller: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: unknown;
  original_price: unknown;
  stock: unknown;
  weight: string | null;
  images: unknown;
  attributes: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parent_id: string | null;
  sort_order: unknown;
  is_active: unknown;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: unknown;
  created_at: string | null;
  updated_at: string | null;
};

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

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
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

function normalizeJsonArray(value: unknown): JsonValue[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((entry) => normalizeJsonValue(entry))
    .filter((entry): entry is JsonValue => entry !== undefined);
}

function normalizeVariantRow(row: VariantRow): LightPostgresVariantRecord {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    price: normalizeNumber(row.price),
    originalPrice: normalizeNumber(row.original_price),
    stock: normalizeNumber(row.stock),
    weight: row.weight,
    images: normalizeStringArray(row.images),
    rawAttributes: normalizeJsonValue(row.attributes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProductRow(
  row: ProductRow,
  variantsByProductId: Map<string, LightPostgresVariantRecord[]>,
): LightPostgresProductRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    category: row.category,
    images: normalizeStringArray(row.images),
    imagesV2: normalizeJsonArray(row.images_v2),
    tags: normalizeStringArray(row.tags),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: normalizeStringArray(row.seo_keywords),
    status: row.status,
    isActive: normalizeBoolean(row.is_active),
    isDraft: normalizeBoolean(row.is_draft),
    isFeatured: normalizeBoolean(row.is_featured),
    isBestseller: normalizeBoolean(row.is_bestseller),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    variants: variantsByProductId.get(row.id) ?? [],
  };
}

function normalizeCategoryRow(row: CategoryRow): LightPostgresCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    image: row.image,
    parentId: row.parent_id,
    sortOrder: normalizeNumber(row.sort_order) ?? 0,
    isActive: normalizeBoolean(row.is_active),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: normalizeStringArray(row.seo_keywords),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSettingRow(row: SettingRow): LightPostgresSettingRecord {
  return {
    key: row.key,
    value: normalizeJsonValue(row.value),
    updatedAt: row.updated_at,
  };
}

function normalizePageRow(row: PageRow): LightPostgresPageRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    schemaType: row.schema_type,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: normalizeStringArray(row.seo_keywords),
    faq: normalizeJsonArray(row.faq),
    geoData: normalizeJsonValue(row.geo_data),
    isActive: normalizeBoolean(row.is_active),
    sortOrder: normalizeNumber(row.sort_order) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const LIGHT_POSTGRES_PUBLIC_READ_SQL = {
  listProducts: `
    select *
    from public.products
    where coalesce(is_active, true) = true
      and (status = 'published' or status is null)
    order by created_at asc, id asc
  `,
  getProductBySlug: `
    select *
    from public.products
    where slug = $1
      and coalesce(is_active, true) = true
      and (status = 'published' or status is null)
    order by updated_at desc nulls last, created_at desc, id desc
    limit 1
  `,
  listProductVariants: `
    select *
    from public.product_variants
    order by created_at asc, id asc
  `,
  listCategories: `
    select *
    from public.categories
    where coalesce(is_active, true) = true
    order by sort_order asc, id asc
  `,
  getCategoryBySlug: `
    select *
    from public.categories
    where slug = $1
      and coalesce(is_active, true) = true
    order by sort_order asc, id asc
    limit 1
  `,
  listSettings: `
    select key, value, updated_at
    from public.settings
    order by key asc
  `,
  getSetting: `
    select key, value, updated_at
    from public.settings
    where key = $1
    limit 1
  `,
  listPages: `
    select *
    from public.pages
    where coalesce(is_active, true) = true
    order by sort_order asc, id asc
  `,
  getPageBySlug: `
    select *
    from public.pages
    where slug = $1
      and coalesce(is_active, true) = true
    order by sort_order asc, id asc
    limit 1
  `,
} as const;

export function resolveStorefrontPublicReadMode(
  value: string | undefined = process.env.DATABASE_MODE,
): StorefrontPublicReadMode {
  return value?.trim().toLowerCase() === "light_postgres" ? "light_postgres" : "supabase";
}

export function createLightPostgresPublicReadAdapter(
  execute: LightPostgresPublicReadExecutor,
): LightPostgresPublicReadAdapter {
  async function loadVariants(): Promise<LightPostgresVariantRecord[]> {
    const rows = await execute<VariantRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.listProductVariants);
    return rows.map(normalizeVariantRow);
  }

  return {
    async listProducts() {
      const [productRows, variants] = await Promise.all([
        execute<ProductRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.listProducts),
        loadVariants(),
      ]);

      const variantsByProductId = variants.reduce<Map<string, LightPostgresVariantRecord[]>>(
        (map, variant) => {
          const existing = map.get(variant.productId) ?? [];
          existing.push(variant);
          map.set(variant.productId, existing);
          return map;
        },
        new Map(),
      );

      return productRows.map((row) => normalizeProductRow(row, variantsByProductId));
    },

    async getProductBySlug(slug) {
      const [row] = await execute<ProductRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.getProductBySlug, [slug]);
      if (!row) {
        return null;
      }

      const variants = await loadVariants();
      const variantsByProductId = variants.reduce<Map<string, LightPostgresVariantRecord[]>>(
        (map, variant) => {
          const existing = map.get(variant.productId) ?? [];
          existing.push(variant);
          map.set(variant.productId, existing);
          return map;
        },
        new Map(),
      );

      return normalizeProductRow(row, variantsByProductId);
    },

    async listProductVariants() {
      return loadVariants();
    },

    async listCategories() {
      const rows = await execute<CategoryRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.listCategories);
      return rows.map(normalizeCategoryRow);
    },

    async getCategoryBySlug(slug) {
      const [row] = await execute<CategoryRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.getCategoryBySlug, [slug]);
      return row ? normalizeCategoryRow(row) : null;
    },

    async getAllSettings() {
      const rows = await execute<SettingRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.listSettings);
      return Object.fromEntries(
        rows.map((row) => {
          const normalized = normalizeSettingRow(row);
          return [normalized.key, normalized.value];
        }),
      );
    },

    async getSetting(key) {
      const [row] = await execute<SettingRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.getSetting, [key]);
      return row ? normalizeSettingRow(row).value : null;
    },

    async listPages() {
      const rows = await execute<PageRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.listPages);
      return rows.map(normalizePageRow);
    },

    async getPageBySlug(slug) {
      const [row] = await execute<PageRow>(LIGHT_POSTGRES_PUBLIC_READ_SQL.getPageBySlug, [slug]);
      return row ? normalizePageRow(row) : null;
    },
  };
}
