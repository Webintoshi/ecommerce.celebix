import type { PublicProduct, PublicStarterThemePresentation } from "@celebix/saas-contracts";

import { productGridOrder } from "@/lib/public-product-ordering.ts";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, locale, cardStyle, imageRatio, emptyTitle, emptyMessage, preserveOrder = false }: Readonly<{
  products: readonly PublicProduct[];
  locale: string;
  cardStyle: PublicStarterThemePresentation["theme"]["productCardStyle"];
  imageRatio: PublicStarterThemePresentation["theme"]["productImageRatio"];
  emptyTitle?: string;
  emptyMessage?: string;
  preserveOrder?: boolean;
}>) {
  const orderedProducts = productGridOrder(products, preserveOrder);
  return orderedProducts.length ? (
    <div className="product-grid">
      {orderedProducts.map((product) => (
        <ProductCard key={product.id} product={product} locale={locale} cardStyle={cardStyle} imageRatio={imageRatio} />
      ))}
    </div>
  ) : (
    <div className="store-empty">
      <span>◇</span>
      <h2>{emptyTitle ?? "Ürünler hazırlanıyor"}</h2>
      <p>{emptyMessage ?? "Bu mağazanın aktif ürünleri yakında burada olacak."}</p>
    </div>
  );
}
