"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { PublicProduct } from "@celebix/saas-contracts";
import { useProductVariantMedia } from "../../components/ProductVariantMedia";
import { galleryEscapeRequested, lockGalleryDocument, scheduleGalleryFocus } from "../../components/product-gallery-model";
import styles from "./ezmeo-product-gallery.module.css";

function GalleryArrow({ next = false }: { next?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={next ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} /></svg>;
}
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
function revealThumbnail(row: HTMLDivElement | null, index: number, behavior: ScrollBehavior) {
  const button = row?.querySelectorAll("button")[index];
  if (!row || !button) return;
  const left = button.offsetLeft;
  const right = left + button.offsetWidth;
  if (left < row.scrollLeft) row.scrollTo({ left, behavior });
  else if (right > row.scrollLeft + row.clientWidth) row.scrollTo({ left: right - row.clientWidth, behavior });
}

export function EzmeoProductGallery({ product }: Readonly<{ product: PublicProduct }>) {
  const { images, selectedMediaId, selectMedia } = useProductVariantMedia(product);
  const selected = Math.max(0, images.findIndex(({ id }) => id === selectedMediaId));
  const active = images[selected];
  const hasImage = Boolean(active);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const syncedImages = useRef<typeof images | null>(null);
  const syncedWidth = useRef(0);
  const scrollTarget = useRef<number | null>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const closeZoom = useCallback(() => {
    setZoomed(false);
    scheduleGalleryFocus(zoomTriggerRef.current, callback => window.requestAnimationFrame(callback));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const sync = () => {
      const width = track.clientWidth;
      if (width <= 0 || (syncedImages.current === images && syncedWidth.current === width)) return;
      syncedImages.current = images;
      syncedWidth.current = width;
      scrollTarget.current = null;
      track.scrollTo({ left: selected * width, behavior: "auto" });
      revealThumbnail(thumbnailRef.current, selected, "auto");
    };
    sync();
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(sync) : null;
    observer?.observe(track);
    window.addEventListener("resize", sync);
    return () => { observer?.disconnect(); window.removeEventListener("resize", sync); };
  }, [images, selected]);

  useEffect(() => {
    revealThumbnail(thumbnailRef.current, selected, scrollBehavior());
  }, [images, selected]);

  useEffect(() => {
    if (!zoomed) return;
    if (!hasImage) { closeZoom(); return; }
    const restore = lockGalleryDocument(document.body);
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const escape = (event: globalThis.KeyboardEvent) => { if (galleryEscapeRequested(event.key)) closeZoom(); };
    document.addEventListener("keydown", escape);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", escape); restore(); };
  }, [closeZoom, hasImage, zoomed]);

  const choose = (index: number, instant = false) => {
    const image = images[index];
    const track = trackRef.current;
    if (!image || !track) return;
    scrollTarget.current = Math.abs(track.scrollLeft - index * track.clientWidth) > 2 ? index : null;
    selectMedia(image.id);
    track.scrollTo({ left: index * track.clientWidth, behavior: instant ? "auto" : scrollBehavior() });
  };
  const focusSlide = (index: number) => {
    window.requestAnimationFrame(() => trackRef.current?.querySelectorAll<HTMLButtonElement>("[data-ezmeo-slide]")[index]?.focus({ preventScroll: true }));
  };
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth <= 0 || images.length === 0) return;
    if (scrollTarget.current !== null) {
      if (Math.abs(track.scrollLeft - scrollTarget.current * track.clientWidth) > 2) return;
      scrollTarget.current = null;
    }
    const index = Math.max(0, Math.min(images.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
    if (index !== selected && track.contains(document.activeElement)) focusSlide(index);
    selectMedia(images[index].id);
  };
  const interruptScroll = () => { scrollTarget.current = null; };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (images.length < 2) return;
    const index = event.key === "ArrowLeft" ? Math.max(0, selected - 1) : event.key === "ArrowRight" ? Math.min(images.length - 1, selected + 1) : event.key === "Home" ? 0 : event.key === "End" ? images.length - 1 : null;
    if (index === null) return;
    event.preventDefault();
    choose(index, true);
    focusSlide(index);
  };
  const openZoom = (index: number, event: MouseEvent<HTMLButtonElement>) => {
    zoomTriggerRef.current = event.currentTarget;
    scrollTarget.current = null;
    trackRef.current?.scrollTo({ left: index * trackRef.current.clientWidth, behavior: "auto" });
    selectMedia(images[index].id);
    setZoomed(true);
  };
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
  };

  if (!active) return <div className={styles.empty} data-ezmeo-gallery-empty>Görsel yakında</div>;
  return <div className={styles.root} data-ezmeo-gallery>
    <div className={styles.viewport} ref={trackRef} data-ezmeo-gallery-track role="group" aria-label="Ürün görsel galerisi" aria-roledescription="karusel" onScroll={onScroll} onPointerDown={interruptScroll} onWheel={interruptScroll} onKeyDown={keyboard}>
      {images.map((image, index) => <button className={styles.slide} data-ezmeo-slide key={image.id} type="button" aria-label={`${product.title}, ${index + 1}. görseli büyüt`} aria-current={index === selected ? "true" : undefined} aria-hidden={index !== selected || undefined} tabIndex={index === selected ? 0 : -1} onClick={event => openZoom(index, event)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt={image.altText || product.title} width={image.width} height={image.height} loading={index === 0 ? "eager" : "lazy"} decoding="async" />
        <span className={styles.zoomMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5M7 10h6m-3-3v6" /></svg></span>
      </button>)}
    </div>
    {images.length > 1 ? <>
      <div className={styles.navigation} aria-label="Görseller arasında gezinme">
        <button type="button" aria-label="Önceki görsel" disabled={selected === 0} onClick={() => choose(selected - 1)}><GalleryArrow /></button>
        <span className={styles.progress} aria-hidden="true"><i style={{ width: `${((selected + 1) / images.length) * 100}%` }} /></span>
        <output className={styles.counter} aria-live="polite" aria-label="Görsel konumu">{selected + 1} / {images.length}</output>
        <button type="button" aria-label="Sonraki görsel" disabled={selected === images.length - 1} onClick={() => choose(selected + 1)}><GalleryArrow next /></button>
      </div>
      <div className={styles.thumbnails} ref={thumbnailRef} role="group" aria-label="Ürün görselleri">
        {images.map((image, index) => <button data-ezmeo-thumbnail key={image.id} type="button" onClick={() => choose(index)} aria-label={`${index + 1}. görseli göster`} aria-current={index === selected ? "true" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt="" width={image.width} height={image.height} loading="lazy" decoding="async" />
        </button>)}
      </div>
    </> : null}
    {zoomed ? <div className="gallery-zoom-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeZoom(); }}><div className="gallery-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby="ezmeo-zoom-title" onKeyDown={trapFocus}>
      <h2 className="sr-only" id="ezmeo-zoom-title">{product.title} ürün görseli</h2>
      <button ref={closeRef} className="gallery-zoom-close" type="button" aria-label="Büyütülmüş görseli kapat" onClick={closeZoom}>×</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}<img src={active.url} alt={active.altText || product.title} width={active.width} height={active.height} />
    </div></div> : null}
  </div>;
}
