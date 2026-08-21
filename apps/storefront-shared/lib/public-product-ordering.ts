import type { PublicProduct } from "@celebix/saas-contracts";

export function availableProductsFirst(products: readonly PublicProduct[]): readonly PublicProduct[] {
  const available: PublicProduct[] = [];
  const unavailable: PublicProduct[] = [];
  for (const product of products) {
    if (product.available) available.push(product);
    else unavailable.push(product);
  }
  return Object.freeze([...available, ...unavailable]);
}
