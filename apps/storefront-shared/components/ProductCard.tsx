import type {
  PublicProduct,
  PublicStarterThemePresentation,
} from "@celebix/saas-contracts";

import { FavoriteButton } from "./FavoriteButton";
import { ProductCardCartButton } from "./ProductCardCartButton";
import { ProductCardContent } from "./ProductCardContent";
import { ProductQuickView } from "./ProductQuickView";
import { cardAction } from "./product-card-model";

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
  const action = cardAction(product);
  const purchaseVariant =
    action === "quick_add"
      ? product.variants.find(({ available }) => available)
      : undefined;
  return (
    <article className={`product-card card-${cardStyle} image-${imageRatio}`}>
      <ProductCardContent product={product} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />
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
