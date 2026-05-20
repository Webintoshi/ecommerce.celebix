import {
  createLightPostgresPublicReadAdapter,
  resolveStorefrontPublicReadMode,
  type JsonValue,
  type LightPostgresCategoryRecord,
  type LightPostgresPageRecord,
  type LightPostgresProductRecord,
  type LightPostgresVariantRecord,
} from "@/lib/db/light-postgres-public-read";

type ProductImageV2 = {
  url: string;
};

export interface StorefrontLightPostgresVariantRow {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
  unit: string | null;
  images: string[];
  attributes: Array<Record<string, unknown>>;
  raw_attributes: Array<Record<string, unknown>>;
  group_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StorefrontLightPostgresProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  category: string | null;
  subcategory: string | null;
  images: string[];
  images_v2: ProductImageV2[];
  tags: string[];
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  status: string | null;
  is_active: boolean;
  is_draft: boolean;
  is_featured: boolean;
  is_bestseller: boolean;
  is_new: boolean;
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  rating: number;
  review_count: number;
  shopify_metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  variants: StorefrontLightPostgresVariantRow[];
}

export interface StorefrontLightPostgresCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  faq: Array<Record<string, unknown>> | null;
  geo_data: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StorefrontLightPostgresPageRow {
  id: string;
  name: string;
  slug: string;
  schema_type: string;
  icon: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  faq: Array<Record<string, unknown>> | null;
  geo_data: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface StorefrontLightPostgresSettingRow {
  key: string;
  value: JsonValue | null;
  updated_at: string | null;
}

type PgPool = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

let cachedConnectionString: string | null = null;
let poolPromise: Promise<PgPool | null> | null = null;

function getLightPostgresConnectionString() {
  const value = process.env.LIGHT_POSTGRES_DATABASE_URL?.trim();
  return value && value.length > 0 ? value : null;
}

function shouldUseSsl() {
  const mode = process.env.LIGHT_POSTGRES_DATABASE_SSLMODE?.trim().toLowerCase();
  if (!mode) {
    return false;
  }

  return !["disable", "disabled", "false", "0", "off", "no"].includes(mode);
}

async function getPool() {
  const connectionString = getLightPostgresConnectionString();
  if (!connectionString) {
    return null;
  }

  if (!poolPromise || cachedConnectionString !== connectionString) {
    cachedConnectionString = connectionString;
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      return new Pool({
        connectionString,
        ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
        max: 4,
      }) as PgPool;
    })();
  }

  return poolPromise;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlainObject);
}

function toImageEntries(value: JsonValue[] | null, fallback: string[]): ProductImageV2[] {
  const urls = new Set<string>();

  for (const image of value ?? []) {
    if (typeof image === "string" && image.length > 0) {
      urls.add(image);
      continue;
    }

    if (typeof image === "object" && image !== null && !Array.isArray(image)) {
      const url = image.url;
      if (typeof url === "string" && url.length > 0) {
        urls.add(url);
      }
    }
  }

  if (urls.size === 0) {
    for (const image of fallback) {
      if (image.length > 0) {
        urls.add(image);
      }
    }
  }

  return Array.from(urls).map((url) => ({ url }));
}

function mapVariantRecord(
  record: LightPostgresVariantRecord,
): StorefrontLightPostgresVariantRow {
  return {
    id: record.id,
    product_id: record.productId,
    name: record.name,
    sku: record.sku,
    barcode: record.barcode,
    price: Number(record.price ?? 0),
    original_price: record.originalPrice,
    stock: Number(record.stock ?? 0),
    weight: record.weight,
    unit: null,
    images: record.images,
    attributes: toObjectArray(record.rawAttributes),
    raw_attributes: toObjectArray(record.rawAttributes),
    group_name: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapProductRecord(
  record: LightPostgresProductRecord,
): StorefrontLightPostgresProductRow {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    short_description: record.shortDescription,
    category: record.category,
    subcategory: null,
    images: record.images,
    images_v2: toImageEntries(record.imagesV2, record.images),
    tags: record.tags,
    seo_title: record.seoTitle,
    seo_description: record.seoDescription,
    seo_keywords: record.seoKeywords,
    status: record.status,
    is_active: record.isActive,
    is_draft: record.isDraft,
    is_featured: record.isFeatured,
    is_bestseller: record.isBestseller,
    is_new: false,
    vegan: false,
    gluten_free: false,
    sugar_free: false,
    high_protein: false,
    rating: 0,
    review_count: 0,
    shopify_metadata: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    variants: record.variants.map(mapVariantRecord),
  };
}

function mapCategoryRecord(
  record: LightPostgresCategoryRecord,
): StorefrontLightPostgresCategoryRow {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    image: record.image,
    icon: null,
    parent_id: record.parentId,
    sort_order: record.sortOrder,
    is_active: record.isActive,
    seo_title: record.seoTitle,
    seo_description: record.seoDescription,
    seo_keywords: record.seoKeywords,
    faq: null,
    geo_data: null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapPageRecord(record: LightPostgresPageRecord): StorefrontLightPostgresPageRow {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    schema_type: record.schemaType,
    icon: null,
    seo_title: record.seoTitle,
    seo_description: record.seoDescription,
    seo_keywords: record.seoKeywords,
    faq: toObjectArray(record.faq),
    geo_data: isPlainObject(record.geoData) ? record.geoData : null,
    is_active: record.isActive,
    sort_order: record.sortOrder,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

async function getPublicReadAdapter() {
  const activePool = await getPool();
  if (!activePool) {
    return null;
  }

  return createLightPostgresPublicReadAdapter(async <TRow extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ) => {
    const result = await activePool.query(sql, [...params]);
    return result.rows as TRow[];
  });
}

export function isLightPostgresStorefrontReadEnabled() {
  return (
    resolveStorefrontPublicReadMode() === "light_postgres" &&
    getLightPostgresConnectionString() !== null
  );
}

export async function maybeListStorefrontProducts() {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  return (await adapter.listProducts()).map(mapProductRecord);
}

export async function maybeGetStorefrontProductBySlug(slug: string) {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  const product = await adapter.getProductBySlug(slug);
  return product ? mapProductRecord(product) : null;
}

export async function maybeListStorefrontProductVariants() {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  return (await adapter.listProductVariants()).map(mapVariantRecord);
}

export async function maybeListStorefrontCategories() {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  return (await adapter.listCategories()).map(mapCategoryRecord);
}

export async function maybeGetStorefrontCategoryBySlug(slug: string) {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  const category = await adapter.getCategoryBySlug(slug);
  return category ? mapCategoryRecord(category) : null;
}

export async function maybeGetStorefrontSetting(key: string) {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  return adapter.getSetting(key);
}

export async function maybeGetAllStorefrontSettings() {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  const settings = await adapter.getAllSettings();
  return Object.entries(settings).map(([key, value]) => ({
    key,
    value,
    updated_at: null,
  })) as StorefrontLightPostgresSettingRow[];
}

export async function maybeListStorefrontPages() {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  return (await adapter.listPages()).map(mapPageRecord);
}

export async function maybeGetStorefrontPageBySlug(slug: string) {
  const adapter = await getPublicReadAdapter();
  if (!adapter || !isLightPostgresStorefrontReadEnabled()) {
    return undefined;
  }

  const page = await adapter.getPageBySlug(slug);
  return page ? mapPageRecord(page) : null;
}
