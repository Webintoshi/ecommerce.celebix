import {
  parsePublicProduct,
  parsePublicProductMedia,
  parsePublicStarterThemePresentation,
  parsePublicStorefrontDesign,
  type PublicProduct,
  type PublicProductList,
  type PublicProductMedia,
} from "@celebix/saas-contracts";
import type { Cache, CacheDataClass } from "@celebix/saas-cache";
import {
  PublicStorefrontRepositoryError,
  type CampaignHomeProjection,
  type PublicStorefrontCategoryProductList,
  type PublicStorefrontRepository,
} from "@celebix/saas-data";

type CachedResult<T> = Readonly<{ kind: "value"; value: T }> | Readonly<{ kind: "not_found" }>;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("storefront_cache_projection_invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error("storefront_cache_projection_invalid");
  return record;
}

function parseList(value: unknown): PublicProductList {
  const parsed = exactRecord(value, ["items"]);
  if (!Array.isArray(parsed.items) || parsed.items.length > 48) throw new Error("storefront_cache_projection_invalid");
  return Object.freeze({ items: Object.freeze(parsed.items.map(parsePublicProduct)) });
}

function parseMediaList(value: unknown): readonly PublicProductMedia[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error("storefront_cache_projection_invalid");
  return Object.freeze(value.map(parsePublicProductMedia));
}

function parseCategoryList(value: unknown): PublicStorefrontCategoryProductList {
  const parsed = exactRecord(value, ["category", "items"]);
  const category = exactRecord(parsed.category, ["id", "name", "slug"]);
  if (typeof category.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(category.id) || typeof category.name !== "string" || category.name.length < 1 || category.name.length > 160 || typeof category.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug)) throw new Error("storefront_cache_projection_invalid");
  if (!Array.isArray(parsed.items) || parsed.items.length > 48) throw new Error("storefront_cache_projection_invalid");
  return Object.freeze({ category: Object.freeze({ id: category.id, name: category.name, slug: category.slug }), items: Object.freeze(parsed.items.map(parsePublicProduct)) });
}

function parseCampaign(value: unknown): CampaignHomeProjection {
  const parsed = exactRecord(value, ["presentation", "productRows"]);
  if (!Array.isArray(parsed.productRows) || parsed.productRows.length > 24) throw new Error("storefront_cache_projection_invalid");
  const productRows = parsed.productRows.map((row) => {
    const selected = exactRecord(row, ["key", "items"]);
    if (typeof selected.key !== "string" || selected.key.length < 1 || selected.key.length > 120 || !Array.isArray(selected.items) || selected.items.length > 48) throw new Error("storefront_cache_projection_invalid");
    return Object.freeze({ key: selected.key, items: Object.freeze(selected.items.map(parsePublicProduct)) });
  });
  return Object.freeze({ presentation: parsePublicStarterThemePresentation(parsed.presentation), productRows: Object.freeze(productRows) });
}

function parseCachedResult<T>(value: unknown, parser: (value: unknown) => T): CachedResult<T> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("storefront_cache_projection_invalid");
  const record = value as Record<string, unknown>;
  if (record.kind === "not_found" && Object.keys(record).length === 1) return Object.freeze({ kind: "not_found" });
  if (record.kind === "value" && Object.keys(record).length === 2 && Object.hasOwn(record, "value")) return Object.freeze({ kind: "value", value: parser(record.value) });
  throw new Error("storefront_cache_projection_invalid");
}

export function createCachedPublicStorefrontRepository(
  repository: PublicStorefrontRepository,
  cache: Cache,
  ttl: Readonly<{ catalogSeconds: number; settingsSeconds: number }>,
): PublicStorefrontRepository {
  const cached = async <T>(options: Readonly<{
    storeId: string;
    dataClass: CacheDataClass;
    scope: string;
    input: unknown;
    ttlSeconds: number;
    parser: (value: unknown) => T;
    load: () => Promise<T>;
  }>): Promise<T> => {
    const result = await cache.readThrough<CachedResult<T>>({
      storeId: options.storeId,
      dataClass: options.dataClass,
      schemaVersion: "v1",
      scope: options.scope,
      input: options.input,
      ttlSeconds: options.ttlSeconds,
      cacheNull: false,
      isNegative: (value) => value.kind === "not_found",
      parser: (value) => parseCachedResult(value, options.parser),
      load: async () => {
        try { return Object.freeze({ kind: "value", value: await options.load() }); }
        catch (error) {
          if (error instanceof PublicStorefrontRepositoryError && error.code === "not_found") return Object.freeze({ kind: "not_found" });
          throw error;
        }
      },
    });
    if (result.kind === "not_found") throw new PublicStorefrontRepositoryError("not_found");
    return result.value;
  };

  return Object.freeze({
    getPublicStorefront: (input: Parameters<PublicStorefrontRepository["getPublicStorefront"]>[0]) => repository.getPublicStorefront(input),
    listPublicProducts: (input: Parameters<PublicStorefrontRepository["listPublicProducts"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "product-list", input: { limit: input.limit }, ttlSeconds: ttl.catalogSeconds, parser: parseList, load: () => repository.listPublicProducts(input) }),
    listPublicProductsByCategory: (input: Parameters<PublicStorefrontRepository["listPublicProductsByCategory"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "categories", input: { slug: input.slug, limit: input.limit }, ttlSeconds: ttl.catalogSeconds, parser: parseCategoryList, load: () => repository.listPublicProductsByCategory(input) }),
    getPublicProductBySlug: (input: Parameters<PublicStorefrontRepository["getPublicProductBySlug"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "product-detail", input: { slug: input.slug }, ttlSeconds: ttl.catalogSeconds, parser: parsePublicProduct, load: () => repository.getPublicProductBySlug(input) }),
    listPublicProductMedia: (input: Parameters<PublicStorefrontRepository["listPublicProductMedia"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "product-media", input: { productId: input.productId }, ttlSeconds: ttl.catalogSeconds, parser: parseMediaList, load: () => repository.listPublicProductMedia(input) }),
    getPublicStorefrontDesign: (input: Parameters<PublicStorefrontRepository["getPublicStorefrontDesign"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "settings", scope: "settings", input: {}, ttlSeconds: ttl.settingsSeconds, parser: parsePublicStorefrontDesign, load: () => repository.getPublicStorefrontDesign(input) }),
    ...(repository.resolveCampaignHome ? { resolveCampaignHome: (input: Parameters<NonNullable<PublicStorefrontRepository["resolveCampaignHome"]>>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "homepage", input: {}, ttlSeconds: ttl.catalogSeconds, parser: parseCampaign, load: () => repository.resolveCampaignHome!(input) }) } : {}),
    ...(repository.listRelatedPublicProducts ? { listRelatedPublicProducts: (input: Parameters<NonNullable<PublicStorefrontRepository["listRelatedPublicProducts"]>>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "related-products", input: { productSlug: input.productSlug, limit: input.limit }, ttlSeconds: ttl.catalogSeconds, parser: parseList, load: () => repository.listRelatedPublicProducts!(input) }) } : {}),
  });
}
