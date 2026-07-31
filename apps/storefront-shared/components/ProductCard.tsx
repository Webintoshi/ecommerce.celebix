import Link from "next/link";
import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { formatTry } from "@/lib/format.ts";
import { FavoriteButton } from "./FavoriteButton";
import { ProductCardCartButton } from "./ProductCardCartButton";

export function ProductCard({ product, cardStyle, imageRatio }: { product: PublicProduct; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }) {
  const primary = product.media[0];
  const purchaseVariant = product.variants.find(({ available, priceCents }) => available && priceCents === product.priceCents);
  return <article className={`product-card card-${cardStyle} image-${imageRatio}`}><Link className="product-card-link" href={`/products/${product.slug}`}><div className="product-image-shell">{primary ? <img src={primary.url} alt={primary.altText || product.title} loading="lazy" width={primary.width} height={primary.height} /> : <span>Görsel yakında</span>}{!product.available ? <em>Tükendi</em> : null}</div><div className="product-card-copy"><h3>{product.title}</h3><div className="price-row">{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div><span className="product-card-action">Ürünü incele</span></div></Link><ProductCardCartButton productId={product.id} variantId={purchaseVariant?.id ?? product.variants[0]!.id} productTitle={product.title} available={Boolean(purchaseVariant)} /><FavoriteButton productId={product.id} productTitle={product.title} /></article>;
}
