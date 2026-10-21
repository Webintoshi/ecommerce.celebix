"use client";

import { useCommercePolicy } from "./CommercePolicyProvider";
import { WhatsAppOrderButton } from "./WhatsAppOrderButton";
import { useState } from "react";

import type { PublicProduct } from "@celebix/saas-contracts";

import {
  addCartLineAndOpenDrawer,
  storefrontCartClient,
} from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { useCartStatus } from "./CartStatusProvider";

export function ProductCardCartButton({
  product,
  productId,
  variantId,
  categoryId,
  productTitle,
  currency,
  valueMinor,
  available,
  label = "Sepete ekle",
}: Readonly<{
  product: PublicProduct;
  productId: string;
  variantId: string;
  categoryId?: string;
  productTitle: string;
  currency: PublicProduct["currency"];
  valueMinor: number | null;
  available: boolean;
  label?: string;
}>) {
  const policy = useCommercePolicy();
  const { openDrawer, replaceCart } = useCartStatus();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const add = async (trigger: HTMLButtonElement) => {
    if (policy.hideAddToCart || !available || pending) return;
    setPending(true);
    setStatus("");
    try {
      await addCartLineAndOpenDrawer(
        { productId, variantId, quantity: 1 },
        trigger,
        { add: storefrontCartClient.add, openDrawer, replaceCart },
      );
      if (!policy.hidePrices && valueMinor !== null) emitStorefrontCommerceEvent({
        name: "add_to_cart",
        data: {
          productId,
          variantId,
          ...(categoryId ? { categoryId } : {}),
          quantity: 1,
          currency,
          valueMinor,
        },
      });
      setStatus(`${productTitle} sepete eklendi.`);
    } catch (error) {
      setStatus(error instanceof Error && error.message === "whatsapp_only" ? "Sipariş talebinizi WhatsApp üzerinden iletebilirsiniz. Sayfayı yenileyin." : "Ürün sepete eklenemedi.");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      {!policy.hideAddToCart ? <button
        className="product-card-cart"
        type="button"
        disabled={!available || pending}
        onClick={(event) => void add(event.currentTarget)}
      >
        {pending ? "Ekleniyor…" : available ? label : "Tükendi"}
      </button> : null}
      <WhatsAppOrderButton product={product} variant={product.variants.find(item => item.id === variantId)} quantity={1} className="product-card-cart" />
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </>
  );
}
