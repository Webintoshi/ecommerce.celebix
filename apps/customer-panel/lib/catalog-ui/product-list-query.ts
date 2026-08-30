import {
  parseCatalogProductListQuery,
  parseCatalogProductPageSize,
  type CatalogProductListQuery,
  type CatalogProductPageSize,
} from "@celebix/saas-contracts";

const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;

export type ProductListUrlState = Readonly<{
  query: CatalogProductListQuery;
  pageSize: CatalogProductPageSize;
  cursor?: string;
}>;

type SearchParameters = Pick<URLSearchParams, "get" | "has">;

export function parseProductListUrlQuery(parameters: SearchParameters): CatalogProductListQuery {
  try {
    return parseCatalogProductListQuery({
      ...(parameters.has("q") ? { search: parameters.get("q") } : {}),
      ...(parameters.has("status") ? { status: parameters.get("status") } : {}),
      ...(parameters.has("stock") ? { stock: parameters.get("stock") } : {}),
      ...(parameters.has("category") ? { categoryId: parameters.get("category") } : {}),
      ...(parameters.has("brand") ? { brandId: parameters.get("brand") } : {}),
      ...(parameters.has("collection") ? { collectionId: parameters.get("collection") } : {}),
      ...(parameters.has("sort") ? { sort: parameters.get("sort") } : {}),
    });
  } catch {
    return Object.freeze({ sort: "updated-desc" });
  }
}

export function productListUrlQuery(value: unknown): string {
  const query = parseCatalogProductListQuery(value);
  const parameters = new URLSearchParams();
  if (query.search !== undefined) parameters.set("q", query.search);
  if (query.status !== undefined) parameters.set("status", query.status);
  if (query.stock !== undefined) parameters.set("stock", query.stock);
  if (query.categoryId !== undefined) parameters.set("category", query.categoryId);
  if (query.brandId !== undefined) parameters.set("brand", query.brandId);
  if (query.collectionId !== undefined) parameters.set("collection", query.collectionId);
  if (query.sort !== "updated-desc") parameters.set("sort", query.sort);
  return parameters.toString();
}

export function parseProductListUrlState(parameters: SearchParameters): ProductListUrlState {
  const query = parseProductListUrlQuery(parameters);
  let pageSize: CatalogProductPageSize = 20;
  try { pageSize = parseCatalogProductPageSize(Number(parameters.get("page") ?? 20)); }
  catch { /* Invalid paging dimensions reset without weakening the catalog query. */ }
  const cursor = parameters.get("cursor");
  return Object.freeze({
    query,
    pageSize,
    ...(cursor !== null && CURSOR.test(cursor) ? { cursor } : {}),
  });
}

export function productListUrlStateQuery(value: ProductListUrlState): string {
  const parameters = new URLSearchParams(productListUrlQuery(value.query));
  if (value.pageSize !== 20) parameters.set("page", String(parseCatalogProductPageSize(value.pageSize)));
  if (value.cursor !== undefined) {
    if (!CURSOR.test(value.cursor)) throw new TypeError("catalog_product_list_url_invalid");
    parameters.set("cursor", value.cursor);
  }
  return parameters.toString();
}
