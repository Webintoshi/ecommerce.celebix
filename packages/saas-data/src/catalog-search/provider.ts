import { storefrontContentLimit, storefrontContentQuery, storefrontContentUuid } from "../storefront-content/validation.ts";
import { boundedInteger, CATALOG_SEARCH_MAX_OFFSET, normalizeCatalogSearchQuery, record, searchFailure } from "./common.ts";
import { CatalogSearchHttp } from "./http.ts";
import type { CatalogSearchProvider, MeilisearchCatalogSearchOptions } from "./types.ts";

export function createMeilisearchCatalogSearchProvider(options: MeilisearchCatalogSearchOptions): CatalogSearchProvider {
  const http = new CatalogSearchHttp(options);
  return {
    async search(input) {
      const storeId = storefrontContentUuid(input.storeId);
      const query = normalizeCatalogSearchQuery(storefrontContentQuery(input.query));
      const limit = storefrontContentLimit(input.limit);
      const offset = boundedInteger(input.offset, 0, CATALOG_SEARCH_MAX_OFFSET - 1);
      const scope = `storeId = ${JSON.stringify(storeId)}`;
      const exact = `(skus = ${JSON.stringify(query)} OR barcodes = ${JSON.stringify(query)})`;
      const path = `/indexes/${http.index}/search`;
      const deadline = Date.now() + http.timeoutMs;
      async function request(body: Record<string, unknown>): Promise<Record<string, unknown>> {
        const remaining = deadline - Date.now();
        if (remaining <= 0) searchFailure();
        const result = await http.request(path, "POST", { ...body, attributesToRetrieve: ["storeId", "productId"] }, remaining);
        if (result.status !== 200) searchFailure();
        return result.data;
      }
      function ids(data: Record<string, unknown>, maximum: number): string[] {
        if (!Array.isArray(data.hits) || data.hits.length > maximum) searchFailure();
        const result = data.hits.map((value) => {
          const hit = record(value);
          if (hit.storeId !== storeId) searchFailure();
          return storefrontContentUuid(hit.productId, "unavailable");
        });
        if (new Set(result).size !== result.length) searchFailure();
        return result;
      }
      let exactCount = 0;
      if (query.length > 0) {
        const count = await request({ q: "", filter: `${scope} AND ${exact}`, hitsPerPage: 0 });
        ids(count, 0);
        exactCount = boundedInteger(count.totalHits, 0, CATALOG_SEARCH_MAX_OFFSET);
      }
      const wanted = Math.min(limit + 1, CATALOG_SEARCH_MAX_OFFSET - offset);
      const productIds: string[] = [];
      if (offset < exactCount) {
        const count = Math.min(wanted, exactCount - offset);
        productIds.push(...ids(await request({ q: "", filter: `${scope} AND ${exact}`, offset, limit: count }), count));
      }
      if (productIds.length < wanted && exactCount < CATALOG_SEARCH_MAX_OFFSET) {
        const textFilter = query.length > 0 ? `${scope} AND skus != ${JSON.stringify(query)} AND barcodes != ${JSON.stringify(query)}` : scope;
        const count = wanted - productIds.length;
        productIds.push(...ids(await request({ q: query, filter: textFilter, offset: Math.max(0, offset - exactCount), limit: count }), count));
      }
      if (new Set(productIds).size !== productIds.length) searchFailure();
      return Object.freeze({ productIds: Object.freeze(productIds.slice(0, limit)), nextOffset: productIds.length > limit ? offset + limit : null });
    },
  };
}
