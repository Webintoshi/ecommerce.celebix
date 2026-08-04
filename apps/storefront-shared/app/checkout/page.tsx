import type { Metadata } from "next";
import { cookies } from "next/headers";

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
  const { storefront, design, runtime } = requireStorefrontPage(await resolveStorefrontPage());
  const account = runtime.identity ? await runtime.identity.session(storefront.hostname, (await cookies()).toString() || null).catch(() => null) : null;
  const address = account?.outcome === "found" ? account.snapshot.addresses.find((item) => item.isDefault) ?? account.snapshot.addresses[0] : undefined;
  const initialDraft = account?.outcome === "found" ? {
    name: `${account.snapshot.profile.firstName} ${account.snapshot.profile.lastName}`.trim(),
    email: account.snapshot.profile.email,
    phone: account.snapshot.profile.phone ?? "",
    addressLine1: address?.line1 ?? "",
    addressLine2: address?.line2 ?? "",
    city: address?.city ?? "",
    district: address?.district ?? "",
    postalCode: address?.postalCode ?? "",
  } : undefined;
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <main className="checkout-page">
        <header className="checkout-page-header store-container">
          <span>GÜVENLİ ÖDEME</span>
          <h1>Siparişinizi tamamlayın</h1>
          <p>Teslimat ve ödeme bilgilerinizi tek ekranda güvenle tamamlayın.</p>
        </header>
        <section className="checkout-page-body store-container">
          <CheckoutForm intentKind={intent((await searchParams).intent)} initialDraft={initialDraft} />
        </section>
      </main>
    </StorefrontFrame>
  );
}
