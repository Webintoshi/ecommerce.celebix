"use client";
import { useCallback, useEffect, useReducer, useRef, type KeyboardEvent, type MouseEvent } from "react";
import type { PublicProduct } from "../../../packages/saas-contracts/src/storefront/index.ts";
import {
  galleryEscapeRequested,
  initialProductGalleryState,
  lockGalleryDocument,
  productGalleryReducer,
  scheduleGalleryFocus,
} from "./product-gallery-model";

export function ProductGallery({ product, style = "grid" }: { product: PublicProduct; style?: "grid" | "rail" }) {
  const images = [...product.media].sort((left, right) => left.sortOrder - right.sortOrder);
  const [gallery, dispatch] = useReducer(productGalleryReducer, initialProductGalleryState);
  const selected = Math.min(gallery.selected, Math.max(images.length - 1, 0));
  const zoomTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const active = images[selected];
  const closeZoom = useCallback(() => {
    dispatch({ type: "close" });
    scheduleGalleryFocus(zoomTriggerRef.current, (callback) => window.requestAnimationFrame(callback));
  }, []);
  useEffect(() => {
    if (!gallery.zoomed) return;
    const restoreDocument = lockGalleryDocument(document.body);
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const escape = (event: globalThis.KeyboardEvent) => { if (galleryEscapeRequested(event.key)) closeZoom(); };
    document.addEventListener("keydown", escape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", escape);
      restoreDocument();
    };
  }, [closeZoom, gallery.zoomed]);
  const openZoom = (index: number, event: MouseEvent<HTMLButtonElement>) => {
    zoomTriggerRef.current = event.currentTarget;
    dispatch({ type: "open", index, imageCount: images.length });
  };
  const trapZoomFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    closeRef.current?.focus();
  };
  if (!active) return <div className="gallery-empty"><span>Görsel yakında</span></div>;
  return <div className={`product-gallery gallery-${style}`}>
    <div className="gallery-main"><button className="gallery-zoom-trigger" type="button" aria-label={`${product.title} görselini büyüt`} onClick={(event) => openZoom(selected, event)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={active.url} alt={active.altText || product.title} width={active.width} height={active.height} /><span aria-hidden="true">＋</span></button></div>
    <div className="gallery-mobile-track">{images.map((image, index) => <button key={image.id} type="button" aria-label={`${index + 1}. görseli büyüt`} onClick={(event) => openZoom(index, event)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt={image.altText || product.title} width={image.width} height={image.height} /></button>)}</div>
    {images.length > 1 ? <div className="gallery-thumbnails" aria-label="Ürün görselleri">{images.map((image, index) => <button className={index === selected ? "is-active" : ""} key={image.id} type="button" onClick={() => dispatch({ type: "select", index, imageCount: images.length })} aria-label={`${index + 1}. görseli göster`} aria-current={index === selected ? "true" : undefined}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt="" width={image.width} height={image.height} /></button>)}</div> : null}
    {gallery.zoomed ? <div className="gallery-zoom-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeZoom(); }}><div className="gallery-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="gallery-zoom-title" onKeyDown={trapZoomFocus}><h2 className="sr-only" id="gallery-zoom-title">{product.title} ürün görseli</h2><button ref={closeRef} className="gallery-zoom-close" type="button" aria-label="Büyütülmüş görseli kapat" onClick={closeZoom}>×</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={active.url} alt={active.altText || product.title} width={active.width} height={active.height} /></div></div> : null}
  </div>;
}
