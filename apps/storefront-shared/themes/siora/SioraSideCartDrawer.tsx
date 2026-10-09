"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PublicCartLine, PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { FreeShippingProgress } from "../../components/FreeShippingProgress";
import { useCartStatus } from "../../components/CartStatusProvider";
import { sideCartPresentation } from "../../components/campaign-ui-model";
import { mutateSideCartLine } from "../../components/side-cart-mutation";
import { storefrontCartClient } from "../../lib/cart/client.ts";
import { formatTry } from "../../lib/format.ts";
import { productIndexPath, productPath } from "../../lib/storefront-routes.ts";
import type { SioraCartRecommendation } from "./cart-recommendations.ts";
import styles from "./siora-side-cart.module.css";
import { OrderBumpOffers } from "../../components/OrderBumpOffers";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function SioraSideCartDrawer({ presentation, locale }: Readonly<{ presentation?: PublicStarterThemePresentationV2["cart"]; locale: string }>) {
  const { cart, loading, unavailable, drawerOpen, closeDrawer, replaceCart, refresh } = useCartStatus();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pendingVariant, setPendingVariant] = useState<string | null>(null);
  const [bumpPending, setBumpPending] = useState(false);
  const [customOffers, setCustomOffers] = useState(false);
  const mutationBusy = useRef(false);
  const [status, setStatus] = useState("");
  const [recommendations, setRecommendations] = useState<readonly SioraCartRecommendation[] | null>(null);
  const hasItems = Boolean(cart?.items.length);

  useEffect(() => {
    if (!drawerOpen) return;
    setStatus("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => { window.cancelAnimationFrame(frame); if (dialog?.open) dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (drawerOpen && dialog?.open && !dialog.contains(document.activeElement)) closeRef.current?.focus();
  }, [drawerOpen, cart?.version, pendingVariant]);

  // Recommendations are optional and never delay the cart or the checkout link.
  useEffect(() => {
    if (!drawerOpen || !hasItems || recommendations !== null) return;
    const controller = new AbortController();
    let current = true;
    void fetch("/api/cart/recommendations", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const result = await response.json() as { suggestions?: SioraCartRecommendation[] };
        return Array.isArray(result.suggestions) ? result.suggestions : [];
      })
      .then((items) => { if (current) setRecommendations(items); })
      .catch(() => { if (current) setRecommendations([]); });
    return () => { current = false; controller.abort(); };
  }, [drawerOpen, hasItems, recommendations]);

  if (!drawerOpen) return null;
  const settings = sideCartPresentation(presentation);
  const inCart = new Set(cart?.items.map((line) => line.productId));
  const suggestions = (recommendations ?? []).filter((item) => !inCart.has(item.id)).slice(0, 2);
  const checkoutBlocked = cart?.checkoutBlocker === "stock_unavailable" || cart?.checkoutBlocker === "empty_cart";

  const mutate = async (line: PublicCartLine, quantity: number | null) => {
    if (!cart || mutationBusy.current) return;
    mutationBusy.current = true;
    setPendingVariant(line.variantId);
    setStatus("");
    try {
      setStatus(await mutateSideCartLine({ line, cartVersion: cart.version, quantity, client: storefrontCartClient, replaceCart, refresh }));
    } finally { mutationBusy.current = false; setPendingVariant(null); }
  };

  const trapKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div className={styles.backdrop} data-storefront-theme="siora-deniz">
    <dialog ref={dialogRef} className={styles.drawer} aria-modal="true" aria-labelledby="siora-cart-title" onKeyDown={trapKeyboard} onCancel={(event) => { event.preventDefault(); closeDrawer(); }} onMouseDown={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDrawer();
    }}>
      <header className={styles.header}>
        <h2 id="siora-cart-title">Sepetiniz</h2>
        <button ref={closeRef} className={styles.close} type="button" aria-label="Sepeti kapat" onClick={closeDrawer}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19" /></svg></button>
      </header>
      {!cart && unavailable ? <div className={styles.empty} role="status"><h3>Sepetinize ulaşılamıyor</h3><p>Güncel ürünlerinizi görmek için yeniden deneyin.</p><button className={styles.checkout} type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Yükleniyor…" : "Tekrar dene"}</button></div>
        : !cart ? <div className={styles.empty} role="status" aria-busy="true"><h3>Sepetiniz hazırlanıyor</h3><p>Ürünleriniz birazdan burada.</p></div>
          : !hasItems ? <div className={styles.empty}><h3>Henüz bir parça seçmediniz</h3><p>Koleksiyonda size eşlik edecek parçayı keşfedin.</p><Link className={styles.checkout} href={productIndexPath(locale)} onClick={closeDrawer}>Koleksiyonu keşfet</Link></div>
            : <>
              <div className={styles.content}>
                <div className={styles.lines} aria-label="Sepetteki ürünler">{cart.items.map((line) => {
                  const pending = pendingVariant !== null || bumpPending;
                  return <article className={styles.line} key={line.variantId}>
                    <Link className={styles.media} href={productPath(locale, line.slug)} onClick={closeDrawer}>
                      {line.media ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={line.media.url} alt={line.media.altText || line.title} width={line.media.width ?? 240} height={line.media.height ?? 300} /> : <span>Görsel yakında</span>}
                    </Link>
                    <div className={styles.copy}>
                      <Link className={styles.title} href={productPath(locale, line.slug)} onClick={closeDrawer}>{line.title}</Link>
                      <div className={styles.variant}><span>{line.quantity}</span>{line.variantTitle && line.variantTitle !== "Varsayılan" ? <span>{line.variantTitle}</span> : null}</div>
                      {settings.showQuantitySelector ? <div className={styles.quantity} aria-label={`${line.title} adet`}><button type="button" aria-label={`${line.title} adet azalt`} disabled={pending || line.quantity <= 1} onClick={() => void mutate(line, line.quantity - 1)}>−</button><span>{line.quantity}</span><button type="button" aria-label={`${line.title} adet artır`} disabled={pending || line.quantity >= 99} onClick={() => void mutate(line, line.quantity + 1)}>+</button></div> : null}
                      {line.available ? null : <p className={styles.notice}>Stok veya fiyat bilgisi değişti.</p>}
                      <div className={styles.lineBottom}><span className={styles.price}>{formatTry(line.lineTotalCents)}</span><button type="button" className={styles.remove} aria-label={`${line.title} ürününü sil`} disabled={pending} onClick={() => void mutate(line, null)}>{pendingVariant === line.variantId ? "Bekleyin…" : "Sil"}</button></div>
                    </div>
                  </article>;
                })}</div>
                <OrderBumpOffers cart={cart} placement="side_cart" locale={locale} active={typeof window !== "undefined" && !/^\/(?:checkout|payments|odeme)(?:\/|$)/iu.test(window.location.pathname)} disabled={pendingVariant !== null || bumpPending} beforeAdd={() => { if (mutationBusy.current) return false; mutationBusy.current = true; return true; }} onPendingChange={value => { setBumpPending(value); if (!value) mutationBusy.current = false; }} onAvailability={setCustomOffers} />
                {!customOffers && suggestions.length ? <section className={styles.recommendations} aria-labelledby="siora-cart-recommendations"><h3 id="siora-cart-recommendations">Beğenebilecekleriniz</h3><div className={styles.suggestions}>{suggestions.map((item) => <Link className={styles.suggestion} key={item.id} href={productPath(locale, item.slug)} onClick={closeDrawer}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={item.media.url} alt={item.media.altText || item.title} width={item.media.width ?? 320} height={item.media.height ?? 400} loading="lazy" />
                  <span>{item.title}</span><small>{formatTry(item.priceCents)}</small>
                </Link>)}</div></section> : null}
              </div>
              <footer className={styles.footer}>
                <FreeShippingProgress cart={cart} presentation={presentation} />
                <div className={styles.subtotal}><span>Ara toplam</span><strong>{formatTry(cart.subtotalCents)}</strong></div>
                {checkoutBlocked ? <p className={styles.notice}>Sepetinizde stok veya fiyatı değişen bir ürün var. Devam etmeden önce sepetinizi güncelleyin.</p> : settings.showCheckoutReadiness && cart.checkoutBlocker === "payment_unavailable" ? <p className={styles.notice}>Ödeme yöntemi henüz yapılandırılmadı.</p> : settings.showCheckoutReadiness && cart.checkoutBlocker === "shipping_unavailable" ? <p className={styles.notice}>Teslimat yöntemi henüz yapılandırılmadı.</p> : null}
                {checkoutBlocked || pendingVariant !== null || bumpPending ? <span className={styles.checkout} aria-disabled="true">Ödemeye geç</span> : <Link className={styles.checkout} href="/checkout" onClick={closeDrawer}>Ödemeye geç</Link>}
                <button className={styles.continue} type="button" onClick={closeDrawer}>Alışverişe devam et</button>
                {settings.trustMessage ? <p className={styles.trust}>{settings.trustMessage}</p> : null}
              </footer>
            </>}
      <p className="sr-only" aria-live="polite">{status}</p>
    </dialog>
  </div>;
}
