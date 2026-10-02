import type { PublicStorefrontContentRepository } from "../storefront-content/types.ts";
import { exactStorefrontContentInput, storefrontContentCursor, storefrontContentDate, storefrontContentHostname, storefrontContentLimit, storefrontContentProductIds, storefrontContentQuery, storefrontContentUuid } from "../storefront-content/validation.ts";
import { assertCatalogSearchServer, CATALOG_SEARCH_MAX_OFFSET, catalogSearchScopeHash, normalizeCatalogSearchQuery, parseMeilisearchCursor, searchFailure } from "./common.ts";
import type { CatalogSearchContentRepositoryOptions } from "./types.ts";

export function createCatalogSearchContentRepository(options: CatalogSearchContentRepositoryOptions): PublicStorefrontContentRepository {
  assertCatalogSearchServer();
  if (!options.base || !options.scope || !options.provider) searchFailure();
  const { base, scope, provider } = options;
  const search: PublicStorefrontContentRepository["search"] = async (input) => {
    const parsed = exactStorefrontContentInput(input, ["hostname", "now", "query", "limit"], ["cursor"]);
    const hostname = storefrontContentHostname(parsed.hostname), now = storefrontContentDate(parsed.now);
    const query = storefrontContentQuery(parsed.query), limit = storefrontContentLimit(parsed.limit);
    if (parsed.cursor !== undefined && typeof parsed.cursor !== "string") searchFailure("invalid_input");
    const cursor = parsed.cursor as string | undefined;
    if (cursor !== undefined && !cursor.startsWith("m1.")) {
      storefrontContentCursor(cursor);
      return base.search(input);
    }
    const continuation = cursor === undefined ? undefined : parseMeilisearchCursor(cursor);
    // Offset cursors cannot be translated to PostgreSQL's catalog ordering.
    const fallback = () => continuation ? searchFailure() : base.search(input);
    let resolved, storeId;
    try {
      resolved = await scope.resolve({ hostname, now });
      storeId = storefrontContentUuid(resolved.storeId, "unavailable");
      if (typeof resolved.pending !== "boolean") searchFailure();
    }
    catch { return fallback(); }
    const scopeHash = catalogSearchScopeHash(storeId, query);
    if (continuation && continuation.scopeHash !== scopeHash) searchFailure("invalid_input");
    if (resolved.pending || normalizeCatalogSearchQuery(query).length === 0) return fallback();
    let hits;
    try {
      hits = await provider.search({ storeId, query, limit, offset: continuation?.offset ?? 0 });
      storefrontContentProductIds(hits.productIds);
      if (hits.productIds.length > limit || (hits.nextOffset !== null && (!Number.isSafeInteger(hits.nextOffset) || hits.nextOffset <= (continuation?.offset ?? 0) || hits.nextOffset >= CATALOG_SEARCH_MAX_OFFSET))) searchFailure();
    } catch { return fallback(); }
    // A lost or newly initialized index can be healthy while still empty.
    if (!continuation && hits.productIds.length === 0) return fallback();
    let products;
    try { products = await base.resolveProductIds({ hostname, now, productIds: hits.productIds }); }
    catch { return fallback(); }
    const byId = new Map(products.map((product) => [product.id, product]));
    return Object.freeze({
      items: Object.freeze(hits.productIds.flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])),
      ...(hits.nextOffset === null ? {} : { nextCursor: `m1.${scopeHash}.${hits.nextOffset}` }),
    });
  };
  // Binding the target retains private/prototype fields of existing repositories.
  return new Proxy(base, {
    get(target, property) {
      if (property === "search") return search;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
