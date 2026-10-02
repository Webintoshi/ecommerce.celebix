"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PublicProduct, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";

import { useCartStatus } from "../../components/CartStatusProvider";
import { FavoriteButton } from "../../components/FavoriteButton";
import { useProductVariantSelection } from "../../components/ProductVariantMedia";
import { clampPurchaseQuantity, decrementPurchaseQuantity, incrementPurchaseQuantity } from "../../components/product-purchase-quantity.ts";
import { addCartLineAndOpenDrawer, storefrontCartClient } from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { formatTry } from "@/lib/format.ts";
import styles from "./guzide-product-detail.module.css";

export function GuzideProductPurchase({ product, options, showQuantitySelector, children }: Readonly<{
  product: PublicProduct;
  options: StarterProductDetailConfigV2;
  showQuantitySelector: boolean;
  children?: ReactNode;
}>) {
  const router = useRouter();
  const { openDrawer, drawerOpen, replaceCart } = useCartStatus();
  const [selectedId, selectVariant] = useProductVariantSelection(product);
  const variant = product.variants.find(({ id }) => id === selectedId);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const mountedRef = useRef(true);
  const requestPendingRef = useRef(false);
  const titleId = useId();
  const quantityLimit = variant?.stockTracking ? clampPurchaseQuantity(variant.stockQuantity) : 99;
  const available = Boolean(product.available && variant?.available);
  const allowed = available && quantity >= 1 && quantity <= quantityLimit;
  const amount = variant?.priceCents ?? product.priceCents;
  const compareAt = variant ? variant.compareAtCents : product.compareAtCents;
  const showVariantChoices = product.variants.length > 1 || product.variants.some(({ title }) => title.trim().toLocaleLowerCase("tr-TR") !== "varsayılan");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => { setQuantity(1); setStatus(""); }, [product.id, selectedId]);

  const changeVariant = (id: string) => {
    if (requestPendingRef.current) return;
    selectVariant(id);
    setQuantity(1);
    setStatus("");
  };
  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (requestPendingRef.current) return;
    if (!variant || !allowed) { setStatus("Lütfen stokta olan bir seçenek seçin."); return; }
    requestPendingRef.current = true;
    setPending(kind);
    setStatus("");
    const requestRoute = `${window.location.pathname}${window.location.search}`;
    const stillOnProduct = () => mountedRef.current && requestRoute === `${window.location.pathname}${window.location.search}`;
    const input = { productId: product.id, variantId: variant.id, quantity };
    const data = { ...input, currency: product.currency, valueMinor: variant.priceCents * quantity, ...(product.primaryCategoryId ? { categoryId: product.primaryCategoryId } : {}) };
    try {
      if (kind === "add") {
        await addCartLineAndOpenDrawer(input, trigger, {
          add: storefrontCartClient.add,
          openDrawer: (opener) => { if (stillOnProduct() && opener.isConnected) openDrawer(opener); },
          replaceCart,
        });
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (stillOnProduct()) setStatus("Ürün sepete eklendi.");
      } else {
        replaceCart(await storefrontCartClient.add(input));
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (!stillOnProduct()) return;
        emitStorefrontCommerceEvent({ name: "begin_checkout", data });
        router.push("/checkout");
      }
    } catch {
      if (stillOnProduct()) setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin.");
    } finally {
      requestPendingRef.current = false;
      if (mountedRef.current) setPending(null);
    }
  };

  return <>
    <section className={styles.purchasePanel} aria-labelledby={titleId} data-guzide-purchase data-guzide-mobile-sticky={options.mobileStickyPurchase ? "true" : undefined}>
      <div className={styles.titleRow}>
        <h1 id={titleId}>{product.title}</h1>
        <div className={styles.favorite}><FavoriteButton productId={product.id} productTitle={product.title} /></div>
      </div>
      {options.showBrand && product.brand ? <Link className={styles.brand} href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
      {options.showSku && variant?.sku ? <p className={styles.sku}>Ürün kodu: {variant.sku}</p> : null}
      <div className={styles.price} aria-live="polite">
        {compareAt !== undefined && compareAt > amount ? <del>{formatTry(compareAt)}</del> : null}
        <strong>{formatTry(amount)}</strong>
      </div>
      {product.merchandising?.highlights.length ? <ul className={styles.highlights}>{product.merchandising.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
      {showVariantChoices ? <fieldset className={styles.variantChoices} disabled={pending !== null}>
        <legend>Seçenekler</legend>
        {product.variants.map((item) => <label className={styles.variantOption} key={item.id} data-available={item.available ? "true" : "false"}>
          <input type="radio" name={`${titleId}-variant`} value={item.id} checked={selectedId === item.id} disabled={!item.available} onChange={() => changeVariant(item.id)} />
          <span className={styles.variantOptionCopy}><span>{item.title}</span><small>{item.available ? "Stokta" : "Tükendi"}</small></span>
          <strong>{formatTry(item.priceCents)}</strong>
        </label>)}
      </fieldset> : null}
      {showQuantitySelector ? <div className={styles.quantity} aria-label="Adet seçimi">
        <span>Adet</span>
        <button type="button" aria-label="Adedi azalt" disabled={pending !== null || !available || quantity <= 1} onClick={() => setQuantity((value) => decrementPurchaseQuantity(value, quantityLimit))}>−</button>
        <output aria-live="polite" aria-label="Adet">{quantity}</output>
        <button type="button" aria-label="Adedi artır" disabled={pending !== null || !available || quantity >= quantityLimit} onClick={() => setQuantity((value) => incrementPurchaseQuantity(value, quantityLimit))}>+</button>
      </div> : null}
      <div className={styles.actions}>
        <button type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button>
        <button type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}</button>
      </div>
      <p className={styles.status} aria-live="polite" role="status">{status}</p>
      {children}
    </section>
    {options.mobileStickyPurchase ? <div className={styles.sticky} hidden={drawerOpen} data-guzide-sticky-purchase>
      <div className={styles.stickyCopy}><span>{product.title}</span><strong>{formatTry(amount)}</strong></div>
      <button type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : available ? "Sepete ekle" : "Tükendi"}</button>
    </div> : null}
  </>;
}
