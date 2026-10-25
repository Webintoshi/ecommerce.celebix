"use client";

import Link from "next/link";
import { ProductDetailSummary } from "@celebix/storefront-design-ui";
import type { PublicProduct, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

import { useCommercePolicy } from "./CommercePolicyProvider";
import { useProductVariantSelection } from "./ProductVariantMedia";

/** Keep the displayed price and SKU on the same selection as the gallery and cart. */
export function SelectedProductDetailSummary({ product, options, classes }: Readonly<{
  product: PublicProduct;
  options: Pick<StarterProductDetailConfigV2, "showSku" | "showBrand">;
  classes: Readonly<Record<string, string>>;
}>) {
  const [selectedId] = useProductVariantSelection(product);
  const policy = useCommercePolicy();
  const selected = product.variants.find(({ id }) => id === selectedId);
  const pricesHidden = policy.hidePrices || product.pricesHidden === true;
  const summary = {
    ...product,
    priceCents: pricesHidden ? null : selected ? selected.priceCents : product.priceCents,
    compareAtCents: pricesHidden ? undefined : selected ? selected.compareAtCents : product.compareAtCents,
    variants: selected ? [selected] : product.variants,
  };
  return <ProductDetailSummary product={summary} options={options} classes={classes}
    renderBrand={(name) => <Link className={classes.brand} href={`/search?q=${encodeURIComponent(name)}`}>{name}</Link>} />;
}
