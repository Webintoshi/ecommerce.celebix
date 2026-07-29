"use client";

import { useState } from "react";

import { requestBuyNow } from "@/lib/buy-now.ts";

export function BuyNowButton({ productId, variantId, available }: Readonly<{
  productId: string;
  variantId: string;
  available: boolean;
}>) {
  const [state, setState] = useState<"idle" | "pending" | "failed">("idle");

  async function buy() {
    if (!available || state === "pending") return;
    setState("pending");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const result = await requestBuyNow({ productId, variantId, signal: controller.signal });
    window.clearTimeout(timeout);
    if (result.kind === "ready") {
      window.location.assign("/odeme");
      return;
    }
    setState("failed");
  }

  return <div className="variant-buy">
    <button type="button" className="store-button" disabled={!available || state === "pending"} onClick={buy}>
      {state === "pending" ? "Sepet hazırlanıyor…" : available ? "Satın al" : "Tükendi"}
    </button>
    {state === "failed" ? <p role="alert">Sepet hazırlanamadı. Lütfen yeniden deneyin.</p> : null}
  </div>;
}
