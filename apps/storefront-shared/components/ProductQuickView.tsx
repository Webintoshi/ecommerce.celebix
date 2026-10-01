"use client";

import type { PublicProduct } from "@celebix/saas-contracts";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { formatTry } from "@/lib/format.ts";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { ProductVariantMediaProvider, useProductVariantMedia } from "./ProductVariantMedia";
import { useCartStatus } from "./CartStatusProvider";
import styles from "./product-quick-view.module.css";
import { ALPLER_STOREFRONT_ID } from "../themes/alpler/theme.ts";
import { useSioraPanelHistory } from "../themes/siora/useSioraPanelHistory";

const focusable = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])";

function QuickViewMedia({ product, alpler = false }: Readonly<{ product: PublicProduct; alpler?: boolean }>) {
  const { images, selectedMediaId } = useProductVariantMedia(product);
  const primary = images.find(({ id }) => id === selectedMediaId);
  return <div className={styles.media} data-alpler-quick-media={alpler || undefined}>{primary ? /* eslint-disable-next-line @next/next/no-img-element */<img src={primary.url} alt={primary.altText || product.title} width={primary.width} height={primary.height} /> : <span>Görsel yakında</span>}</div>;
}

function StandardProductQuickView({ product }: Readonly<{ product: PublicProduct }>) {
  const { visualTheme } = useCartStatus();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLElement>(null);
  const close = useCallback(() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }, []);
  useEffect(() => { if (!open) return; const original = document.body.style.overflow; document.body.style.overflow = "hidden"; requestAnimationFrame(() => (dialogRef.current?.querySelector(focusable) as HTMLElement | null)?.focus()); return () => { document.body.style.overflow = original; }; }, [open]);
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") { const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])], first = controls[0], last = controls.at(-1); if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  }
  function backdrop(event: MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget) close(); }
  return <><button className="product-card-cart is-options" ref={triggerRef} type="button" onClick={() => setOpen(true)}>Seçenekleri seç</button>{open ? <ProductVariantMediaProvider key={product.id} product={product}><div className={styles.backdrop} onMouseDown={backdrop}><section className={styles.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-view-title" onKeyDown={keyboard}><button className={styles.close} type="button" aria-label="Hızlı görünümü kapat" onClick={close}><X aria-hidden="true" /></button><QuickViewMedia product={product} /><div className={styles.content}><p className={styles.eyebrow}>HIZLI GÖRÜNÜM</p><h2 id="quick-view-title">{product.title}</h2><div className={styles.price}>{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div><ProductPurchasePanel product={product} available={product.available} showStockQuantity={visualTheme !== "alpler-deniz"} /></div></section></div></ProductVariantMediaProvider> : null}</>;
}


function AlplerProductQuickView({ product }: Readonly<{ product: PublicProduct }>) {
  const { drawerOpen, closeDrawerAndWait, showQuantitySelector = true } = useCartStatus();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const sessionRef = useRef(0);
  const renderedSession = sessionRef.current;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = `alpler-quick-view-${product.id}`;
  const hide = useCallback((restoreFocus = true) => {
    openRef.current = false;
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => { if (triggerRef.current?.isConnected) triggerRef.current.focus(); });
  }, []);
  const { open: openHistory, close: closeHistory } = useSioraPanelHistory({ storefrontId: ALPLER_STOREFRONT_ID, panel: `quick-view:${product.id}`, onClose: (reason) => hide(reason === "back") });
  const close = useCallback(() => { hide(); void closeHistory(); }, [closeHistory, hide]);
  const launch = () => {
    const sourceRoute = `${window.location.pathname}${window.location.search}`;
    const show = () => {
      if (openRef.current || `${window.location.pathname}${window.location.search}` !== sourceRoute || !triggerRef.current?.isConnected || !openHistory()) return;
      sessionRef.current += 1;
      openRef.current = true;
      setOpen(true);
    };
    if (drawerOpen) void closeDrawerAndWait(false).then((sameRoute) => { if (sameRoute) show(); });
    else show();
  };
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => (dialogRef.current?.querySelector(focusable) as HTMLElement | null)?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = original; };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [])];
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function backdrop(event: MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget) close(); }
  const beforePurchaseTransition = async () => {
    if (!openRef.current || sessionRef.current !== renderedSession) return { proceed: false };
    const sourceRoute = `${window.location.pathname}${window.location.search}`;
    hide(false);
    const sameRoute = await closeHistory();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    return { proceed: sameRoute && sessionRef.current === renderedSession && `${window.location.pathname}${window.location.search}` === sourceRoute && Boolean(triggerRef.current?.isConnected), drawerTrigger: triggerRef.current };
  };
  return <><button className="product-card-cart is-options" ref={triggerRef} type="button" onClick={launch}>Seçenekleri seç</button>{open ? <ProductVariantMediaProvider key={product.id} product={product}><div className={styles.backdrop} onMouseDown={backdrop}><section className={styles.dialog} data-alpler-quick-view ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keyboard}><button className={styles.close} type="button" aria-label="Hızlı görünümü kapat" onClick={close}><X aria-hidden="true" /></button><QuickViewMedia product={product} alpler /><div className={styles.content} data-alpler-quick-content><p className={styles.eyebrow}>HIZLI GÖRÜNÜM</p><h2 id={titleId}>{product.title}</h2><div className={styles.price}>{product.compareAtCents ? <del>{formatTry(product.compareAtCents)}</del> : null}<strong>{formatTry(product.priceCents)}</strong></div><ProductPurchasePanel product={product} available={product.available} showStockQuantity={false} showQuantitySelector={showQuantitySelector} beforePurchaseTransition={beforePurchaseTransition} /></div></section></div></ProductVariantMediaProvider> : null}</>;
}

export function ProductQuickView({ product }: Readonly<{ product: PublicProduct }>) {
  const { visualTheme } = useCartStatus();
  return visualTheme === "alpler-deniz" ? <AlplerProductQuickView product={product} /> : <StandardProductQuickView product={product} />;
}
