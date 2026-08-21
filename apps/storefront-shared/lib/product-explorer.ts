import type { PublicProduct } from "@celebix/saas-contracts";

import { availableProductsFirst } from "./public-product-ordering.ts";

export type ProductExplorerFilter = "all" | "available" | "discounted";
export type ProductExplorerOrder = "featured" | "title-asc" | "price-asc" | "price-desc";

export type ProductExplorerSelection = Readonly<{
  query: string;
  filter: ProductExplorerFilter;
  order: ProductExplorerOrder;
}>;

function searchable(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("tr-TR");
}

export function selectProducts(
  products: readonly PublicProduct[],
  selection: ProductExplorerSelection,
): readonly PublicProduct[] {
  const query = searchable(selection.query.trim());
  const filtered = products.filter((product) => {
    if (query && !searchable(product.title).includes(query)) return false;
    if (selection.filter === "available") return product.available;
    if (selection.filter === "discounted") return product.compareAtCents !== undefined && product.compareAtCents > product.priceCents;
    return true;
  });
  const selected = [...filtered];
  if (selection.order === "title-asc") selected.sort((left, right) => left.title.localeCompare(right.title, "tr-TR") || left.id.localeCompare(right.id));
  if (selection.order === "price-asc") selected.sort((left, right) => left.priceCents - right.priceCents || left.id.localeCompare(right.id));
  if (selection.order === "price-desc") selected.sort((left, right) => right.priceCents - left.priceCents || left.id.localeCompare(right.id));
  return availableProductsFirst(selected);
}
