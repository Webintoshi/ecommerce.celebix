"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PublicProduct } from "@celebix/saas-contracts";
import { addCartLineAndOpenDrawer, storefrontCartClient } from "@/lib/cart/client.ts";
import { formatTry } from "@/lib/format.ts";
import { useCartStatus } from "./CartStatusProvider";
import { decrementPurchaseQuantity, incrementPurchaseQuantity } from "./product-purchase-quantity.ts";

export function ProductPurchasePanel({ product, mobileSticky = false, available, showQuantitySelector = true }: Readonly<{ product: PublicProduct; mobileSticky?: boolean; available: boolean; showQuantitySelector?: boolean }>) {
  const router = useRouter();
  const { openDrawer, replaceCart } = useCartStatus();
  const [selectedId, setSelectedId] = useState(product.variants.find(({ available }) => available)?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const variant = product.variants.find(({ id }) => id === selectedId);
  const quantityLimit = variant?.stockTracking ? Math.max(1, Math.min(99, variant.stockQuantity)) : 99;
  const allowed = available && Boolean(variant?.available) && quantity >= 1 && quantity <= quantityLimit;
  const showVariantChoices = product.variants.length > 1 || product.variants.some(({ title }) => title.trim().toLocaleLowerCase("tr-TR") !== "varsayılan");

  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (!variant || !allowed || pending) { setStatus("Lütfen stokta olan bir varyant seçin."); return; }
    setPending(kind); setStatus("");
    try {
      if (kind === "add") {
        await addCartLineAndOpenDrawer({ productId: product.id, variantId: variant.id, quantity }, trigger, { add: storefrontCartClient.add, openDrawer, replaceCart });
        setStatus("Ürün sepete eklendi.");
      } else {
        replaceCart(await storefrontCartClient.add({ productId: product.id, variantId: variant.id, quantity }));
        router.push("/checkout");
      }
    } catch { setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin."); }
    finally { setPending(null); }
  };

  return <section className={`purchase-panel${mobileSticky ? " is-mobile-sticky" : ""}`} aria-label={showVariantChoices ? undefined : "Satın alma"} aria-labelledby={showVariantChoices ? "purchase-variants-title" : undefined}>
    {showVariantChoices ? <fieldset disabled={pending !== null}><legend id="purchase-variants-title">Varyant seçin</legend><div className="purchase-variants">{product.variants.map((variant) => <label className={variant.available ? "" : "is-disabled"} key={variant.id}><input type="radio" name="variant" value={variant.id} checked={selectedId === variant.id} disabled={!variant.available} onChange={() => { setSelectedId(variant.id); setQuantity(1); }} /><span><b>{variant.title}</b><small>{variant.available ? (variant.stockTracking ? `${variant.stockQuantity} adet` : "Stokta") : "Tükendi"}</small></span><strong>{formatTry(variant.priceCents)}</strong></label>)}</div></fieldset> : null}
    <div className={`purchase-action-row${showQuantitySelector ? "" : " is-quantity-hidden"}`}>
      {showQuantitySelector ? <div className="purchase-quantity" aria-label="Adet seçimi">
        <button type="button" aria-label="Adedi azalt" disabled={pending !== null || quantity <= 1} onClick={() => setQuantity((value) => decrementPurchaseQuantity(value, quantityLimit))}>−</button>
        <output aria-live="polite" aria-label="Adet">{quantity}</output>
        <button type="button" aria-label="Adedi artır" disabled={pending !== null || quantity >= quantityLimit} onClick={() => setQuantity((value) => incrementPurchaseQuantity(value, quantityLimit))}>+</button>
      </div> : null}
      <div className="purchase-actions"><button className="store-button" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button><button className="store-button store-button-secondary" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}</button></div>
    </div>
    <p className="purchase-status" aria-live="polite">{status}</p>
  </section>;
}
