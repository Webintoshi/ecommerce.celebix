"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProductDetailSummary } from "./ProductDetailSummary.tsx";
import { ProductSizeGuideDialog } from "./ProductSizeGuideDialog.tsx";
import { resolveProductGallerySelection, resolvePublicProductVariantMedia, type PublicProduct, type PublicStarterThemePresentationV3, type StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

type StarterCartConfigV2 = PublicStarterThemePresentationV3["cart"];
type CardProduct = Pick<PublicProduct, "id" | "title" | "priceCents"> & Readonly<{ media: readonly Readonly<{ url: string; altText: string }>[] }>;
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);

/** Read-only representative PDP: state changes are local; no commerce provider or API. */
export function ProductDetailPreview({ product, options, cart, mode, relatedProducts = [], renderText }: Readonly<{
  product: PublicProduct;
  options: StarterProductDetailConfigV2;
  cart: Pick<StarterCartConfigV2, "showQuantitySelector">;
  mode: "desktop" | "mobile";
  relatedProducts?: readonly CardProduct[];
  renderText?: (value: string) => ReactNode;
}>) {
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(product.variants.find(({ available }) => available)?.id ?? product.variants[0]?.id ?? "");
  const images = resolvePublicProductVariantMedia(product, variantId);
  const [currentMediaId, setCurrentMediaId] = useState<string | null>(() => images[0]?.id ?? null);
  const selectedMediaId = resolveProductGallerySelection(images, currentMediaId);
  useEffect(() => { setCurrentMediaId(selectedMediaId); }, [selectedMediaId]);
  const selectedVariant = product.variants.find((variant) => variant.id === variantId);
  const selectedProduct = selectedVariant ? { ...product, priceCents: selectedVariant.priceCents, compareAtCents: selectedVariant.compareAtCents, variants: [selectedVariant] } : product;
  const activeImage = images.find(({ id }) => id === selectedMediaId);
  const text = (value: string) => renderText ? renderText(value) : value.replace(/<[^>]*>/g, " ");
  const information = options.informationSections.flatMap<Readonly<{key:string;heading:string;content:ReactNode}>>((section) => {
    if (section === "description" && product.description) return [{ key: section, heading: "Açıklama", content: text(product.description) }];
    if (section === "materials_and_care" && product.merchandising?.materialsAndCare) return [{ key: section, heading: "Malzeme ve bakım", content: text(product.merchandising.materialsAndCare) }];
    if (section === "certifications" && product.merchandising?.certifications.length) return [{ key: section, heading: "Sertifikalar", content: <ul>{product.merchandising.certifications.map((item) => <li key={item}>{item}</li>)}</ul> }];
    return [];
  });
  return <div className="celebix-product-preview" data-preview-product-id={product.id} data-mode={mode}>
    {options.showBreadcrumbs ? <nav className="celebix-product-breadcrumb" aria-label="İçerik yolu"><span>Ana sayfa</span>{product.categoryPath?.map((item) => <span key={item.slug}> / {item.name}</span>)}<span> / {product.title}</span></nav> : null}
    <div className="celebix-product-experience">
      <div className="celebix-product-gallery" data-gallery={options.galleryStyle}>
        {activeImage ? <img className="celebix-product-main-image" src={activeImage.url} alt={activeImage.altText || product.title} width={activeImage.width} height={activeImage.height} /> : <p>Bu ürünün görseli bulunmuyor.</p>}
        {images.length > 1 ? <div className="celebix-product-thumbnails">{images.map((image, index) => <button type="button" key={image.id} aria-label={`${index + 1}. ürün görseli`} aria-pressed={selectedMediaId === image.id} onClick={() => setCurrentMediaId(image.id)}><img src={image.url} alt="" /></button>)}</div> : null}
      </div>
      <div className="celebix-product-purchase-column">
        <ProductDetailSummary product={selectedProduct} options={options} />
        {product.variants.length ? <label className="celebix-product-option">Ürün seçeneği<select value={variantId} onChange={(event) => setVariantId(event.currentTarget.value)}>{product.variants.map((variant) => <option key={variant.id} value={variant.id} disabled={!variant.available}>{variant.title}{variant.available ? "" : " — Tükendi"}</option>)}</select></label> : null}
        {options.showSizeGuide && product.merchandising?.sizeGuide ? <ProductSizeGuideDialog heading={product.merchandising.sizeGuide.heading}>{text(product.merchandising.sizeGuide.body)}</ProductSizeGuideDialog> : null}
        <div className="celebix-product-purchase" data-mobile-purchase={mode === "mobile" && options.mobileStickyPurchase ? "true" : undefined}>
          {cart.showQuantitySelector ? <div className="celebix-preview-quantity" aria-label="Ürün adedi"><button type="button" aria-label="Adedi azalt" disabled={quantity === 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button><output>{quantity}</output><button type="button" aria-label="Adedi artır" onClick={() => setQuantity((value) => Math.min(99, value + 1))}>+</button></div> : null}
          <button type="button" disabled>Sepete ekle</button>
          <small>Önizleme — satın alma işlemi yapılmaz.</small>
        </div>
        {information.map((item, index) => <details key={item.key} open={index === 0}><summary>{item.heading}</summary><div>{item.content}</div></details>)}
        {options.informationSections.includes("shipping_and_returns") ? <p className="celebix-preview-note">Kargo ve iadeler alanı yayındaki mağaza politikaları bulunduğunda gösterilir.</p> : null}
      </div>
    </div>
    {options.showApprovedReviews && product.reviews?.length ? <section className="celebix-product-reviews" aria-label="Onaylı ürün yorumları"><h2>Müşteri yorumları</h2>{product.reviews.map((review, index) => <article key={`${review.reviewerName}-${index}`}><strong>{review.reviewerName}</strong><span aria-label={`${review.rating} yıldız`}>{"★".repeat(review.rating)}</span>{review.title ? <h3>{review.title}</h3> : null}<p>{review.body}</p>{review.merchantReply ? <aside>{review.merchantReply}</aside> : null}</article>)}</section> : null}
    {options.showRelatedProducts && relatedProducts.length ? <section className="celebix-product-related"><h2>Benzer ürünler</h2><div>{relatedProducts.map((item) => <article key={item.id}>{item.media[0] ? <img src={item.media[0].url} alt={item.media[0].altText || item.title} /> : null}<h3>{item.title}</h3><strong>{money(item.priceCents)}</strong></article>)}</div></section> : null}
  </div>;
}

export function RepresentativeCartPreview({ product, settings }: Readonly<{ product?: Pick<PublicProduct, "title" | "priceCents" | "media">; settings: StarterCartConfigV2 }>) {
  return <aside className="celebix-preview-cart" aria-label="Yan sepet önizlemesi"><h2>Sepetim</h2><small>Örnek sepet görünümü</small>{product ? <div className="celebix-preview-cart-line">{product.media[0] ? <img src={product.media[0].url} alt={product.media[0].altText || product.title} /> : null}<div><strong>{product.title}</strong><span>{money(product.priceCents)}</span>{settings.showQuantitySelector ? <span className="celebix-preview-quantity"><button type="button" disabled>−</button><b>1</b><button type="button" disabled>+</button></span> : null}</div></div> : <p>Ürün seçildiğinde sepet görünümü burada gösterilir.</p>}{settings.showShippingProgress ? <p data-shipping-progress="true">Kargo tutarı teslimat bilgilerinize göre hesaplanır.</p> : null}{settings.showCheckoutReadiness ? <p data-checkout-readiness="true">Adres ve ödeme bilgileri ödeme adımında tamamlanır.</p> : null}{settings.trustMessage ? <p>{settings.trustMessage}</p> : null}<button type="button" disabled>Ödemeye geç</button></aside>;
}
