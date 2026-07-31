import type { Metadata } from "next";

import { CheckoutForm } from "@/components/CheckoutForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import type { CheckoutIntentKind } from "@/lib/cart/types.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = { title: "Ödeme", robots: { index: false, follow: false } };

function intent(value: string | string[] | undefined): CheckoutIntentKind { return value === "buy-now" ? "buy_now" : "cart"; }

export default async function CheckoutPage({ searchParams }: Readonly<{ searchParams: Promise<{ intent?: string | string[] }> }>) {
  const { storefront } = requireStorefrontPage(await resolveStorefrontPage());
  return <StorefrontFrame storefront={storefront}><section className="listing-hero"><div className="store-container"><span>GÜVENLİ SİPARİŞ</span><h1>Ödeme</h1><p>Teslimat bilgilerinizi girin ve mağazanın etkin ödeme yöntemini seçin.</p></div></section><section className="store-section store-container"><CheckoutForm intentKind={intent((await searchParams).intent)} /></section></StorefrontFrame>;
}
