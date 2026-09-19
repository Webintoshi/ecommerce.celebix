import {
  parsePublicProductMedia,
  parsePublicStorefrontDesign,
  type PublicProductMedia,
} from "@celebix/saas-contracts";
import type { Cache, CacheDataClass } from "@celebix/saas-cache";
import {
  PublicStorefrontRepositoryError,
  type PublicCatalogQuery,
  type PublicStorefrontRepository,
} from "@celebix/saas-data";

type CachedResult<T> = Readonly<{ kind: "value"; value: T }> | Readonly<{ kind: "not_found" }>;

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("storefront_cache_projection_invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error("storefront_cache_projection_invalid");
  return record;
}

function parseMediaList(value: unknown): readonly PublicProductMedia[] {
  if (!Array.isArray(value) || value.length > 16) throw new Error("storefront_cache_projection_invalid");
  return Object.freeze(value.map(parsePublicProductMedia));
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
    // A reference-set activation must affect the next catalog request, not
    // wait for the old TTL. Media and design remain cacheable below.
    listPublicProducts: (input: Parameters<PublicStorefrontRepository["listPublicProducts"]>[0]) => repository.listPublicProducts(input),
    ...(repository.queryPublicCatalog ? { queryPublicCatalog: (input: PublicCatalogQuery) => repository.queryPublicCatalog!(input) } : {}),
    listPublicProductsByCategory: (input: Parameters<PublicStorefrontRepository["listPublicProductsByCategory"]>[0]) => repository.listPublicProductsByCategory(input),
    getPublicProductBySlug: (input: Parameters<PublicStorefrontRepository["getPublicProductBySlug"]>[0]) => repository.getPublicProductBySlug(input),
    listPublicProductMedia: (input: Parameters<PublicStorefrontRepository["listPublicProductMedia"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "catalog", scope: "product-media", input: { productId: input.productId }, ttlSeconds: ttl.catalogSeconds, parser: parseMediaList, load: () => repository.listPublicProductMedia(input) }),
    getPublicStorefrontDesign: (input: Parameters<PublicStorefrontRepository["getPublicStorefrontDesign"]>[0]) => cached({ storeId: input.storefront.id, dataClass: "settings", scope: "settings", input: {}, ttlSeconds: ttl.settingsSeconds, parser: parsePublicStorefrontDesign, load: () => repository.getPublicStorefrontDesign(input) }),
    ...(repository.resolveCampaignHome ? { resolveCampaignHome: (input: Parameters<NonNullable<PublicStorefrontRepository["resolveCampaignHome"]>>[0]) => repository.resolveCampaignHome!(input) } : {}),
    ...(repository.listRelatedPublicProducts ? { listRelatedPublicProducts: (input: Parameters<NonNullable<PublicStorefrontRepository["listRelatedPublicProducts"]>>[0]) => repository.listRelatedPublicProducts!(input) } : {}),
  });
}
