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
import { LilyumIcon } from "./LilyumIcon";

const DEFAULT_VARIANTS = new Set(["varsayılan", "varsayilan", "varsayılan varyant", "varsayilan varyant", "default", "default title"]);

export function LilyumProductPurchase({ product, options, showQuantitySelector, children }: Readonly<{
  product: PublicProduct; options: StarterProductDetailConfigV2; showQuantitySelector: boolean; children?: ReactNode;
}>) {
  const router = useRouter();
  const { openDrawer, drawerOpen, replaceCart } = useCartStatus();
  const [selectedId, selectVariant] = useProductVariantSelection(product);
  const variant = product.variants.find(item => item.id === selectedId);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const mounted = useRef(true), requestPending = useRef(false);
  const titleId = useId();
  const quantityLimit = variant?.stockTracking ? clampPurchaseQuantity(variant.stockQuantity) : 99;
  const available = Boolean(product.available && variant?.available);
  const allowed = available && quantity >= 1 && quantity <= quantityLimit;
  const amount = variant?.priceCents ?? product.priceCents;
  const compareAt = variant ? variant.compareAtCents : product.compareAtCents;
  const choices = product.variants.length > 1 || product.variants.some(item => !DEFAULT_VARIANTS.has(item.title.trim().toLocaleLowerCase("tr-TR")));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setQuantity(1); setStatus(""); }, [product.id, selectedId]);

  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (requestPending.current) return;
    if (!variant || !allowed) { setStatus("Lütfen stokta olan bir seçenek seçin."); return; }
    requestPending.current = true; setPending(kind); setStatus("");
    const requestRoute = `${window.location.pathname}${window.location.search}`;
    const stillOnProduct = () => mounted.current && requestRoute === `${window.location.pathname}${window.location.search}`;
    const input = { productId: product.id, variantId: variant.id, quantity };
    const data = { ...input, currency: product.currency, valueMinor: variant.priceCents * quantity, ...(product.primaryCategoryId ? { categoryId: product.primaryCategoryId } : {}) };
    try {
      if (kind === "add") {
        await addCartLineAndOpenDrawer(input, trigger, { add: storefrontCartClient.add, replaceCart,
          openDrawer: opener => { if (stillOnProduct() && opener.isConnected) openDrawer(opener); } });
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (stillOnProduct()) setStatus("Ürün sepete eklendi.");
      } else {
        replaceCart(await storefrontCartClient.add(input));
        emitStorefrontCommerceEvent({ name: "add_to_cart", data });
        if (!stillOnProduct()) return;
        emitStorefrontCommerceEvent({ name: "begin_checkout", data });
        router.push("/checkout");
      }
    } catch { if (stillOnProduct()) setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin."); }
    finally { requestPending.current = false; if (mounted.current) setPending(null); }
  };

  return <>
    <section className="lf-purchase" aria-labelledby={titleId}>
      <div className="lf-product-title-row"><h1 id={titleId}>{product.title}</h1><FavoriteButton productId={product.id} productTitle={product.title} /></div>
      {options.showBrand && product.brand ? <Link className="lf-product-brand" href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
      {options.showSku && variant?.sku ? <p className="lf-product-sku">Ürün kodu: {variant.sku}</p> : null}
      <div className="lf-purchase-price" aria-live="polite"><strong>{formatTry(amount)}</strong>{compareAt !== undefined && compareAt > amount ? <del>{formatTry(compareAt)}</del> : null}</div>
      {!available ? <p className="lf-product-unavailable">Bu ürün şu anda mevcut değil.</p> : null}
      {product.merchandising?.highlights.length ? <ul className="lf-product-highlights">{product.merchandising.highlights.map(text => <li key={text}>{text}</li>)}</ul> : null}
      {choices ? <fieldset className="lf-product-choices" disabled={pending !== null}><legend>Seçenekler</legend>
        {product.variants.map(item => <label key={item.id} data-available={item.available ? "true" : "false"}>
          <input type="radio" name={`${titleId}-variant`} value={item.id} checked={item.id === selectedId} disabled={!item.available} onChange={() => { if (!requestPending.current) { selectVariant(item.id); setQuantity(1); setStatus(""); } }} />
          <span>{item.title}<small>{item.available ? "Stokta" : "Tükendi"}</small></span><strong>{formatTry(item.priceCents)}</strong>
        </label>)}
      </fieldset> : null}
      {showQuantitySelector ? <div className="lf-product-quantity" aria-label="Adet seçimi"><span>Adet</span>
        <button type="button" aria-label="Adedi azalt" disabled={pending !== null || !available || quantity <= 1} onClick={() => setQuantity(value => decrementPurchaseQuantity(value, quantityLimit))}>−</button>
        <output aria-label="Adet" aria-live="polite">{quantity}</output>
        <button type="button" aria-label="Adedi artır" disabled={pending !== null || !available || quantity >= quantityLimit} onClick={() => setQuantity(value => incrementPurchaseQuantity(value, quantityLimit))}>+</button>
      </div> : null}
      <div className="lf-purchase-actions">
        <button className="lf-button" type="button" disabled={pending !== null || !allowed} onClick={event => void run("add", event.currentTarget)}><LilyumIcon name="bag" />{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button>
        <button className="lf-button lf-purchase-buy" type="button" disabled={pending !== null || !allowed} onClick={event => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}<LilyumIcon name="arrow" /></button>
      </div>
      <p className="lf-purchase-status" role="status" aria-live="polite">{status}</p>
      {children}
    </section>
    {options.mobileStickyPurchase ? <div className="lf-product-sticky" data-lilyum-sticky-purchase hidden={drawerOpen}>
      <div><span>{product.title}</span><strong>{formatTry(amount)}</strong></div>
      <button className="lf-button" type="button" disabled={pending !== null || !allowed} onClick={event => void run("add", event.currentTarget)}><LilyumIcon name="bag" />{pending === "add" ? "Ekleniyor…" : available ? "Sepete ekle" : "Tükendi"}</button>
    </div> : null}
  </>;
}
