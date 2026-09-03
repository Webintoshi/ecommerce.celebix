import type {
  PublicProduct,
  PublicStarterThemePresentation,
} from "@celebix/saas-contracts";
import Link from "next/link";

import { formatTry } from "@/lib/format.ts";
import { productPath } from "@/lib/storefront-routes.ts";
import { FavoriteButton } from "./FavoriteButton";
import { ProductCardCartButton } from "./ProductCardCartButton";
import { ProductQuickView } from "./ProductQuickView";
import { cardAction, productBadge } from "./product-card-model";

export function ProductCard({
  product,
  locale,
  cardStyle,
  imageRatio,
}: Readonly<{
  product: PublicProduct;
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
}>) {
  const primary = product.media[0];
  const secondary = product.media[1];
  const badge = productBadge(product);
  const action = cardAction(product);
  const purchaseVariant =
    action === "quick_add"
      ? product.variants.find(({ available }) => available)
      : undefined;
  return (
    <article className={`product-card card-${cardStyle} image-${imageRatio}`}>
      <Link
        className="product-card-link"
        href={productPath(locale, product.slug)}
      >
        <div className="product-image-shell">
          {primary ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="product-image-primary"
                src={primary.url}
                alt={primary.altText || product.title}
                loading="lazy"
                width={primary.width}
                height={primary.height}
              />
              {secondary ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="product-image-secondary"
                  src={secondary.url}
                  alt=""
                  loading="lazy"
                  width={secondary.width}
                  height={secondary.height}
                />
              ) : null}
            </>
          ) : (
            <span>Görsel yakında</span>
          )}
          {badge ? (
            <em className={`product-card-badge is-${badge}`}>
              {badge === "sale" ? "İndirim" : "Tükendi"}
            </em>
          ) : null}
        </div>
        <div className="product-card-copy">
          {product.brand?.name ? (
            <span className="product-card-brand">{product.brand.name}</span>
          ) : null}
          <h3>{product.title}</h3>
          <div className="price-row">
            {product.compareAtCents &&
            product.compareAtCents > product.priceCents ? (
              <del>{formatTry(product.compareAtCents)}</del>
            ) : null}
            <strong>{formatTry(product.priceCents)}</strong>
          </div>
        </div>
      </Link>
      {purchaseVariant ? (
        <ProductCardCartButton
          productId={product.id}
          variantId={purchaseVariant.id}
          categoryId={product.primaryCategoryId}
          productTitle={product.title}
          currency={product.currency}
          valueMinor={purchaseVariant.priceCents}
          available
          label="Sepete ekle"
        />
      ) : action === "choose_options" ? (
        <ProductQuickView product={product} />
      ) : (
        <button className="product-card-cart" type="button" disabled>
          Tükendi
        </button>
      )}
      <FavoriteButton productId={product.id} productTitle={product.title} />
    </article>
  );
}
