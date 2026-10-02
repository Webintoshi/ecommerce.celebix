"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PublicProduct } from "@celebix/saas-contracts";
import { useProductVariantMedia } from "../../components/ProductVariantMedia";
import styles from "./siora-product-gallery.module.css";

type MouseDrag = { pointerId: number; startX: number; startLeft: number; moved: boolean };

function motionBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function ZoomIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="10" cy="10" r="6" /><path d="m14.5 14.5 6 6M7 10h6m-3-3v6" /></svg>;
}

function ArrowIcon({ previous = false }: Readonly<{ previous?: boolean }>) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d={previous ? "m14 5-7 7 7 7" : "m10 5 7 7-7 7"} /></svg>;
}

export function SioraProductGallery({ product }: Readonly<{ product: PublicProduct }>) {
  const { images, selectedMediaId, selectMedia } = useProductVariantMedia(product);
  const selected = Math.max(0, images.findIndex(({ id }) => id === selectedMediaId));
  const active = images[selected];
  const mediaKey = JSON.stringify(images.map(({ id }) => id));
  const descriptionId = useId();
  const titleId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<MouseDrag | null>(null);
  const suppressClickRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticRef = useRef(false);
  const scrollSelectionRef = useRef<string | null>(null);
  const previousMediaKeyRef = useRef(mediaKey);
  const selectedIndexRef = useRef(selected);
  const [zoomed, setZoomed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const alignPanel = useCallback((index: number, behavior: ScrollBehavior) => {
    const strip = stripRef.current;
    const panel = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !panel) return;
    programmaticRef.current = true;
    strip.scrollTo({ left: panel.offsetLeft, behavior });
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => { programmaticRef.current = false; }, behavior === "smooth" ? 500 : 0);
  }, []);

  const selectIndex = (index: number) => {
    if (!images.length) return;
    const next = (index + images.length) % images.length;
    selectMedia(images[next].id);
    scrollSelectionRef.current = images[next].id;
    alignPanel(next, motionBehavior());
    setEnlarged(false);
  };

  useEffect(() => {
    selectedIndexRef.current = selected;
    const changedMedia = previousMediaKeyRef.current !== mediaKey;
    previousMediaKeyRef.current = mediaKey;
    if (changedMedia || scrollSelectionRef.current !== selectedMediaId) alignPanel(selected, "auto");
    scrollSelectionRef.current = selectedMediaId;
    const thumbs = thumbsRef.current;
    const thumb = thumbs?.children[selected] as HTMLElement | undefined;
    if (thumbs && thumb) {
      const left = thumb.offsetLeft;
      const right = left + thumb.offsetWidth;
      if (left < thumbs.scrollLeft) thumbs.scrollTo({ left, behavior: "auto" });
      else if (right > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollTo({ left: right - thumbs.clientWidth, behavior: "auto" });
    }
  }, [alignPanel, mediaKey, selected, selectedMediaId]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new window.ResizeObserver(() => alignPanel(selectedIndexRef.current, "auto"));
    observer.observe(strip);
    return () => observer.disconnect();
  }, [alignPanel]);

  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    if (suppressionTimerRef.current) clearTimeout(suppressionTimerRef.current);
  }, []);

  useEffect(() => {
    if (!zoomed) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; };
  }, [zoomed]);

  const openZoom = (opener: HTMLElement, index = selected) => {
    if (!images[index] || !dialogRef.current) return;
    openerRef.current = opener;
    selectMedia(images[index].id);
    setEnlarged(false);
    if (!dialogRef.current.open) dialogRef.current.showModal();
    setZoomed(true);
    closeRef.current?.focus();
  };

  const closeZoom = () => dialogRef.current?.close();
  const restoreZoomFocus = () => {
    setZoomed(false);
    setEnlarged(false);
    openerRef.current?.focus({ preventScroll: true });
  };

  const onGalleryKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      selectIndex(selected + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openZoom(event.currentTarget);
    }
  };

  const onScroll = () => {
    if (programmaticRef.current || dragRef.current) return;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const strip = stripRef.current;
      if (!strip || !images.length) return;
      const firstPanel = strip.children[0] as HTMLElement | undefined;
      if (!firstPanel?.offsetWidth) return;
      const next = Math.min(images.length - 1, Math.round(strip.scrollLeft / firstPanel.offsetWidth));
      const id = images[next].id;
      scrollSelectionRef.current = id;
      selectMedia(id);
    }, 100);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    programmaticRef.current = false;
    suppressClickRef.current = false;
    if (suppressionTimerRef.current) clearTimeout(suppressionTimerRef.current);
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startLeft: event.currentTarget.scrollLeft, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 8) {
      drag.moved = true;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
    }
    if (drag.moved) {
      event.preventDefault();
      event.currentTarget.scrollLeft = drag.startLeft - distance;
    }
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!drag?.moved) return;
    const panel = event.currentTarget.children[0] as HTMLElement | undefined;
    if (panel?.offsetWidth) selectIndex(Math.min(images.length - 1, Math.round(event.currentTarget.scrollLeft / panel.offsetWidth)));
    suppressionTimerRef.current = setTimeout(() => { suppressClickRef.current = false; }, 200);
  };

  return <div className={styles.gallery} role="group" aria-label={`${product.title} fotoğraf galerisi`}>
    <p className={styles.srOnly} id={descriptionId}>Fotoğraflar arasında gezinmek için sağ ve sol ok tuşlarını, büyütmek için Enter tuşunu kullanın.</p>
    {active ? <>
      <div ref={stripRef} className={styles.strip} tabIndex={0} aria-label="Ürün fotoğrafları" aria-describedby={descriptionId} onKeyDown={onGalleryKeyDown} onScroll={onScroll} onWheel={() => { programmaticRef.current = false; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
        {images.map((image, index) => <button className={styles.panel} key={image.id} type="button" tabIndex={-1} aria-label={`${index + 1}. fotoğrafı büyüt`} onClick={(event) => { if (!suppressClickRef.current) openZoom(event.currentTarget, index); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.altText || `${product.title}, fotoğraf ${index + 1}`} width={image.width} height={image.height} loading={index < 2 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" draggable={false} />
        </button>)}
      </div>
      <div ref={thumbsRef} className={styles.thumbnails} aria-label="Fotoğraf seçimi">{images.map((image, index) => <button key={image.id} type="button" className={styles.thumbnail} aria-label={`${index + 1}. fotoğrafı göster`} aria-current={index === selected ? "true" : undefined} onClick={() => selectIndex(index)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt="" width={image.width} height={image.height} loading="lazy" decoding="async" draggable={false} />
      </button>)}</div>
      <button className={styles.zoomButton} type="button" aria-label="Seçili fotoğrafı büyüt" onClick={(event) => openZoom(event.currentTarget)}><ZoomIcon /></button>
    </> : <div className={styles.empty}>Görsel yakında</div>}
    <dialog ref={dialogRef} className={styles.zoomDialog} aria-labelledby={titleId} onClose={restoreZoomFocus} onCancel={(event) => { event.preventDefault(); closeZoom(); }} onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); selectIndex(selected + (event.key === "ArrowRight" ? 1 : -1)); }
    }}>
      <div className={styles.zoomToolbar}>
        <h2 className={styles.srOnly} id={titleId}>{product.title} büyütülmüş fotoğraf</h2>
        <p aria-live="polite">{selected + 1} / {images.length}</p>
        <button ref={closeRef} type="button" className={styles.zoomClose} aria-label="Büyütülmüş fotoğrafı kapat" onClick={closeZoom}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="m5 5 14 14M5 19 19 5" /></svg></button>
      </div>
      <div className={styles.zoomContent} data-enlarged={enlarged || undefined}>
        {zoomed && active ? <button type="button" className={styles.zoomPhoto} aria-label={enlarged ? "Fotoğrafı küçült" : "Fotoğrafı daha fazla büyüt"} aria-pressed={enlarged} onClick={() => setEnlarged(!enlarged)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={active.url} alt={active.altText || product.title} width={active.width} height={active.height} draggable={false} />
        </button> : null}
      </div>
      {images.length > 1 ? <><button type="button" className={`${styles.zoomNav} ${styles.previous}`} aria-label="Önceki fotoğraf" onClick={() => selectIndex(selected - 1)}><ArrowIcon previous /></button><button type="button" className={`${styles.zoomNav} ${styles.next}`} aria-label="Sonraki fotoğraf" onClick={() => selectIndex(selected + 1)}><ArrowIcon /></button></> : null}
    </dialog>
  </div>;
}
