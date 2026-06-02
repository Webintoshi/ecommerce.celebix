"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/platform-config/src/light-postgres-compat.ts
var light_postgres_compat_exports = {};
__export(light_postgres_compat_exports, {
  createLightPostgresCompatClient: () => createLightPostgresCompatClient
});
module.exports = __toCommonJS(light_postgres_compat_exports);

// packages/platform-config/src/light-postgres-runtime.ts
var DEFAULT_DATABASE_URL_KEYS = [
  "LIGHT_POSTGRES_DATABASE_URL",
  "DATABASE_URL"
];
var DEFAULT_DATABASE_NAME_KEYS = [
  "LIGHT_POSTGRES_DATABASE_NAME",
  "STORE_SLUG"
];
var DEFAULT_SSL_MODE_KEYS = [
  "LIGHT_POSTGRES_DATABASE_SSLMODE",
  "DATABASE_SSLMODE"
];
function readEnvValue(env, keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}
function resolveLightPostgresDatabaseUrl(env = process.env, overrides = {}) {
  return readEnvValue(env, overrides.databaseUrl ?? DEFAULT_DATABASE_URL_KEYS);
}
function resolveLightPostgresDatabaseName(env = process.env, overrides = {}) {
  return readEnvValue(env, overrides.databaseName ?? DEFAULT_DATABASE_NAME_KEYS);
}
function resolveLightPostgresSslMode(env = process.env, overrides = {}) {
  return readEnvValue(env, overrides.sslMode ?? DEFAULT_SSL_MODE_KEYS)?.toLowerCase() || "require";
}
function hasSupabasePublicAuthEnv(env = process.env) {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
}
function hasSupabaseServiceRoleEnv(env = process.env) {
  return Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
function hasSupabaseAuthEnv(env = process.env) {
  return hasSupabasePublicAuthEnv(env) && hasSupabaseServiceRoleEnv(env);
}

// packages/platform-config/src/light-postgres-compat.ts
var PRODUCT_COLUMNS = `
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
var PRODUCT_VARIANT_COLUMNS = `
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
var UNSUPPORTED_PRODUCT_TABLE_ERROR = "light_postgres compatibility does not provision this table by default.";
function createCompatError(message, code) {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  error.details = null;
  error.hint = null;
  return error;
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "string");
}
function asNumericValue(value, fallback = 0) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return fallback;
}
function isTruthySelectForVariants(selectSpec) {
  return Boolean(selectSpec && selectSpec.includes("variants:product_variants"));
}
function aliasProductVariantRow(row, selectSpec) {
  const nextRow = {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    attributes: Array.isArray(row.attributes) ? row.attributes : []
  };
  if (selectSpec?.includes("raw_attributes:attributes")) {
    nextRow.raw_attributes = nextRow.attributes;
  }
  if (selectSpec?.includes("linked_attributes:product_variant_attributes")) {
    nextRow.linked_attributes = [];
  }
  return nextRow;
}
function aliasProductRow(row, variants, selectSpec) {
  const nextRow = {
    ...row,
    images: Array.isArray(row.images) ? row.images : [],
    images_v2: Array.isArray(row.images_v2) ? row.images_v2 : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    seo_keywords: Array.isArray(row.seo_keywords) ? row.seo_keywords : [],
    related_products: Array.isArray(row.related_products) ? row.related_products : [],
    complementary_products: Array.isArray(row.complementary_products) ? row.complementary_products : [],
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    vitamins: row.vitamins && typeof row.vitamins === "object" ? row.vitamins : {},
    dimensions: row.dimensions && typeof row.dimensions === "object" ? row.dimensions : {}
  };
  if (isTruthySelectForVariants(selectSpec)) {
    nextRow.variants = variants.map((variant) => aliasProductVariantRow(variant, selectSpec));
  }
  return nextRow;
}
function compareValues(left, right) {
  if (left === right) {
    return 0;
  }
  if (left === null || left === void 0) {
    return 1;
  }
  if (right === null || right === void 0) {
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
function matchesLikePattern(value, pattern) {
  const normalizedValue = String(value ?? "").toLocaleLowerCase("tr");
  const normalizedPattern = pattern.replaceAll("%", ".*").replaceAll("_", ".").toLocaleLowerCase("tr");
  const matcher = new RegExp(`^${normalizedPattern}$`, "i");
  return matcher.test(normalizedValue);
}
function matchesFilter(row, filter) {
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
      return row[filter.column] === null || row[filter.column] === void 0;
    }
    return row[filter.column] === filter.value;
  }
  if (filter.type === "ilike") {
    return matchesLikePattern(row[filter.column], filter.value);
  }
  const clauses = filter.raw.split(",").map((entry) => entry.trim()).filter(Boolean);
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
      return row[column] === null || row[column] === void 0;
    }
    if (operator === "ilike") {
      return matchesLikePattern(row[column], value);
    }
    return false;
  });
}
function sortRows(rows, orders) {
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
function normalizeSslMode(value) {
  const normalized = value?.trim().toLowerCase() || "require";
  return normalized === "disable" || normalized === "allow" || normalized === "prefer" ? false : { rejectUnauthorized: false };
}
async function getPool(connectionString, sslMode) {
  if (!globalThis.__celebixLightPostgresPoolCache) {
    globalThis.__celebixLightPostgresPoolCache = /* @__PURE__ */ new Map();
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
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
  })();
  globalThis.__celebixLightPostgresPoolCache.set(cacheKey, pending);
  return pending;
}
async function getSettingsRows(pool) {
  const result = await pool.query(
    "select key, value, updated_at from public.settings order by key asc"
  );
  return result.rows.map((row) => ({
    key: String(row.key),
    value: asObject(row.value),
    updated_at: String(row.updated_at)
  }));
}
async function getCategoryRows(pool) {
  const result = await pool.query(`
    select
      id,
      name,
      slug,
      description,
      image,
      icon,
      parent_id,
      sort_order,
      is_active,
      seo_title,
      seo_description,
      coalesce(seo_keywords, '[]'::jsonb) as seo_keywords,
      coalesce(faq, '[]'::jsonb) as faq,
      geo_data,
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
    updated_at: String(row.updated_at)
  }));
}
async function getPageRows(pool) {
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
    updated_at: String(row.updated_at)
  }));
}
async function getProductVariantRows(pool) {
  const result = await pool.query(`select ${PRODUCT_VARIANT_COLUMNS} from public.product_variants`);
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
    images: Array.isArray(row.images) ? row.images.filter((entry) => typeof entry === "string") : [],
    attributes: Array.isArray(row.attributes) ? row.attributes : [],
    unit: typeof row.unit === "string" ? row.unit : null,
    max_purchase_quantity: typeof row.max_purchase_quantity === "number" ? row.max_purchase_quantity : null,
    warehouse_location: typeof row.warehouse_location === "string" ? row.warehouse_location : null,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : void 0
  }));
}
async function getProductRows(pool) {
  const [productsResult, variants] = await Promise.all([
    pool.query(`select ${PRODUCT_COLUMNS} from public.products`),
    getProductVariantRows(pool)
  ]);
  const variantsByProductId = /* @__PURE__ */ new Map();
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
    country_of_origin: typeof row.country_of_origin === "string" ? row.country_of_origin : null,
    sku: typeof row.sku === "string" ? row.sku : null,
    gtin: typeof row.gtin === "string" ? row.gtin : null,
    dimensions: row.dimensions && typeof row.dimensions === "object" ? asObject(row.dimensions) : {},
    related_products: asStringArray(row.related_products),
    complementary_products: asStringArray(row.complementary_products),
    track_stock: typeof row.track_stock === "boolean" ? row.track_stock : null,
    low_stock_threshold: typeof row.low_stock_threshold === "number" ? row.low_stock_threshold : null,
    nutrition_basis: typeof row.nutrition_basis === "string" ? row.nutrition_basis : null,
    serving_size: typeof row.serving_size === "number" ? row.serving_size : null,
    serving_per_container: typeof row.serving_per_container === "number" ? row.serving_per_container : null,
    allergens: asStringArray(row.allergens),
    vitamins: row.vitamins && typeof row.vitamins === "object" ? asObject(row.vitamins) : {},
    ingredients: typeof row.ingredients === "string" ? row.ingredients : null,
    storage_conditions: typeof row.storage_conditions === "string" ? row.storage_conditions : null,
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
    variants: variantsByProductId.get(String(row.id)) ?? []
  }));
}
function buildUpdateAssignments(payload, startingIndex = 1) {
  const entries = Object.entries(payload);
  const values = [];
  const sql = entries.map(([column], index) => `"${column}" = $${startingIndex + index}`).join(", ");
  for (const [, value] of entries) {
    values.push(value);
  }
  return { sql, values };
}
var LightPostgresCompatQueryBuilder = class {
  constructor(poolPromise, tableName) {
    this.poolPromise = poolPromise;
    this.tableName = tableName;
  }
  poolPromise;
  tableName;
  operation = "select";
  selectSpec = "*";
  countMode = null;
  headOnly = false;
  payload = [];
  filters = [];
  orders = [];
  limitValue = null;
  cardinality = "many";
  select(spec = "*", options) {
    this.operation = "select";
    this.selectSpec = spec;
    this.countMode = options?.count ?? null;
    this.headOnly = options?.head === true;
    return this;
  }
  insert(payload) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(payload) {
    this.operation = "update";
    this.payload = [payload];
    return this;
  }
  upsert(payload) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }
  neq(column, value) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }
  in(column, value) {
    this.filters.push({ type: "in", column, value });
    return this;
  }
  is(column, value) {
    this.filters.push({ type: "is", column, value });
    return this;
  }
  ilike(column, value) {
    this.filters.push({ type: "ilike", column, value });
    return this;
  }
  or(raw) {
    this.filters.push({ type: "or", raw });
    return this;
  }
  order(column, options) {
    this.orders.push({
      column,
      ascending: options?.ascending !== false
    });
    return this;
  }
  limit(value) {
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
  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
  async readRows() {
    const pool = await this.poolPromise;
    if (this.tableName === "product_discount_rules") {
      return createCompatError(UNSUPPORTED_PRODUCT_TABLE_ERROR, "42P01");
    }
    if (this.tableName === "variant_attributes" || this.tableName === "variant_attribute_values" || this.tableName === "product_variant_attributes") {
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
    if (this.tableName === "order_items" || this.tableName === "favorites" || this.tableName === "product_views" || this.tableName === "product_reviews" || this.tableName === "cart_items" || this.tableName === "wishlist_items" || this.tableName === "customer_preferred_products" || this.tableName === "profiles") {
      return [];
    }
    return createCompatError(
      `light_postgres compatibility table destegi bulunamadi: ${this.tableName}`,
      "42P01"
    );
  }
  applyFilters(rows) {
    return rows.filter((row) => this.filters.every((filter) => matchesFilter(row, filter)));
  }
  shapeSelectResult(rows) {
    const filtered = this.applyFilters(rows);
    const sorted = sortRows(filtered, this.orders);
    const limited = this.limitValue !== null ? sorted.slice(0, this.limitValue) : sorted;
    const count = this.countMode === "exact" ? filtered.length : null;
    if (this.headOnly) {
      return {
        data: null,
        error: null,
        count
      };
    }
    if (this.cardinality === "single") {
      if (limited.length === 0) {
        return {
          data: null,
          error: createCompatError("Row not found", "PGRST116"),
          count
        };
      }
      return {
        data: limited[0],
        error: null,
        count
      };
    }
    if (this.cardinality === "maybeSingle") {
      return {
        data: limited[0] ?? null,
        error: null,
        count
      };
    }
    return {
      data: limited,
      error: null,
      count
    };
  }
  async insertRows() {
    const pool = await this.poolPromise;
    if (this.tableName === "product_discount_rules") {
      return {
        data: null,
        error: createCompatError(UNSUPPORTED_PRODUCT_TABLE_ERROR, "42P01")
      };
    }
    if (this.tableName !== "products" && this.tableName !== "product_variants" && this.tableName !== "categories" && this.tableName !== "pages") {
      return {
        data: null,
        error: createCompatError(`Insert desteklenmiyor: ${this.tableName}`, "42P01")
      };
    }
    const inserted = [];
    for (const entry of this.payload) {
      const record = { ...entry };
      const columns = Object.keys(record);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const values = columns.map((column) => record[column]);
      const result = await pool.query(
        `insert into public.${this.tableName} (${columns.map((column) => `"${column}"`).join(", ")}) values (${placeholders}) returning *`,
        values
      );
      inserted.push(...result.rows);
    }
    return this.shapeSelectResult(inserted);
  }
  async updateRows() {
    const pool = await this.poolPromise;
    if (!this.payload[0]) {
      return {
        data: null,
        error: createCompatError("Bos update payload", "PGRST204")
      };
    }
    if (!["products", "product_variants", "categories", "pages", "settings"].includes(this.tableName)) {
      return {
        data: null,
        error: createCompatError(`Update desteklenmiyor: ${this.tableName}`, "42P01")
      };
    }
    const payload = { ...this.payload[0] };
    if (Object.keys(payload).length === 0) {
      return {
        data: null,
        error: createCompatError("Bos update payload", "PGRST204")
      };
    }
    if (this.tableName === "settings") {
      const keyFilter = this.filters.find(
        (filter) => filter.type === "eq" && filter.column === "key"
      );
      if (!keyFilter) {
        return {
          data: null,
          error: createCompatError("Settings update key filtresi gerektirir.", "PGRST204")
        };
      }
      const value = payload.value ?? {};
      const result2 = await pool.query(
        `update public.settings set value = $1 where key = $2 returning *`,
        [value, keyFilter.value]
      );
      return this.shapeSelectResult(result2.rows);
    }
    const identifierFilter = this.filters.find(
      (filter) => filter.type === "eq" && (filter.column === "id" || filter.column === "slug")
    );
    if (!identifierFilter) {
      return {
        data: null,
        error: createCompatError("Update icin id veya slug filtresi gerektirir.", "PGRST204")
      };
    }
    const assignment = buildUpdateAssignments(payload);
    const result = await pool.query(
      `update public.${this.tableName} set ${assignment.sql} where "${identifierFilter.column}" = $${assignment.values.length + 1} returning *`,
      [...assignment.values, identifierFilter.value]
    );
    return this.shapeSelectResult(result.rows);
  }
  async deleteRows() {
    const pool = await this.poolPromise;
    const identifierFilter = this.filters.find(
      (filter) => filter.type === "eq" && (filter.column === "id" || filter.column === "key")
    );
    if (!identifierFilter) {
      return {
        data: null,
        error: createCompatError("Delete icin id veya key filtresi gerektirir.", "PGRST204")
      };
    }
    if (!["products", "product_variants", "categories", "pages", "settings"].includes(this.tableName)) {
      return {
        data: null,
        error: createCompatError(`Delete desteklenmiyor: ${this.tableName}`, "42P01")
      };
    }
    const result = await pool.query(
      `delete from public.${this.tableName} where "${identifierFilter.column}" = $1 returning *`,
      [identifierFilter.value]
    );
    return this.shapeSelectResult(result.rows);
  }
  async upsertRows() {
    const pool = await this.poolPromise;
    if (this.tableName !== "settings") {
      return {
        data: null,
        error: createCompatError(`Upsert desteklenmiyor: ${this.tableName}`, "42P01")
      };
    }
    const upserted = [];
    for (const entry of this.payload) {
      const key = typeof entry.key === "string" ? entry.key : null;
      if (!key) {
        return {
          data: null,
          error: createCompatError("Settings upsert key gerektirir.", "PGRST204")
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
        [key, asObject(entry.value)]
      );
      upserted.push(...result.rows);
    }
    return this.shapeSelectResult(upserted);
  }
  async execute() {
    try {
      if (this.operation === "select") {
        const rowsOrError = await this.readRows();
        if (rowsOrError instanceof Error) {
          return {
            data: null,
            error: rowsOrError,
            count: null
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
      const nextError = error instanceof Error ? error : createCompatError("light_postgres query basarisiz oldu.");
      return {
        data: null,
        error: nextError,
        count: null
      };
    }
  }
};
function createLightPostgresCompatClient(options = {}) {
  const env = options.env ?? process.env;
  const connectionString = options.databaseUrl ?? resolveLightPostgresDatabaseUrl(env);
  const databaseName = options.databaseName ?? resolveLightPostgresDatabaseName(env);
  const sslMode = options.sslMode ?? resolveLightPostgresSslMode(env);
  if (!connectionString) {
    throw createCompatError(
      "light_postgres runtime icin LIGHT_POSTGRES_DATABASE_URL veya DATABASE_URL gerekli."
    );
  }
  const poolPromise = getPool(connectionString, sslMode);
  const authError = createCompatError(
    hasSupabaseAuthEnv(env) ? "Bu runtime Supabase auth yerine light_postgres veri uyumluluk modunda calisiyor." : "Admin auth bu store icin henuz kurulmedi. blocked_auth_setup aktif.",
    "blocked_auth_setup"
  );
  return {
    from(tableName) {
      void databaseName;
      return new LightPostgresCompatQueryBuilder(poolPromise, tableName);
    },
    auth: {
      async getUser() {
        return {
          data: { user: null },
          error: authError
        };
      },
      async getSession() {
        return {
          data: { session: null },
          error: authError
        };
      },
      async signOut() {
        return { error: null };
      },
      admin: {
        async listUsers() {
          return {
            data: { users: [] },
            error: authError
          };
        },
        async updateUserById() {
          return {
            data: null,
            error: authError
          };
        },
        async createUser() {
          return {
            data: null,
            error: authError
          };
        }
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLightPostgresCompatClient
});
