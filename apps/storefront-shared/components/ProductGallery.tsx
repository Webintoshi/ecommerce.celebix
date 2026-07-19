"use client";
import { useState } from "react";
import type { PublicProduct } from "../../../packages/saas-contracts/src/storefront/index.ts";

export function ProductGallery({ product }: { product: PublicProduct }) {
  const images = [...product.media].sort((left, right) => left.sortOrder - right.sortOrder);
  const [selected, setSelected] = useState(0);
  const active = images[selected];
  if (!active) return <div className="gallery-empty"><span>Görsel yakında</span></div>;
  return <div className="product-gallery"><div className="gallery-main"><img src={active.url} alt={active.altText || product.title} width={active.width} height={active.height} /></div>{images.length > 1 ? <div className="gallery-thumbnails" aria-label="Ürün görselleri">{images.map((image, index) => <button className={index === selected ? "is-active" : ""} key={image.id} type="button" onClick={() => setSelected(index)} aria-label={`${index + 1}. görseli göster`}><img src={image.url} alt="" width={image.width} height={image.height} /></button>)}</div> : null}</div>;
}
