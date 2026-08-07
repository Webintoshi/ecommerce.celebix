"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { PublicCartLine, PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { formatTry } from "@/lib/format.ts";
import { useCartStatus } from "./CartStatusProvider";
import { sideCartPresentation } from "./campaign-ui-model";
import { mutateSideCartLine } from "./side-cart-mutation";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function SideCartDrawer({ presentation }: Readonly<{ presentation?: PublicStarterThemePresentationV2["cart"] }>) {
  const { cart, loading, unavailable, drawerOpen, closeDrawer, replaceCart, refresh } = useCartStatus();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [pendingVariant, setPendingVariant] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; };
  }, [drawerOpen]);

  if (!drawerOpen) return null;

  const mutate = async (line: PublicCartLine, quantity: number | null) => {
    if (!cart || pendingVariant) return;
    setPendingVariant(line.variantId); setStatus("");
    try {
      setStatus(await mutateSideCartLine({ line, cartVersion: cart.version, quantity, client: storefrontCartClient, replaceCart, refresh }));
    } finally { setPendingVariant(null); }
  };

  const trapKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute("disabled"));
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const checkoutBlockedByStock = cart?.checkoutBlocker === "stock_unavailable" || cart?.checkoutBlocker === "empty_cart";
  const configurationBlocked = cart?.checkoutBlocker === "shipping_unavailable" || cart?.checkoutBlocker === "payment_unavailable";
  const campaignPresentation = sideCartPresentation(presentation);
  return <div className="side-cart-backdrop" data-state="open" data-campaign-cart="true" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
    <section className="side-cart-dialog campaign-side-cart" role="dialog" aria-modal="true" aria-labelledby="side-cart-title" onKeyDown={trapKeyboard}>
      <header className="side-cart-header"><div><h2 id="side-cart-title">Sepetim</h2>{cart ? <span className="side-cart-header-count">{cart.itemCount} ürün</span> : null}</div><button ref={closeRef} type="button" aria-label="Sepeti kapat" onClick={closeDrawer}>×</button></header>
      {!cart && unavailable ? <div className="side-cart-empty is-unavailable" role="status"><span aria-hidden="true">!</span><h3>Sepet şu anda kullanılamıyor</h3><p>Güncel sepet doğrulanamadı. Lütfen yeniden deneyin.</p><button className="store-button" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Yükleniyor…" : "Tekrar dene"}</button></div> : !cart ? <div className="side-cart-empty" aria-busy="true" role="status"><span aria-hidden="true">◇</span><h3>Sepet yükleniyor</h3><p>Güncel ürünleriniz hazırlanıyor.</p></div> : cart.items.length === 0 ? <div className="side-cart-empty"><span aria-hidden="true">◇</span><h3>Sepetiniz boş</h3><p>Beğendiğiniz ürünleri sepetinize ekleyin.</p><Link className="store-button" href="/products" onClick={closeDrawer}>Ürünleri keşfet</Link></div> : <>
        <div className="side-cart-lines" aria-label="Sepetteki ürünler">{cart.items.map((line) => {
          const pending = pendingVariant === line.variantId;
          return <article className="side-cart-line campaign-side-cart-item" key={line.variantId}>
            <Link className="side-cart-media" href={`/products/${line.slug}`} onClick={closeDrawer}>{line.media ? /* eslint-disable-next-line @next/next/no-img-element */<img src={line.media.url} alt={line.media.altText || line.title} loading="lazy" width={line.media.width ?? 96} height={line.media.height ?? 96} /> : <span aria-hidden="true">◇</span>}</Link>
            <div className="side-cart-line-copy"><Link href={`/products/${line.slug}`} onClick={closeDrawer}>{line.title}</Link>{line.variantTitle && line.variantTitle !== "Varsayılan" ? <span>{line.variantTitle}</span> : null}<strong className="side-cart-line-price">{formatTry(line.unitPriceCents)}</strong>{line.available ? null : <em>Stok veya fiyat bilgisi değişti</em>}
              <div className="side-cart-line-utility">{campaignPresentation.showQuantitySelector
                  ? <div className="side-cart-quantity" aria-label={`${line.title} adet`}><button type="button" aria-label={`${line.title} adet azalt`} disabled={pending || line.quantity <= 1} onClick={() => void mutate(line, line.quantity - 1)}>−</button><span>{line.quantity}</span><button type="button" aria-label={`${line.title} adet artır`} disabled={pending || line.quantity >= 99} onClick={() => void mutate(line, line.quantity + 1)}>+</button></div>
                  : <span className="side-cart-quantity-copy">{line.quantity} adet</span>}
                <button className="side-cart-remove" type="button" disabled={pending} onClick={() => void mutate(line, null)}>Kaldır</button>
              </div>
            </div>
            {line.quantity > 1 ? <strong className="side-cart-line-total">{formatTry(line.lineTotalCents)}</strong> : null}
          </article>;
        })}</div>
        <footer className="side-cart-footer campaign-side-cart-summary"><dl><div><dt>Ara toplam</dt><dd>{formatTry(cart.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{cart.shippingCents === 0 ? "Ücretsiz" : formatTry(cart.shippingCents)}</dd></div><div><dt>Toplam</dt><dd>{formatTry(cart.totalCents)}</dd></div></dl>{campaignPresentation.trustMessage ? <p className="side-cart-trust">{campaignPresentation.trustMessage}</p> : null}{campaignPresentation.showCheckoutReadiness ? cart.checkoutBlocker === "payment_unavailable" ? <p className="side-cart-notice is-configuration">Ödeme yöntemi henüz yapılandırılmadı.</p> : cart.checkoutBlocker === "shipping_unavailable" ? <p className="side-cart-notice is-configuration">Teslimat yöntemi henüz yapılandırılmadı.</p> : cart.checkoutBlocker === "stock_unavailable" ? <p className="side-cart-notice is-error">Sepetinizde stok veya fiyatı değişen bir ürün var.</p> : null : null}<div className="side-cart-actions">{checkoutBlockedByStock ? <span className="store-button campaign-side-cart-checkout is-disabled" aria-disabled="true">Ödemeye geç</span> : <Link className="store-button campaign-side-cart-checkout" href="/checkout" onClick={closeDrawer}>{configurationBlocked ? "Ödeme durumunu görüntüle" : "Ödemeye geç"}</Link>}<Link className="side-cart-view-link" href="/cart" onClick={closeDrawer}>Sepeti görüntüle</Link></div></footer>
      </>}
      <p className="sr-only" aria-live="polite">{status}</p>
    </section>
  </div>;
}
