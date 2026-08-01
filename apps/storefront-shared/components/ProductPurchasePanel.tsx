"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PublicProduct } from "@celebix/saas-contracts";
import { storefrontCartClient } from "@/lib/cart/client.ts";
import { formatTry } from "@/lib/format.ts";
import { useCartStatus } from "./CartStatusProvider";

export function ProductPurchasePanel({ product, mobileSticky = false }: Readonly<{ product: PublicProduct; mobileSticky?: boolean }>) {
  const router = useRouter();
  const { replaceCart } = useCartStatus();
  const [selectedId, setSelectedId] = useState(product.variants.find(({ available }) => available)?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState<"add" | "buy" | null>(null);
  const [status, setStatus] = useState("");
  const variant = product.variants.find(({ id }) => id === selectedId);
  const allowed = Boolean(variant?.available) && quantity >= 1 && quantity <= 99;

  const run = async (kind: "add" | "buy", trigger: HTMLButtonElement) => {
    if (!variant || !allowed || pending) { setStatus("Lütfen stokta olan bir varyant seçin."); return; }
    setPending(kind); setStatus("");
    try {
      const nextCart = await storefrontCartClient.add({ productId: product.id, variantId: variant.id, quantity });
      replaceCart(nextCart, { openDrawer: kind === "add", trigger });
      if (kind === "add") {
        setStatus("Ürün sepete eklendi.");
      } else {
        router.push("/checkout");
      }
    } catch { setStatus("İşlem tamamlanamadı. Lütfen yeniden deneyin."); }
    finally { setPending(null); }
  };

  return <section className={`purchase-panel${mobileSticky ? " is-mobile-sticky" : ""}`} aria-labelledby="purchase-variants-title">
    <fieldset disabled={pending !== null}><legend id="purchase-variants-title">Varyant seçin</legend><div className="purchase-variants">{product.variants.map((variant) => <label className={variant.available ? "" : "is-disabled"} key={variant.id}><input type="radio" name="variant" value={variant.id} checked={selectedId === variant.id} disabled={!variant.available} onChange={() => setSelectedId(variant.id)} /><span><b>{variant.title}</b><small>{variant.available ? (variant.stockTracking ? `${variant.stockQuantity} adet` : "Stokta") : "Tükendi"}</small></span><strong>{formatTry(variant.priceCents)}</strong></label>)}</div></fieldset>
    <label className="purchase-quantity"><span>Adet</span><input aria-label="Adet" type="number" min="1" max="99" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Number(event.currentTarget.value) || 1)))} /></label>
    <div className="purchase-actions"><button className="store-button" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("add", event.currentTarget)}>{pending === "add" ? "Ekleniyor…" : "Sepete ekle"}</button><button className="store-button store-button-secondary" type="button" disabled={pending !== null || !allowed} onClick={(event) => void run("buy", event.currentTarget)}>{pending === "buy" ? "Hazırlanıyor…" : "Şimdi satın al"}</button></div>
    <p className="purchase-status" aria-live="polite">{status}</p>
  </section>;
}
