import { PublicStorefrontRepositoryError, type PublicStorefrontRepository } from "@celebix/saas-data";
import type { PublicStorefrontRequestResult } from "./public-storefront.ts";
import { isValidProductCatalogSearch, parseProductCatalogQuery, PRODUCT_CATALOG_PAGE_SIZE } from "./product-catalog-query.ts";

export function createCatalogPageHandler(dependencies: Readonly<{
  resolveStorefront(headers: Headers): Promise<PublicStorefrontRequestResult>;
  queryCatalog: NonNullable<PublicStorefrontRepository["queryPublicCatalog"]>;
  queryCollection?: PublicStorefrontRepository["queryPublicCollection"];
}>) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  return async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    const allowed = new Set(["path", "q", "filter", "sort", "offset"]);
    if (request.method !== "GET" || [...params.keys()].some(key => !allowed.has(key) || params.getAll(key).length !== 1)) return json({ error: "invalid_catalog_request" }, 400);
    const path = params.get("path") ?? "";
    const scoped = /^\/(kategori|categories|koleksiyon|collections)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(path);
    if (path !== "/urunler" && path !== "/products" && (!scoped || scoped[2]!.length > 100)) return json({ error: "invalid_catalog_request" }, 400);
    const selection = parseProductCatalogQuery(Object.fromEntries(params));
    const offset = params.get("offset") ?? "0";
    if (String(selection.offset) !== offset || !isValidProductCatalogSearch(params.get("q") ?? "") || (params.has("filter") && !["all", "available", "discounted"].includes(params.get("filter")!)) || (params.has("sort") && !["featured", "title-asc", "price-asc", "price-desc"].includes(params.get("sort")!))) return json({ error: "invalid_catalog_request" }, 400);
    try {
      const selected = await dependencies.resolveStorefront(request.headers);
      if (selected.kind !== "active") return json({ error: "catalog_unavailable" }, selected.kind === "not_found" ? 404 : 503);
      const common = { storefront: selected.storefront, now: new Date(), query: selection.query, filter: selection.filter, order: selection.order, offset: selection.offset, limit: PRODUCT_CATALOG_PAGE_SIZE };
      const isCollection = scoped?.[1] === "collections" || scoped?.[1] === "koleksiyon";
      if (isCollection && !dependencies.queryCollection) return json({ error: "catalog_unavailable" }, 503);
      const page = isCollection
        ? await dependencies.queryCollection!({ ...common, slug: scoped![2]! })
        : await dependencies.queryCatalog({ ...common, categorySlug: scoped?.[2] ?? null });
      return json({ items: page.items, total: page.total, nextOffset: page.nextOffset });
    } catch (error) {
      return json({ error: "catalog_unavailable" }, error instanceof PublicStorefrontRepositoryError && error.code === "not_found" ? 404 : 503);
    }
  };
}
