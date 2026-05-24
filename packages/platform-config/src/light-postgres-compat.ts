import {
  hasSupabaseAuthEnv,
  resolveLightPostgresDatabaseName,
  resolveLightPostgresDatabaseUrl,
  resolveLightPostgresSslMode,
  type RuntimeDatabaseMode,
} from "./light-postgres-runtime";

type LightPostgresCompatOptions = {
  env?: NodeJS.ProcessEnv;
  mode?: RuntimeDatabaseMode;
  databaseUrl?: string | null;
  databaseName?: string | null;
  sslMode?: string | null;
};

type QueryOperation = "select" | "insert" | "update" | "delete" | "upsert";
type QueryCardinality = "many" | "single" | "maybeSingle";

type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "neq"; column: string; value: unknown }
  | { type: "in"; column: string; value: unknown[] }
  | { type: "is"; column: string; value: unknown }
  | { type: "ilike"; column: string; value: string }
  | { type: "or"; raw: string };

type SortRule = {
  column: string;
  ascending: boolean;
};

type QueryExecutionResult<T = unknown> = {
  data: T;
  error: LightPostgresCompatError | null;
  count?: number | null;
};

type PoolLike = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

type SettingsRow = {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
};

type CategoryRow = {
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
  faq: unknown[];
  geo_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number | string | null;
  original_price: number | string | null;
  cost?: number | string | null;
  stock: number | string | null;
  weight: string | null;
  barcode?: string | null;
  group_name?: string | null;
  images?: string[];
  attributes?: unknown[];
  unit?: string | null;
  max_purchase_quantity?: number | null;
  warehouse_location?: string | null;
  created_at: string;
  updated_at?: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  category: string | null;
  subcategory: string | null;
  images: string[];
  images_v2: unknown[];
  tags: string[];
  is_featured: boolean;
  is_bestseller: boolean;
  is_active: boolean;
  is_new: boolean;
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  rating: number;
  review_count: number;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords?: string[];
  seo_focus_keyword?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
  seo_robots?: string | null;
  status?: string | null;
  is_draft?: boolean | null;
  published_at?: string | null;
  tax_rate?: number | null;
  brand?: string | null;
  country_of_origin?: string | null;
  sku?: string | null;
  gtin?: string | null;
  dimensions?: Record<string, unknown> | null;
  related_products?: string[];
  complementary_products?: string[];
  track_stock?: boolean | null;
  low_stock_threshold?: number | null;
  nutrition_basis?: string | null;
  serving_size?: number | null;
  serving_per_container?: number | null;
  allergens?: string[];
  vitamins?: Record<string, unknown> | null;
  ingredients?: string | null;
  storage_conditions?: string | null;
  shelf_life_days?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugar?: number | null;
  saturated_fat?: number | null;
  sodium?: number | null;
  created_at: string;
  updated_at: string;
  variants?: ProductVariantRow[];
};

type PageRow = {
  id: string;
  name: string;
  slug: string;
  schema_type: string;
  icon: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  faq: unknown[];
  geo_data: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LightPostgresCompatError = Error & {
  code?: string;
  details?: string | null;
  hint?: string | null;
};

const PRODUCT_COLUMNS = `
  id,
  name,
  slug,
  description,
  short_description,
  category,
  subcategory,
  images,
  images_v2,
  tags,
  is_featured,
  is_bestseller,
  is_active,
  is_new,
  vegan,
  gluten_free,
  sugar_free,
  high_protein,
  rating,
  review_count,
  seo_title,
  seo_description,
  seo_keywords,
  seo_focus_keyword,
  og_image,
  canonical_url,
  seo_robots,
  status,
  is_draft,
  published_at,
  tax_rate,
  brand,
  country_of_origin,
  sku,
  gtin,
  dimensions,
  related_products,
  complementary_products,
  track_stock,
  low_stock_threshold,
  nutrition_basis,
  serving_size,
  serving_per_container,
  allergens,
  vitamins,
  ingredients,
  storage_conditions,
  shelf_life_days,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  saturated_fat,
  sodium,
  created_at,
  updated_at
`;

const PRODUCT_VARIANT_COLUMNS = `
  id,
  product_id,
  name,
  sku,
  price,
  original_price,
  cost,
  stock,
  weight,
  barcode,
  group_name,
  images,
  attributes,
  unit,
  max_purchase_quantity,
  warehouse_location,
  created_at,
  updated_at
`;

const UNSUPPORTED_PRODUCT_TABLE_ERROR = "light_postgres compatibility does not provision this table by default.";

declare global {
  // eslint-disable-next-line no-var
  var __celebixLightPostgresPoolCache:
    | Map<string, Promise<PoolLike>>
    | undefined;
}

function createCompatError(
  message: string,
  code?: string,
): LightPostgresCompatError {
  const error = new Error(message) as LightPostgresCompatError;
  if (code) {
    error.code = code;
  }
  error.details = null;
  error.hint = null;
  return error;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function asNumericValue(value: unknown, fallback: number | null = 0): number | string | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return fallback;
}

function isTruthySelectForVariants(selectSpec: string | null): boolean {
  return Boolean(selectSpec && selectSpec.includes("variants:product_variants"));
}

function aliasProductVariantRow(
  row: ProductVariantRow,
  selectSpec: string | null,
): Record<string, unknown> {
  const nextRow: Record<string, unknown> = {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    attributes: Array.isArray(row.attributes) ? row.attributes : [],
  };

  if (selectSpec?.includes("raw_attributes:attributes")) {
    nextRow.raw_attributes = nextRow.attributes;
  }

  if (selectSpec?.includes("linked_attributes:product_variant_attributes")) {
    nextRow.linked_attributes = [];
  }

  return nextRow;
}

function aliasProductRow(
  row: ProductRow,
  variants: ProductVariantRow[],
  selectSpec: string | null,
): Record<string, unknown> {
  const nextRow: Record<string, unknown> = {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    images_v2: Array.isArray(row.images_v2) ? row.images_v2 : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    seo_keywords: Array.isArray(row.seo_keywords) ? row.seo_keywords : [],
    related_products: Array.isArray(row.related_products) ? row.related_products : [],
    complementary_products: Array.isArray(row.complementary_products)
      ? row.complementary_products
      : [],
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    vitamins: row.vitamins && typeof row.vitamins === "object" ? row.vitamins : {},
    dimensions: row.dimensions && typeof row.dimensions === "object" ? row.dimensions : {},
  };

  if (isTruthySelectForVariants(selectSpec)) {
    nextRow.variants = variants.map((variant) => aliasProductVariantRow(variant, selectSpec));
  }

  return nextRow;
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  const leftDate = typeof left === "string" ? Date.parse(left) : NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : NaN;

  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
    return leftDate - rightDate;
  }

  return String(left).localeCompare(String(right), "tr", { sensitivity: "base" });
}

function matchesLikePattern(value: unknown, pattern: string): boolean {
  const normalizedValue = String(value ?? "").toLocaleLowerCase("tr");
  const normalizedPattern = pattern
    .replaceAll("%", ".*")
    .replaceAll("_", ".")
    .toLocaleLowerCase("tr");
  const matcher = new RegExp(`^${normalizedPattern}$`, "i");
  return matcher.test(normalizedValue);
}

function matchesFilter(row: Record<string, unknown>, filter: Filter): boolean {
  if (filter.type === "eq") {
    return row[filter.column] === filter.value;
  }

  if (filter.type === "neq") {
    return row[filter.column] !== filter.value;
  }

  if (filter.type === "in") {
    return filter.value.includes(row[filter.column]);
  }

  if (filter.type === "is") {
    if (filter.value === null) {
      return row[filter.column] === null || row[filter.column] === undefined;
    }

    return row[filter.column] === filter.value;
  }

  if (filter.type === "ilike") {
    return matchesLikePattern(row[filter.column], filter.value);
  }

  const clauses = filter.raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return clauses.some((clause) => {
    const parts = clause.split(".");
    if (parts.length < 3) {
      return false;
    }

    const [column, operator, ...valueParts] = parts;
    const value = valueParts.join(".");

    if (operator === "eq") {
      return row[column] === value;
    }

    if (operator === "is" && value === "null") {
      return row[column] === null || row[column] === undefined;
    }

    if (operator === "ilike") {
      return matchesLikePattern(row[column], value);
    }

    return false;
  });
}

function sortRows<T extends Record<string, unknown>>(rows: T[], orders: SortRule[]): T[] {
  if (orders.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const rule of orders) {
      const comparison = compareValues(left[rule.column], right[rule.column]);
      if (comparison !== 0) {
        return rule.ascending ? comparison : -comparison;
      }
    }

    return 0;
  });
}

function normalizeSslMode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || "require";
  return normalized === "disable" || normalized === "allow" || normalized === "prefer"
    ? false
    : { rejectUnauthorized: false };
}

async function getPool(connectionString: string, sslMode: string): Promise<PoolLike> {
  if (!globalThis.__celebixLightPostgresPoolCache) {
    globalThis.__celebixLightPostgresPoolCache = new Map();
  }

  const cacheKey = `${connectionString}::${sslMode}`;
  const existing = globalThis.__celebixLightPostgresPoolCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const { Pool } = await import("pg");
    return new Pool({
      connectionString,
      ssl: normalizeSslMode(sslMode),
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }) as unknown as PoolLike;
  })();

  globalThis.__celebixLightPostgresPoolCache.set(cacheKey, pending);
  return pending;
}

async function getSettingsRows(pool: PoolLike): Promise<SettingsRow[]> {
  const result = await pool.query(
    "select key, value, updated_at from public.settings order by key asc",
  );

  return result.rows.map((row) => ({
    key: String(row.key),
    value: asObject(row.value),
    updated_at: String(row.updated_at),
  }));
}

async function getCategoryRows(pool: PoolLike): Promise<CategoryRow[]> {
  const result = await pool.query(`
    select
      id,
      name,
      slug,
      description,
      image,
      parent_id,
      sort_order,
      seo_title,
      seo_description,
      coalesce(seo_keywords, '[]'::jsonb) as seo_keywords,
      null::text as icon,
      true as is_active,
      '[]'::jsonb as faq,
      null::jsonb as geo_data,
      created_at,
      updated_at
    from public.categories
  `);

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: typeof row.description === "string" ? row.description : null,
    image: typeof row.image === "string" ? row.image : null,
    icon: typeof row.icon === "string" ? row.icon : null,
    parent_id: typeof row.parent_id === "string" ? row.parent_id : null,
    sort_order: Number(row.sort_order || 0),
    is_active: row.is_active !== false,
    seo_title: typeof row.seo_title === "string" ? row.seo_title : null,
    seo_description: typeof row.seo_description === "string" ? row.seo_description : null,
    seo_keywords: asStringArray(row.seo_keywords),
    faq: Array.isArray(row.faq) ? row.faq : [],
    geo_data: row.geo_data && typeof row.geo_data === "object" ? asObject(row.geo_data) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

async function getPageRows(pool: PoolLike): Promise<PageRow[]> {
  const result = await pool.query(`
    select
      id,
      name,
      slug,
      schema_type,
      icon,
      seo_title,
      seo_description,
      coalesce(seo_keywords, '[]'::jsonb) as seo_keywords,
      coalesce(faq, '[]'::jsonb) as faq,
      geo_data,
      is_active,
      sort_order,
      created_at,
      updated_at
    from public.pages
  `);

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    schema_type: String(row.schema_type || "WebPage"),
    icon: typeof row.icon === "string" ? row.icon : null,
    seo_title: typeof row.seo_title === "string" ? row.seo_title : null,
    seo_description: typeof row.seo_description === "string" ? row.seo_description : null,
    seo_keywords: asStringArray(row.seo_keywords),
    faq: Array.isArray(row.faq) ? row.faq : [],
    geo_data: row.geo_data && typeof row.geo_data === "object" ? asObject(row.geo_data) : null,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

async function getProductVariantRows(pool: PoolLike): Promise<ProductVariantRow[]> {
  const result = await pool.query(`
    select
      id,
      product_id,
      name,
      sku,
      price,
      original_price,
      cost,
      stock,
      weight,
      barcode,
      group_name,
      images,
      attributes,
      unit,
      max_purchase_quantity,
      warehouse_location,
      created_at,
      null::timestamptz as updated_at
    from public.product_variants
  `);

    return result.rows.map((row) => ({
      id: String(row.id),
      product_id: String(row.product_id),
      name: String(row.name || "Varsayilan"),
      sku: typeof row.sku === "string" ? row.sku : null,
      price: asNumericValue(row.price, 0),
      original_price: asNumericValue(row.original_price, null),
      cost: asNumericValue(row.cost, null),
      stock: asNumericValue(row.stock, 0),
    weight: typeof row.weight === "string" ? row.weight : null,
    barcode: typeof row.barcode === "string" ? row.barcode : null,
    group_name: typeof row.group_name === "string" ? row.group_name : null,
    images: Array.isArray(row.images) ? row.images.filter((entry): entry is string => typeof entry === "string") : [],
    attributes: Array.isArray(row.attributes) ? row.attributes : [],
      unit: typeof row.unit === "string" ? row.unit : null,
      max_purchase_quantity:
        typeof row.max_purchase_quantity === "number"
          ? row.max_purchase_quantity
          : null,
    warehouse_location:
      typeof row.warehouse_location === "string" ? row.warehouse_location : null,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }));
}

async function getProductRows(pool: PoolLike): Promise<ProductRow[]> {
  const [productsResult, variants] = await Promise.all([
    pool.query(`select ${PRODUCT_COLUMNS} from public.products`),
    getProductVariantRows(pool),
  ]);

  const variantsByProductId = new Map<string, ProductVariantRow[]>();
  for (const variant of variants) {
    const current = variantsByProductId.get(variant.product_id) ?? [];
    current.push(variant);
    variantsByProductId.set(variant.product_id, current);
  }

  return productsResult.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: typeof row.description === "string" ? row.description : null,
    short_description: typeof row.short_description === "string" ? row.short_description : null,
    category: typeof row.category === "string" ? row.category : null,
    subcategory: typeof row.subcategory === "string" ? row.subcategory : null,
    images: asStringArray(row.images),
    images_v2: Array.isArray(row.images_v2) ? row.images_v2 : [],
    tags: asStringArray(row.tags),
    is_featured: row.is_featured === true,
    is_bestseller: row.is_bestseller === true,
    is_active: row.is_active !== false,
    is_new: row.is_new === true,
    vegan: row.vegan === true,
    gluten_free: row.gluten_free === true,
    sugar_free: row.sugar_free === true,
    high_protein: row.high_protein === true,
    rating: Number(row.rating || 0),
    review_count: Number(row.review_count || 0),
    seo_title: typeof row.seo_title === "string" ? row.seo_title : null,
    seo_description: typeof row.seo_description === "string" ? row.seo_description : null,
    seo_keywords: asStringArray(row.seo_keywords),
    seo_focus_keyword: typeof row.seo_focus_keyword === "string" ? row.seo_focus_keyword : null,
    og_image: typeof row.og_image === "string" ? row.og_image : null,
    canonical_url: typeof row.canonical_url === "string" ? row.canonical_url : null,
    seo_robots: typeof row.seo_robots === "string" ? row.seo_robots : null,
    status: typeof row.status === "string" ? row.status : null,
    is_draft: typeof row.is_draft === "boolean" ? row.is_draft : null,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    tax_rate: typeof row.tax_rate === "number" ? row.tax_rate : null,
    brand: typeof row.brand === "string" ? row.brand : null,
    country_of_origin:
      typeof row.country_of_origin === "string" ? row.country_of_origin : null,
    sku: typeof row.sku === "string" ? row.sku : null,
    gtin: typeof row.gtin === "string" ? row.gtin : null,
    dimensions: row.dimensions && typeof row.dimensions === "object" ? asObject(row.dimensions) : {},
    related_products: asStringArray(row.related_products),
    complementary_products: asStringArray(row.complementary_products),
    track_stock: typeof row.track_stock === "boolean" ? row.track_stock : null,
    low_stock_threshold:
      typeof row.low_stock_threshold === "number" ? row.low_stock_threshold : null,
    nutrition_basis: typeof row.nutrition_basis === "string" ? row.nutrition_basis : null,
    serving_size: typeof row.serving_size === "number" ? row.serving_size : null,
    serving_per_container:
      typeof row.serving_per_container === "number" ? row.serving_per_container : null,
    allergens: asStringArray(row.allergens),
    vitamins: row.vitamins && typeof row.vitamins === "object" ? asObject(row.vitamins) : {},
    ingredients: typeof row.ingredients === "string" ? row.ingredients : null,
    storage_conditions:
      typeof row.storage_conditions === "string" ? row.storage_conditions : null,
    shelf_life_days: typeof row.shelf_life_days === "number" ? row.shelf_life_days : null,
    calories: typeof row.calories === "number" ? row.calories : null,
    protein: typeof row.protein === "number" ? row.protein : null,
    carbs: typeof row.carbs === "number" ? row.carbs : null,
    fat: typeof row.fat === "number" ? row.fat : null,
    fiber: typeof row.fiber === "number" ? row.fiber : null,
    sugar: typeof row.sugar === "number" ? row.sugar : null,
    saturated_fat: typeof row.saturated_fat === "number" ? row.saturated_fat : null,
    sodium: typeof row.sodium === "number" ? row.sodium : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    variants: variantsByProductId.get(String(row.id)) ?? [],
  }));
}

function buildUpdateAssignments(
  payload: Record<string, unknown>,
  startingIndex = 1,
): { sql: string; values: unknown[] } {
  const entries = Object.entries(payload);
  const values: unknown[] = [];
  const sql = entries
    .map(([column], index) => `"${column}" = $${startingIndex + index}`)
    .join(", ");

  for (const [, value] of entries) {
    values.push(value);
  }

  return { sql, values };
}

class LightPostgresCompatQueryBuilder implements PromiseLike<QueryExecutionResult<unknown>> {
  private operation: QueryOperation = "select";
  private selectSpec: string | null = "*";
  private countMode: "exact" | null = null;
  private headOnly = false;
  private payload: Record<string, unknown>[] = [];
  private filters: Filter[] = [];
  private orders: SortRule[] = [];
  private limitValue: number | null = null;
  private cardinality: QueryCardinality = "many";

  constructor(
    private readonly poolPromise: Promise<PoolLike>,
    private readonly tableName: string,
  ) {}

  select(spec = "*", options?: { count?: "exact"; head?: boolean }) {
    this.operation = "select";
    this.selectSpec = spec;
    this.countMode = options?.count ?? null;
    this.headOnly = options?.head === true;
    return this;
  }

  insert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = [payload];
    return this;
  }

  upsert(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ type: "ilike", column, value });
    return this;
  }

  or(raw: string) {
    this.filters.push({ type: "or", raw });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.cardinality = "single";
    return this;
  }

  maybeSingle() {
    this.cardinality = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryExecutionResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryExecutionResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async readRows(): Promise<Record<string, unknown>[] | LightPostgresCompatError> {
    const pool = await this.poolPromise;

    if (this.tableName === "product_discount_rules") {
      return createCompatError(UNSUPPORTED_PRODUCT_TABLE_ERROR, "42P01");
    }

    if (
      this.tableName === "variant_attributes" ||
      this.tableName === "variant_attribute_values" ||
      this.tableName === "product_variant_attributes"
    ) {
      return [];
    }

    if (this.tableName === "settings") {
      return getSettingsRows(pool);
    }

    if (this.tableName === "categories") {
      return getCategoryRows(pool);
    }

    if (this.tableName === "pages") {
      return getPageRows(pool);
    }

    if (this.tableName === "products") {
      const rows = await getProductRows(pool);
      return rows.map((row) => aliasProductRow(row, row.variants ?? [], this.selectSpec));
    }

    if (this.tableName === "product_variants") {
      const rows = await getProductVariantRows(pool);
      return rows.map((row) => aliasProductVariantRow(row, this.selectSpec));
    }

    if (
      this.tableName === "order_items" ||
      this.tableName === "favorites" ||
      this.tableName === "product_views" ||
      this.tableName === "product_reviews" ||
      this.tableName === "cart_items" ||
      this.tableName === "wishlist_items" ||
      this.tableName === "customer_preferred_products" ||
      this.tableName === "profiles"
    ) {
      return [];
    }

    return createCompatError(
      `light_postgres compatibility table destegi bulunamadi: ${this.tableName}`,
      "42P01",
    );
  }

  private applyFilters<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.filter((row) => this.filters.every((filter) => matchesFilter(row, filter)));
  }

  private shapeSelectResult<T extends Record<string, unknown>>(rows: T[]): QueryExecutionResult<unknown> {
    const filtered = this.applyFilters(rows);
    const sorted = sortRows(filtered, this.orders);
    const limited = this.limitValue !== null ? sorted.slice(0, this.limitValue) : sorted;
    const count = this.countMode === "exact" ? filtered.length : null;

    if (this.headOnly) {
      return {
        data: null,
        error: null,
        count,
      };
    }

    if (this.cardinality === "single") {
      if (limited.length === 0) {
        return {
          data: null,
          error: createCompatError("Row not found", "PGRST116"),
          count,
        };
      }

      return {
        data: limited[0],
        error: null,
        count,
      };
    }

    if (this.cardinality === "maybeSingle") {
      return {
        data: limited[0] ?? null,
        error: null,
        count,
      };
    }

    return {
      data: limited,
      error: null,
      count,
    };
  }

  private async insertRows(): Promise<QueryExecutionResult<unknown>> {
    const pool = await this.poolPromise;

    if (this.tableName === "product_discount_rules") {
      return {
        data: null,
        error: createCompatError(UNSUPPORTED_PRODUCT_TABLE_ERROR, "42P01"),
      };
    }

    if (this.tableName !== "products" && this.tableName !== "product_variants" && this.tableName !== "categories" && this.tableName !== "pages") {
      return {
        data: null,
        error: createCompatError(`Insert desteklenmiyor: ${this.tableName}`, "42P01"),
      };
    }

    const inserted: Record<string, unknown>[] = [];

    for (const entry of this.payload) {
      const record = { ...entry };
      const columns = Object.keys(record);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const values = columns.map((column) => record[column]);
      const result = await pool.query(
        `insert into public.${this.tableName} (${columns.map((column) => `"${column}"`).join(", ")}) values (${placeholders}) returning *`,
        values,
      );
      inserted.push(...result.rows);
    }

    return this.shapeSelectResult(inserted);
  }

  private async updateRows(): Promise<QueryExecutionResult<unknown>> {
    const pool = await this.poolPromise;

    if (!this.payload[0]) {
      return {
        data: null,
        error: createCompatError("Bos update payload", "PGRST204"),
      };
    }

    if (!["products", "product_variants", "categories", "pages", "settings"].includes(this.tableName)) {
      return {
        data: null,
        error: createCompatError(`Update desteklenmiyor: ${this.tableName}`, "42P01"),
      };
    }

    const payload = { ...this.payload[0] };
    if (Object.keys(payload).length === 0) {
      return {
        data: null,
        error: createCompatError("Bos update payload", "PGRST204"),
      };
    }

    if (this.tableName === "settings") {
      const keyFilter = this.filters.find(
        (filter): filter is Extract<Filter, { type: "eq"; column: string }> =>
          filter.type === "eq" && filter.column === "key",
      );

      if (!keyFilter) {
        return {
          data: null,
          error: createCompatError("Settings update key filtresi gerektirir.", "PGRST204"),
        };
      }

      const value = payload.value ?? {};
      const result = await pool.query(
        `update public.settings set value = $1 where key = $2 returning *`,
        [value, keyFilter.value],
      );
      return this.shapeSelectResult(result.rows);
    }

    const identifierFilter = this.filters.find(
      (filter): filter is Extract<Filter, { type: "eq"; column: string }> =>
        filter.type === "eq" && (filter.column === "id" || filter.column === "slug"),
    );

    if (!identifierFilter) {
      return {
        data: null,
        error: createCompatError("Update icin id veya slug filtresi gerektirir.", "PGRST204"),
      };
    }

    const assignment = buildUpdateAssignments(payload);
    const result = await pool.query(
      `update public.${this.tableName} set ${assignment.sql} where "${identifierFilter.column}" = $${
        assignment.values.length + 1
      } returning *`,
      [...assignment.values, identifierFilter.value],
    );

    return this.shapeSelectResult(result.rows);
  }

  private async deleteRows(): Promise<QueryExecutionResult<unknown>> {
    const pool = await this.poolPromise;
    const identifierFilter = this.filters.find(
      (filter): filter is Extract<Filter, { type: "eq"; column: string }> =>
        filter.type === "eq" && (filter.column === "id" || filter.column === "key"),
    );

    if (!identifierFilter) {
      return {
        data: null,
        error: createCompatError("Delete icin id veya key filtresi gerektirir.", "PGRST204"),
      };
    }

    if (!["products", "product_variants", "categories", "pages", "settings"].includes(this.tableName)) {
      return {
        data: null,
        error: createCompatError(`Delete desteklenmiyor: ${this.tableName}`, "42P01"),
      };
    }

    const result = await pool.query(
      `delete from public.${this.tableName} where "${identifierFilter.column}" = $1 returning *`,
      [identifierFilter.value],
    );

    return this.shapeSelectResult(result.rows);
  }

  private async upsertRows(): Promise<QueryExecutionResult<unknown>> {
    const pool = await this.poolPromise;

    if (this.tableName !== "settings") {
      return {
        data: null,
        error: createCompatError(`Upsert desteklenmiyor: ${this.tableName}`, "42P01"),
      };
    }

    const upserted: Record<string, unknown>[] = [];
    for (const entry of this.payload) {
      const key = typeof entry.key === "string" ? entry.key : null;
      if (!key) {
        return {
          data: null,
          error: createCompatError("Settings upsert key gerektirir.", "PGRST204"),
        };
      }

      const result = await pool.query(
        `
          insert into public.settings (key, value)
          values ($1, $2)
          on conflict (key) do update
          set value = excluded.value
          returning *
        `,
        [key, asObject(entry.value)],
      );
      upserted.push(...result.rows);
    }

    return this.shapeSelectResult(upserted);
  }

  async execute(): Promise<QueryExecutionResult<unknown>> {
    try {
      if (this.operation === "select") {
        const rowsOrError = await this.readRows();

        if (rowsOrError instanceof Error) {
          return {
            data: null,
            error: rowsOrError,
            count: null,
          };
        }

        return this.shapeSelectResult(rowsOrError);
      }

      if (this.operation === "insert") {
        return this.insertRows();
      }

      if (this.operation === "update") {
        return this.updateRows();
      }

      if (this.operation === "delete") {
        return this.deleteRows();
      }

      return this.upsertRows();
    } catch (error) {
      const nextError =
        error instanceof Error
          ? (error as LightPostgresCompatError)
          : createCompatError("light_postgres query basarisiz oldu.");
      return {
        data: null,
        error: nextError,
        count: null,
      };
    }
  }
}

type LightPostgresCompatClient = {
  from: (tableName: string) => LightPostgresCompatQueryBuilder;
  auth: {
    getUser: () => Promise<{
      data: { user: null };
      error: LightPostgresCompatError;
    }>;
    getSession: () => Promise<{
      data: { session: null };
      error: LightPostgresCompatError;
    }>;
    signOut: () => Promise<{ error: null }>;
    admin: {
      listUsers: () => Promise<{ data: { users: [] }; error: LightPostgresCompatError }>;
      updateUserById: () => Promise<{ data: null; error: LightPostgresCompatError }>;
      createUser: () => Promise<{ data: null; error: LightPostgresCompatError }>;
    };
  };
};

export function createLightPostgresCompatClient(
  options: LightPostgresCompatOptions = {},
): LightPostgresCompatClient {
  const env = options.env ?? process.env;
  const connectionString = options.databaseUrl ?? resolveLightPostgresDatabaseUrl(env);
  const databaseName = options.databaseName ?? resolveLightPostgresDatabaseName(env);
  const sslMode = options.sslMode ?? resolveLightPostgresSslMode(env);

  if (!connectionString) {
    throw createCompatError(
      "light_postgres runtime icin LIGHT_POSTGRES_DATABASE_URL veya DATABASE_URL gerekli.",
    );
  }

  const poolPromise = getPool(connectionString, sslMode);
  const authError = createCompatError(
    hasSupabaseAuthEnv(env)
      ? "Bu runtime Supabase auth yerine light_postgres veri uyumluluk modunda calisiyor."
      : "Admin auth bu store icin henuz kurulmedi. blocked_auth_setup aktif.",
    "blocked_auth_setup",
  );

  return {
    from(tableName: string) {
      void databaseName;
      return new LightPostgresCompatQueryBuilder(poolPromise, tableName);
    },
    auth: {
      async getUser() {
        return {
          data: { user: null },
          error: authError,
        };
      },
      async getSession() {
        return {
          data: { session: null },
          error: authError,
        };
      },
      async signOut() {
        return { error: null };
      },
      admin: {
        async listUsers() {
          return {
            data: { users: [] },
            error: authError,
          };
        },
        async updateUserById() {
          return {
            data: null,
            error: authError,
          };
        },
        async createUser() {
          return {
            data: null,
            error: authError,
          };
        },
      },
    },
  };
}
