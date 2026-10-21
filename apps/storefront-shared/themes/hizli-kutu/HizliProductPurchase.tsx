"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicProduct, StarterProductDetailConfigV2 } from "@celebix/saas-contracts";
import { RestockSubscriptionForm, useRestockAlertsConfig } from "../../components/RestockAlerts";
import { useCartStatus } from "../../components/CartStatusProvider";
import { FavoriteButton } from "../../components/FavoriteButton";
import { useProductVariantSelection } from "../../components/ProductVariantMedia";
import { clampPurchaseQuantity, decrementPurchaseQuantity, incrementPurchaseQuantity } from "../../components/product-purchase-quantity.ts";
import { addCartLineAndOpenDrawer, storefrontCartClient } from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { formatTry } from "@/lib/format.ts";
import { HizliIcon } from "./HizliIcon";
import { packagePieces } from "./model.ts";

const DEFAULT = new Set(["varsayılan", "varsayilan", "varsayılan varyant", "varsayilan varyant", "default", "default title"]);

export function HizliProductPurchase({ product, options, showQuantitySelector, quickView = false, beforePurchaseTransition }: Readonly<{
  product: PublicProduct; options: StarterProductDetailConfigV2; showQuantitySelector: boolean; quickView?: boolean;
  beforePurchaseTransition?(kind: "add" | "buy"): Promise<Readonly<{ proceed: boolean; drawerTrigger?: HTMLElement | null }>>;
}>) {
  const router = useRouter(), restock = useRestockAlertsConfig();
  const { openDrawer, replaceCart, drawerOpen } = useCartStatus();
  const [selectedId, selectVariant] = useProductVariantSelection(product);
  const [quantity, setQuantity] = useState(1), [pending, setPending] = useState<"add" | "buy" | null>(null), [status, setStatus] = useState("");
  const mounted = useRef(true), busy = useRef(false), id = useId();
  const variant = product.variants.find(item => item.id === selectedId);
  const limit = variant?.stockTracking ? clampPurchaseQuantity(variant.stockQuantity) : 99;
  const allowed = Boolean(product.available && variant?.available && quantity >= 1 && quantity <= limit);
  const amount = variant?.priceCents ?? product.priceCents;
  const pieces = variant ? packagePieces(variant.attributes) : undefined;
  const unit = pieces ? amount / pieces : undefined;
  const choices = product.variants.length > 1 || product.variants.some(item => !DEFAULT.has(item.title.trim().toLocaleLowerCase("tr-TR")));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setQuantity(1); setStatus(""); }, [selectedId, product.id]);

  async function run(kind: "add" | "buy", trigger: HTMLButtonElement) {
    if (busy.current || !variant || !allowed) return;
    busy.current = true; setPending(kind); setStatus("");
    const route = `${window.location.pathname}${window.location.search}`;
    const active = () => mounted.current && `${window.location.pathname}${window.location.search}` === route;
    const input = { productId: product.id, variantId: variant.id, quantity };
    const data = { ...input, currency: product.currency, valueMinor: variant.priceCents * quantity, ...(product.primaryCategoryId ? { categoryId: product.primaryCategoryId } : {}) };
    try {
      if (kind === "add" && !beforePurchaseTransition) {
        await addCartLineAndOpenDrawer(input, trigger, { add: storefrontCartClient.add, replaceCart,
          openDrawer: opener => { if (active() && opener.isConnected) openDrawer(opener); } });
      } else {
        replaceCart(await storefrontCartClient.add(input));
        if (active() && kind === "add" && beforePurchaseTransition) {
          const transition = await beforePurchaseTransition(kind);
          if (transition.proceed) openDrawer(transition.drawerTrigger ?? trigger);
        }
      }
      emitStorefrontCommerceEvent({ name: "add_to_cart", data });
      if (!active()) return;
      if (kind === "buy") {
        if (beforePurchaseTransition && !(await beforePurchaseTransition(kind)).proceed) return;
        emitStorefrontCommerceEvent({ name: "begin_checkout", data });
        router.push("/checkout");
      } else setStatus("Ürün sepete eklendi.");
    } catch { if (active()) setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin."); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  }

  const Title = quickView ? "h2" : "h1";
  return <section className="hk-purchase" aria-labelledby={`${id}-title`}>
    {options.showBrand && product.brand ? <Link className="hk-product-brand" href={`/search?q=${encodeURIComponent(product.brand.name)}`}>{product.brand.name}</Link> : null}
    <div className="hk-product-title"><Title id={`${id}-title`}>{product.title}</Title><FavoriteButton productId={product.id} productTitle={product.title} /></div>
    {options.showSku && variant?.sku ? <p className="hk-product-sku">Ürün kodu: {variant.sku}</p> : null}
    {product.merchandising?.highlights.length ? <ul className="hk-product-highlights">{product.merchandising.highlights.map(text => <li key={text}>{text}</li>)}</ul> : null}
    {choices ? <label className="hk-option-label" htmlFor={`${id}-variant`}>Ölçü ve paket seçimi<select id={`${id}-variant`} value={selectedId} disabled={pending !== null} onChange={event => { if (!busy.current) { selectVariant(event.currentTarget.value); setQuantity(1); setStatus(""); } }}>{product.variants.map(item => <option key={item.id} value={item.id} disabled={!item.available && !restock?.enabled}>{item.title} — {formatTry(item.priceCents)}{!item.available ? " · Tükendi" : ""}</option>)}</select></label> : null}
    {variant && Object.keys(variant.attributes).length ? <dl className="hk-product-attributes">{Object.entries(variant.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl> : null}
    <div className="hk-price" aria-live="polite"><strong>{formatTry(amount)}</strong>{variant?.compareAtCents && variant.compareAtCents > amount ? <del>{formatTry(variant.compareAtCents)}</del> : null}{unit !== undefined && unit >= 1 ? <span className="hk-unit-price">{formatTry(Math.round(unit))} / adet</span> : null}</div>
    {showQuantitySelector ? <div className="hk-quantity" aria-label="Sipariş adedi seçimi"><span>{pieces ? "Paket sayısı" : "Sipariş adedi"}</span><div><button type="button" aria-label="Adedi azalt" disabled={pending !== null || !allowed || quantity <= 1} onClick={() => setQuantity(value => decrementPurchaseQuantity(value, limit))}>−</button><output aria-label="Sipariş adedi" aria-live="polite">{quantity}</output><button type="button" aria-label="Adedi artır" disabled={pending !== null || !allowed || quantity >= limit} onClick={() => setQuantity(value => incrementPurchaseQuantity(value, limit))}>+</button></div></div> : null}
    <div className="hk-total"><span>Toplam{pieces ? <small>{(pieces * quantity).toLocaleString("tr-TR")} adet</small> : null}</span><strong>{formatTry(amount * quantity)}</strong></div>
    <div className="hk-purchase-actions"><button className="hk-button" type="button" disabled={pending !== null || !allowed} onClick={event => void run("add", event.currentTarget)}><HizliIcon name="bag" />{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button><button type="button" className="hk-button hk-buy" disabled={pending !== null || !allowed} onClick={event => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}<HizliIcon name="arrow" /></button></div>
    {!allowed && pending === null ? <p className="hk-unavailable">Bu seçenek şu anda mevcut değil.</p> : null}
    <p className="hk-purchase-status" role="status" aria-live="polite">{status}</p>
    <RestockSubscriptionForm product={product} variant={variant} />
    {options.mobileStickyPurchase && !quickView ? <div className="hk-purchase-sticky" hidden={drawerOpen}><div><small>Toplam</small><strong>{formatTry(amount * quantity)}</strong></div><button type="button" className="hk-button" disabled={pending !== null || !allowed} onClick={event => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : allowed ? "Sepete ekle" : "Tükendi"}<HizliIcon name="bag" /></button></div> : null}
  </section>;
}
