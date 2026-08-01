import Link from "next/link";
import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";
import { formatTry } from "@/lib/format.ts";
import { FavoriteButton } from "./FavoriteButton";
import { ProductCardCartButton } from "./ProductCardCartButton";
import { ProductQuickView } from "./ProductQuickView";
import { cardAction, productBadge } from "./product-card-model";

export function ProductCard({ product, cardStyle, imageRatio }: { product: PublicProduct; cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"]; imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"] }) {
  const primary = product.media[0];
  const secondary = product.media[1], badge = productBadge(product), action = cardAction(product);
  const purchaseVariant = action === "quick_add" ? product.variants.find(({ available }) => available) : undefined;
  return <article className={`product-card card-${cardStyle} image-${imageRatio}`}><Link className="product-card-link" href={`/products/${product.slug}`}><div className="product-image-shell">{primary ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img className="product-image-primary" src={primary.url} alt={primary.altText || product.title} loading="lazy" width={primary.width} height={primary.height} />{secondary ? /* eslint-disable-next-line @next/next/no-img-element */<img className="product-image-secondary" src={secondary.url} alt="" loading="lazy" width={secondary.width} height={secondary.height} /> : null}</> : <span>Görsel yakında</span>}{badge ? <em className={`product-card-badge is-${badge}`}>{badge === "sale" ? "İndirim" : "Tükendi"}</em> : null}</div><div className="product-card-copy"><h3>{product.title}</h3><div className="price-row">{product.compareAtCents && product.compareAtCents > product.priceCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div><span className="product-card-action">Ürünü incele</span></div></Link>{purchaseVariant ? <ProductCardCartButton productId={product.id} variantId={purchaseVariant.id} productTitle={product.title} available label="Hızlı ekle" /> : action === "choose_options" ? <ProductQuickView product={product} /> : <button className="product-card-cart" type="button" disabled>Tükendi</button>}<FavoriteButton productId={product.id} productTitle={product.title} /></article>;
}
