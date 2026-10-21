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
  const pricesHidden = products.some(product => product.priceCents === null);
  const query = searchable(selection.query.trim());
  const filtered = products.filter((product) => {
    if (query && !searchable(product.title).includes(query)) return false;
    if (selection.filter === "available") return product.available;
    if (!pricesHidden && selection.filter === "discounted") return typeof product.compareAtCents === "number" && typeof product.priceCents === "number" && product.compareAtCents > product.priceCents;
    return true;
  });
  const selected = [...filtered];
  if (selection.order === "title-asc") selected.sort((left, right) => left.title.localeCompare(right.title, "tr-TR") || left.id.localeCompare(right.id));
  if (!pricesHidden && selection.order === "price-asc") selected.sort((left, right) => (left.priceCents !== null && right.priceCents !== null ? left.priceCents - right.priceCents : 0) || left.id.localeCompare(right.id));
  if (!pricesHidden && selection.order === "price-desc") selected.sort((left, right) => (left.priceCents !== null && right.priceCents !== null ? right.priceCents - left.priceCents : 0) || left.id.localeCompare(right.id));
  return availableProductsFirst(selected);
}
