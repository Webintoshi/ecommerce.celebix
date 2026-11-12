"use client";

import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import Link from "next/link";

import { EzmeoProductImage } from "../themes/ezmeo/EzmeoProductImage";

import { formatTry } from "../lib/format.ts";
import { productPath } from "../lib/storefront-routes.ts";
import { useCommercePolicy } from "./CommercePolicyProvider";
import { productBadge } from "./product-card-model";
import { ProductCardRating } from "./ProductCardRating";

export type ProductCardContentProduct = Pick<PublicProduct, "id" | "slug" | "title" | "currency" | "priceCents" | "compareAtCents" | "available" | "pricesHidden" | "reviewSummary"> & Readonly<{
  brand?: Readonly<{ name: string }>;
  media: readonly Readonly<{ url: string; altText: string; width?: number; height?: number }>[];
}>;

const ezmeoCardImageSizes = "(max-width: 760px) calc((100vw - 38px) / 2), min(25vw, 360px)";

export function ProductCardContent({ product, locale, cardStyle, imageRatio, prefetch }: Readonly<{
  product: ProductCardContentProduct;
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
  prefetch?: boolean;
}>) {
  const policy = useCommercePolicy();
  const pricesHidden = policy.hidePrices || product.pricesHidden === true || product.priceCents === null;
  const primary = product.media[0];
  const secondary = product.media[1];
  const badge = productBadge(pricesHidden ? { ...product, priceCents:null, compareAtCents:null } : product);
  return <Link className="product-card-link" href={productPath(locale, product.slug)} prefetch={prefetch} data-product-card-content="true">
    <div className="product-image-shell">
      {primary ? <>
        <EzmeoProductImage media={primary} alt={primary.altText || product.title} className="product-image-primary" sizes={ezmeoCardImageSizes} />
        {secondary ? <EzmeoProductImage media={secondary} alt="" className="product-image-secondary" sizes={ezmeoCardImageSizes} fetchPriority="low" /> : null}
      </> : <span>Görsel yakında</span>}
      {badge ? <em className={`product-card-badge is-${badge}`}>{badge === "sale" ? "İndirim" : "Tükendi"}</em> : null}
    </div>
    <div className="product-card-copy">
      {product.brand?.name ? <span className="product-card-brand">{product.brand.name}</span> : null}
      <h3>{product.title}</h3>
      {product.reviewSummary ? <ProductCardRating summary={product.reviewSummary} /> : null}
      {!pricesHidden && product.priceCents !== null ? <div className="price-row">
        {product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{formatTry(product.compareAtCents)}</del> : null}
        <strong>{formatTry(product.priceCents)}</strong>
      </div> : null}
    </div>
  </Link>;
}
