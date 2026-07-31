"use client";

import { useState } from "react";

import { storefrontCartClient } from "@/lib/cart/client.ts";
import { useCartStatus } from "./CartStatusProvider";

export function ProductCardCartButton({ productId, variantId, productTitle, available }: Readonly<{ productId: string; variantId: string; productTitle: string; available: boolean }>) {
  const { replaceCart } = useCartStatus();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const add = async () => {
    if (!available || pending) return;
    setPending(true); setStatus("");
    try { replaceCart(await storefrontCartClient.add({ productId, variantId, quantity: 1 })); setStatus(`${productTitle} sepete eklendi.`); }
    catch { setStatus("Ürün sepete eklenemedi."); }
    finally { setPending(false); }
  };
  return <><button className="product-card-cart" type="button" disabled={!available || pending} onClick={() => void add()}>{pending ? "Ekleniyor…" : available ? "Sepete ekle" : "Tükendi"}</button><span className="sr-only" aria-live="polite">{status}</span></>;
}
