import Link from "next/link";
import type { PublicProduct } from "../../../packages/saas-contracts/src/storefront/index.ts";
import { formatTry } from "@/lib/format.ts";

export function ProductCard({ product }: { product: PublicProduct }) {
  const primary = product.media[0];
  return <Link className="product-card" href={`/products/${product.slug}`}><div className="product-image-shell">{primary ? <img src={primary.url} alt={primary.altText || product.title} loading="lazy" width={primary.width} height={primary.height} /> : <span>Görsel yakında</span>}{!product.available ? <em>Tükendi</em> : null}</div><div className="product-card-copy"><h3>{product.title}</h3><div className="price-row">{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div></div></Link>;
}
