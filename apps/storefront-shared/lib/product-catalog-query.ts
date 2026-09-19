import type { ProductExplorerFilter, ProductExplorerOrder } from "./product-explorer.ts";

export const PRODUCT_CATALOG_PAGE_SIZE = 24;
export type ProductCatalogSelection = Readonly<{
  query: string; filter: ProductExplorerFilter; order: ProductExplorerOrder; offset: number;
}>;

function single(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseProductCatalogQuery(input: Readonly<Record<string, string | string[] | undefined>>): ProductCatalogSelection {
  const rawQuery = single(input.q)?.trim() ?? "";
  const query = !/[\u0000-\u001f\u007f]/u.test(rawQuery) && new TextEncoder().encode(rawQuery).length <= 100 ? rawQuery : "";
  const filterValue = single(input.filter);
  const orderValue = single(input.sort);
  const offsetValue = single(input.offset);
  const offset = offsetValue && /^(?:0|[1-9]\d{0,4})$/u.test(offsetValue) ? Number(offsetValue) : 0;
  return Object.freeze({
    query,
    filter: filterValue === "available" || filterValue === "discounted" ? filterValue : "all",
    order: orderValue === "title-asc" || orderValue === "price-asc" || orderValue === "price-desc" ? orderValue : "featured",
    offset: offset <= 10_000 && offset % PRODUCT_CATALOG_PAGE_SIZE === 0 ? offset : 0,
  });
}

export function catalogHref(path: string, selection: ProductCatalogSelection, offset: number): string {
  const parameters = new URLSearchParams();
  if (selection.query) parameters.set("q", selection.query);
  if (selection.filter !== "all") parameters.set("filter", selection.filter);
  if (selection.order !== "featured") parameters.set("sort", selection.order);
  if (offset > 0) parameters.set("offset", String(offset));
  return `${path}${parameters.size ? `?${parameters}` : ""}`;
}
