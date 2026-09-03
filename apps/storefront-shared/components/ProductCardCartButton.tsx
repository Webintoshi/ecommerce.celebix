"use client";

import { useState } from "react";

import type { PublicProduct } from "@celebix/saas-contracts";

import {
  addCartLineAndOpenDrawer,
  storefrontCartClient,
} from "@/lib/cart/client.ts";
import { emitStorefrontCommerceEvent } from "@/lib/analytics/events.ts";
import { useCartStatus } from "./CartStatusProvider";

export function ProductCardCartButton({
  productId,
  variantId,
  categoryId,
  productTitle,
  currency,
  valueMinor,
  available,
  label = "Sepete ekle",
}: Readonly<{
  productId: string;
  variantId: string;
  categoryId?: string;
  productTitle: string;
  currency: PublicProduct["currency"];
  valueMinor: number;
  available: boolean;
  label?: string;
}>) {
  const { openDrawer, replaceCart } = useCartStatus();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const add = async (trigger: HTMLButtonElement) => {
    if (!available || pending) return;
    setPending(true);
    setStatus("");
    try {
      await addCartLineAndOpenDrawer(
        { productId, variantId, quantity: 1 },
        trigger,
        { add: storefrontCartClient.add, openDrawer, replaceCart },
      );
      emitStorefrontCommerceEvent({
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
    } catch {
      setStatus("Ürün sepete eklenemedi.");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <button
        className="product-card-cart"
        type="button"
        disabled={!available || pending}
        onClick={(event) => void add(event.currentTarget)}
      >
        {pending ? "Ekleniyor…" : available ? label : "Tükendi"}
      </button>
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </>
  );
}
