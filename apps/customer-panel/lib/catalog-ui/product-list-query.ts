import {
  parseCatalogProductListQuery,
  type CatalogProductListQuery,
} from "@celebix/saas-contracts";

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
