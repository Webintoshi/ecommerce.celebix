"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PublicProduct } from "@celebix/saas-contracts";
import { useProductVariantMedia } from "../../components/ProductVariantMedia";
import styles from "./guzide-product-gallery.module.css";

function Arrow({ previous = false }: Readonly<{ previous?: boolean }>) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d={previous ? "m14 5-7 7 7 7" : "m10 5 7 7-7 7"} /></svg>;
}

function ZoomIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M7.5 10.5h6m-3-3v6" /></svg>;
}

function QuestionIcon() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-1.3.8-1.9 1.2-1.9 2.9M12 17h.01" /></svg>;
}

function mobileGallery(): boolean {
  return window.matchMedia("(max-width: 900px)").matches;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function GuzideProductGallery({ product, supportHref }: Readonly<{ product: PublicProduct; supportHref?: string }>) {
  const { images, selectedMediaId, selectMedia } = useProductVariantMedia(product);
  const selected = Math.max(0, images.findIndex(({ id }) => id === selectedMediaId));
  const active = images[selected];
  const hasImage = Boolean(active);
  const mediaKey = JSON.stringify(images.map(({ id }) => id));
  const pairStart = Math.min(Math.floor(selected / 2) * 2, Math.max(0, images.length - 2));
  const titleId = useId();
  const instructionId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const selectedIndexRef = useRef(selected);
  const scrollSelectedRef = useRef<string | null>(null);
  const previousMediaKeyRef = useRef(mediaKey);
  const keyboardSelectionRef = useRef<string | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const programmaticRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const alignPhoto = useCallback((index: number, behavior: ScrollBehavior) => {
    const strip = stripRef.current;
    const photo = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !photo || !mobileGallery()) return;
    programmaticRef.current = true;
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    strip.scrollTo({ left: photo.offsetLeft, behavior });
    scrollTimerRef.current = setTimeout(() => { programmaticRef.current = false; }, behavior === "smooth" ? 500 : 0);
  }, []);

  const clearScrollWork = useCallback(() => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollFrameRef.current = null;
    scrollTimerRef.current = null;
    programmaticRef.current = false;
  }, []);

  useEffect(() => {
    selectedIndexRef.current = selected;
    const changedMedia = previousMediaKeyRef.current !== mediaKey;
    previousMediaKeyRef.current = mediaKey;
    if (changedMedia) clearScrollWork();
    if (changedMedia || scrollSelectedRef.current !== selectedMediaId) alignPhoto(selected, "auto");
    scrollSelectedRef.current = selectedMediaId;
    if (keyboardSelectionRef.current === selectedMediaId) {
      keyboardSelectionRef.current = null;
      (stripRef.current?.children[selected] as HTMLButtonElement | undefined)?.focus({ preventScroll: true });
    }
    setEnlarged(false);
    if (!active) setZoomOpen(false);
  }, [active, alignPhoto, clearScrollWork, mediaKey, selected, selectedMediaId]);

  useEffect(() => {
    const strip = stripRef.current;
    const resize = () => { clearScrollWork(); alignPhoto(selectedIndexRef.current, "auto"); };
    const observer = strip && typeof window.ResizeObserver === "function" ? new window.ResizeObserver(resize) : null;
    if (strip) observer?.observe(strip);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); clearScrollWork(); };
  }, [alignPhoto, clearScrollWork, hasImage]);

  useEffect(() => {
    if (!zoomOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      const previousOpener = openerRef.current;
      const opener = previousOpener?.isConnected && previousOpener.getClientRects().length > 0 ? previousOpener : zoomTriggerRef.current;
      opener?.focus({ preventScroll: true });
    };
  }, [zoomOpen]);

  const openZoom = (opener: HTMLElement, index = selected) => {
    if (!images[index]) return;
    openerRef.current = opener;
    selectMedia(images[index].id);
    setEnlarged(false);
    setZoomOpen(true);
  };

  const selectIndex = (index: number, scroll = true) => {
    if (!images.length) return;
    const next = (index + images.length) % images.length;
    if (scroll) {
      scrollSelectedRef.current = images[next].id;
      alignPhoto(next, scrollBehavior());
    }
    selectMedia(images[next].id);
    setEnlarged(false);
  };

  const galleryKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (selected + (event.key === "ArrowRight" ? 1 : -1) + images.length) % images.length;
    keyboardSelectionRef.current = images[next]?.id ?? null;
    selectIndex(next);
  };

  const onScroll = () => {
    if (!mobileGallery() || programmaticRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const strip = stripRef.current;
      if (!strip || programmaticRef.current) return;
      let nearest = 0;
      let distance = Infinity;
      Array.from(strip.children).forEach((child, index) => {
        const difference = Math.abs((child as HTMLElement).offsetLeft - strip.scrollLeft);
        if (difference < distance) { nearest = index; distance = difference; }
      });
      const image = images[nearest];
      if (image && image.id !== scrollSelectedRef.current) {
        scrollSelectedRef.current = image.id;
        selectMedia(image.id);
      }
    });
  };

  const interruptScroll = () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    programmaticRef.current = false;
  };

  const navigate = (direction: number, opener: HTMLElement) => {
    const next = (selected + direction + images.length) % images.length;
    if (!mobileGallery() && images.length === 2) openZoom(opener, next);
    else selectIndex(next);
  };

  return <div className={styles.gallery} data-guzide-product-gallery role="group" aria-label={`${product.title} fotoğraf galerisi`}>
    <p className={styles.srOnly} id={instructionId}>Fotoğraflar arasında gezinmek için sağ ve sol ok tuşlarını kullanın. Bir fotoğrafı büyütmek için seçin.</p>
    {active ? <>
      <div ref={stripRef} className={styles.strip} data-single={images.length === 1 || undefined} aria-describedby={instructionId} onKeyDown={galleryKeyboard} onScroll={onScroll} onPointerDown={interruptScroll} onWheel={interruptScroll}>
        {images.map((image, index) => <button type="button" className={styles.photo} key={image.id} data-pair={index >= pairStart && index < pairStart + 2 || undefined} aria-label={`${product.title}, ${index + 1}. fotoğrafı büyüt`} onClick={(event) => openZoom(event.currentTarget, index)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={image.url} alt={image.altText || `${product.title}, fotoğraf ${index + 1}`} width={image.width ?? 900} height={image.height ?? 1200} loading={index < 2 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" draggable={false} />
        </button>)}
      </div>
      <div className={styles.tools}>
        <div className={styles.pagination} aria-label="Fotoğraflar arasında gezin">
          <button type="button" className={styles.iconButton} disabled={images.length < 2} aria-label="Önceki ürün fotoğrafı" onClick={(event) => navigate(-1, event.currentTarget)}><Arrow previous /></button>
          <span className={styles.counter} aria-live="polite">{String(selected + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
          <button type="button" className={styles.iconButton} disabled={images.length < 2} aria-label="Sonraki ürün fotoğrafı" onClick={(event) => navigate(1, event.currentTarget)}><Arrow /></button>
        </div>
        <div className={styles.links}>
          <button ref={zoomTriggerRef} type="button" className={styles.textButton} aria-label="Seçili ürün fotoğrafını yakınlaştır" onClick={(event) => openZoom(event.currentTarget)}><ZoomIcon /><span className={styles.zoomLabel}>Yakınlaştır</span></button>
          {supportHref ? <><span className={styles.divider} aria-hidden="true" /><a className={styles.textButton} href={supportHref} aria-label="Ürün hakkında soru sor"><QuestionIcon /><span>Ürün hakkında soru sor</span></a></> : null}
        </div>
      </div>
    </> : <div className={styles.empty}>Görsel yakında</div>}
    <dialog ref={dialogRef} className={styles.zoomDialog} data-enlarged={enlarged || undefined} aria-modal="true" aria-labelledby={titleId} onClose={() => { setZoomOpen(false); setEnlarged(false); }} onCancel={(event) => { event.preventDefault(); setZoomOpen(false); }} onMouseDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setZoomOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); selectIndex(selected + (event.key === "ArrowRight" ? 1 : -1), false); }
    }}>
      <h2 id={titleId} className={styles.srOnly}>{product.title} büyütülmüş fotoğraf</h2>
      <button ref={closeRef} type="button" className={`${styles.iconButton} ${styles.close}`} aria-label="Büyütülmüş fotoğrafı kapat" onClick={() => setZoomOpen(false)}><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="m5 5 14 14M19 5 5 19" /></svg></button>
      <div className={styles.zoomStage} onClick={(event) => { if (event.target === event.currentTarget) setZoomOpen(false); }}>
        {zoomOpen && active ? <button type="button" className={styles.zoomPhoto} aria-label={enlarged ? "Fotoğrafı küçült" : "Fotoğrafı daha fazla yakınlaştır"} aria-pressed={enlarged} onClick={() => setEnlarged((value) => !value)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={active.url} alt={active.altText || product.title} width={active.width ?? 900} height={active.height ?? 1200} draggable={false} />
        </button> : null}
      </div>
      <div className={styles.zoomControls}>
        <button type="button" className={styles.iconButton} disabled={images.length < 2} aria-label="Önceki fotoğraf" onClick={() => selectIndex(selected - 1, false)}><Arrow previous /></button>
        <span className={styles.counter} aria-live="polite">{String(selected + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}</span>
        <button type="button" className={styles.textButton} aria-label={enlarged ? "Fotoğrafı küçült" : "Fotoğrafı daha fazla yakınlaştır"} aria-pressed={enlarged} onClick={() => setEnlarged((value) => !value)}><ZoomIcon /><span>{enlarged ? "Küçült" : "Yakınlaştır"}</span></button>
        <button type="button" className={styles.iconButton} disabled={images.length < 2} aria-label="Sonraki fotoğraf" onClick={() => selectIndex(selected + 1, false)}><Arrow /></button>
      </div>
    </dialog>
  </div>;
}
