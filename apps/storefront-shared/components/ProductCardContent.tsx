import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import Link from "next/link";

import { formatTry } from "../lib/format.ts";
import { productPath } from "../lib/storefront-routes.ts";
import { productBadge } from "./product-card-model";

export function ProductCardContent({ product, locale, cardStyle, imageRatio, prefetch }: Readonly<{
  product: PublicProduct;
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
  prefetch?: boolean;
}>) {
  const primary = product.media[0];
  const secondary = product.media[1];
  const badge = productBadge(product);
  return <Link className="product-card-link" href={productPath(locale, product.slug)} prefetch={prefetch} data-product-card-content="true">
    <div className="product-image-shell">
      {primary ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="product-image-primary" src={primary.url} alt={primary.altText || product.title} loading="lazy" width={primary.width} height={primary.height} />
        {secondary ? <img className="product-image-secondary" src={secondary.url} alt="" loading="lazy" width={secondary.width} height={secondary.height} /> : null}
      </> : <span>Görsel yakında</span>}
      {badge ? <em className={`product-card-badge is-${badge}`}>{badge === "sale" ? "İndirim" : "Tükendi"}</em> : null}
    </div>
    <div className="product-card-copy">
      {product.brand?.name ? <span className="product-card-brand">{product.brand.name}</span> : null}
      <h3>{product.title}</h3>
      <div className="price-row">
        {product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{formatTry(product.compareAtCents)}</del> : null}
        <strong>{formatTry(product.priceCents)}</strong>
      </div>
    </div>
  </Link>;
}
