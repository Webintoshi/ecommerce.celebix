"use client";

import type { PublicProduct } from "@celebix/saas-contracts";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { formatTry } from "@/lib/format.ts";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import styles from "./product-quick-view.module.css";

const focusable = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function ProductQuickView({ product }: Readonly<{ product: PublicProduct }>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLElement>(null);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }, []);
  useEffect(() => { if (!open) return; const original = document.body.style.overflow; document.body.style.overflow = "hidden"; requestAnimationFrame(() => (dialogRef.current?.querySelector(focusable) as HTMLElement | null)?.focus()); return () => { document.body.style.overflow = original; }; }, [open]);
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") { const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])], first = controls[0], last = controls.at(-1); if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }
  function backdrop(event: MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget) close(); }
  const primary = product.media[0];
  return <><button className="product-card-cart is-options" ref={triggerRef} type="button" onClick={() => setOpen(true)}>Seçenekleri seç</button>{open ? <div className={styles.backdrop} onMouseDown={backdrop}><section className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-view-title" onKeyDown={keyboard}><button className={styles.close} type="button" aria-label="Hızlı görünümü kapat" onClick={close}><X aria-hidden="true" /></button><div className={styles.media}>{primary ? /* eslint-disable-next-line @next/next/no-img-element */<img src={primary.url} alt={primary.altText || product.title} width={primary.width} height={primary.height} /> : <span>Görsel yakında</span>}</div><div className={styles.content}><p className={styles.eyebrow}>HIZLI GÖRÜNÜM</p><h2 id="quick-view-title">{product.title}</h2><div className={styles.price}>{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div><ProductPurchasePanel product={product} available={product.available} /></div></section></div> : null}</>;
}
