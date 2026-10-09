"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { OrderBumpPublicOffers, OrderBumpPublicOffer, PublicCart } from "@celebix/saas-contracts";
import { readOrderBumpOffers } from "../lib/order-bumps/client.ts";
import { storefrontCartClient } from "../lib/cart/client.ts";
import { formatTry } from "../lib/format.ts";
import { productPath } from "../lib/storefront-routes.ts";
import { useCartStatus } from "./CartStatusProvider";
import styles from "./order-bump-offers.module.css";

type Props = Readonly<{
  cart: PublicCart | null;
  placement: "side_cart" | "checkout";
  locale?: string;
  active?: boolean;
  disabled?: boolean;
  beforeAdd?(): boolean;
  afterAdd?(cart: PublicCart | null): Promise<void>;
  onPendingChange?(pending: boolean): void;
  onAvailability?(enabled: boolean): void;
}>;

export function OrderBumpOffers({ cart, placement, locale = "tr", active = true, disabled = false, beforeAdd, afterAdd, onPendingChange, onAvailability }: Props) {
  const { replaceCart } = useCartStatus();
  const [snapshot, setSnapshot] = useState<OrderBumpPublicOffers | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [consumedVersion, setConsumedVersion] = useState<number | null>(null);
  const busy = useRef(false);
  const current = useRef({ cart, active, disabled, beforeAdd, afterAdd, onPendingChange, onAvailability });
  current.current = { cart, active, disabled, beforeAdd, afterAdd, onPendingChange, onAvailability };
  const headingId = useId();
  const version = cart?.version ?? null;
  const eligible = active && Boolean(cart?.items.length) && cart?.checkoutBlocker !== "stock_unavailable";

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setSnapshot(null);
    setStatus("");
    current.current.onAvailability?.(false);
    if (eligible && version !== null) {
      void readOrderBumpOffers(placement, controller.signal).then(selected => {
        if (!live || selected.cartVersion !== version) return;
        setSnapshot(selected);
        current.current.onAvailability?.(selected.heading !== null);
      }).catch(() => { /* Optional offers never block the existing cart. */ });
    }
    return () => { live = false; controller.abort(); };
  }, [eligible, version, placement]);

  const accept = async (offer: OrderBumpPublicOffer) => {
    const latest = current.current;
    if (busy.current || !latest.active || latest.disabled || !latest.cart || latest.cart.version !== snapshot?.cartVersion || consumedVersion === latest.cart.version || latest.cart.items.some(line => line.productId === offer.productId)) return;
    if (latest.beforeAdd && !latest.beforeAdd()) return;
    busy.current = true;
    setPending(true);
    setStatus("");
    latest.onPendingChange?.(true);
    const sourceVersion = latest.cart.version;
    let resolved: PublicCart | null = null;
    try {
      try {
        resolved = await storefrontCartClient.add({ productId: offer.productId, variantId: offer.variantId, quantity: 1, expectedVersion: sourceVersion });
        replaceCart(resolved);
        setStatus(`${offer.title} sepete eklendi.`);
      } catch {
        // An accepted write may have lost its response. Read once; never replay add.
        try { resolved = await storefrontCartClient.resolve(); replaceCart(resolved); }
        catch { /* Checkout stays fenced when the current cart cannot be verified. */ }
        setStatus(resolved ? "Güncel sepet kontrol edildi. Lütfen ürünlerinizi kontrol edin." : "Sepet doğrulanamadı. Lütfen sepetinizi yeniden açın.");
      }
      setConsumedVersion(sourceVersion);
      await current.current.afterAdd?.(resolved);
    } finally {
      busy.current = false;
      setPending(false);
      current.current.onPendingChange?.(false);
    }
  };

  const visible = eligible && snapshot?.cartVersion === version && consumedVersion !== version;
  const inCart = new Set(cart?.items.map(line => line.productId));
  const offers = visible ? snapshot!.offers.filter(offer => !inCart.has(offer.productId)) : [];
  if (!offers.length && !status) return null;
  return <section className={`order-bump-offers ${styles.section}`} aria-labelledby={offers.length ? headingId : undefined} aria-busy={pending}>
    {offers.length ? <><h3 id={headingId}>{snapshot!.heading}</h3><div className={styles.list}>{offers.map(offer => <article key={offer.productId} className={styles.offer}>
      {offer.media ? <Link className={styles.media} href={productPath(locale, offer.slug)} aria-label={offer.title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={offer.media.url} alt={offer.media.altText || offer.title} width={offer.media.width ?? 120} height={offer.media.height ?? 150} loading="lazy" />
      </Link> : null}
      <div className={styles.copy}><Link href={productPath(locale, offer.slug)}>{offer.title}</Link>{offer.variantTitle !== "Varsayılan" ? <small>{offer.variantTitle}</small> : null}<strong>{formatTry(offer.priceCents)}</strong></div>
      <button className={`order-bump-add ${styles.add}`} type="button" disabled={disabled || pending} onClick={() => void accept(offer)} aria-label={`${offer.title} sepete ekle`}>{pending ? "Ekleniyor…" : "Ekle"}</button>
    </article>)}</div></> : null}
    <p className={styles.status} role="status" aria-live="polite">{status}</p>
  </section>;
}
