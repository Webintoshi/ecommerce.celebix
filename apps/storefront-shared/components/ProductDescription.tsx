import type { PublicProduct } from "../../../packages/saas-contracts/src/storefront/index.ts";
import { renderStarterProductDescription } from "@/lib/product-description.ts";

export function ProductDescription({ product }: { product: PublicProduct }) {
  const descriptionHtml = renderStarterProductDescription(
    product.description,
    product.title,
  );

  return (
    <section
      className="product-description-section store-container"
      aria-labelledby="product-description-title"
    >
      <header className="product-description-heading">
        <span>ÜRÜN BİLGİLERİ</span>
        <h2 id="product-description-title">Ürün açıklaması</h2>
      </header>
      {descriptionHtml ? (
        <div
          className="product-description-rich-text"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      ) : (
        <p className="product-description-empty">
          Bu ürün için ayrıntılı açıklama yakında eklenecek.
        </p>
      )}
    </section>
  );
}
