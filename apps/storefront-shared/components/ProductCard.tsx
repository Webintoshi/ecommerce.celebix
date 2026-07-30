import Link from "next/link";
import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { formatTry } from "@/lib/format.ts";

export function ProductCard({ product, cardStyle, imageRatio }: { product: PublicProduct; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }) {
  const primary = product.media[0];
  return <Link className={`product-card card-${cardStyle} image-${imageRatio}`} href={`/products/${product.slug}`}><div className="product-image-shell">{primary ? <img src={primary.url} alt={primary.altText || product.title} loading="lazy" width={primary.width} height={primary.height} /> : <span>Görsel yakında</span>}{!product.available ? <em>Tükendi</em> : null}</div><div className="product-card-copy"><h3>{product.title}</h3><div className="price-row">{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div></div></Link>;
}
