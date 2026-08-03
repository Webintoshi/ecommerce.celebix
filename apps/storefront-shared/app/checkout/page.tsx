import type { Metadata } from "next";

import { CheckoutForm } from "@/components/CheckoutForm";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import type { CheckoutIntentKind } from "@/lib/cart/types.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Ödeme",
  robots: { index: false, follow: false },
};

function intent(value: string | string[] | undefined): CheckoutIntentKind {
  return value === "buy-now" ? "buy_now" : "cart";
}

export default async function CheckoutPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ intent?: string | string[] }> }>) {
  const { storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <main className="checkout-page">
        <header className="checkout-page-header store-container">
          <span>GÜVENLİ ÖDEME</span>
          <h1>Siparişinizi tamamlayın</h1>
          <p>Teslimat ve ödeme bilgilerinizi tek ekranda güvenle tamamlayın.</p>
        </header>
        <section className="checkout-page-body store-container">
          <CheckoutForm intentKind={intent((await searchParams).intent)} />
        </section>
      </main>
    </StorefrontFrame>
  );
}
