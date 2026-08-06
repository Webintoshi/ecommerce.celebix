import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { CheckoutSummary } from "@/components/CheckoutSummary";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme durumu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HostedCheckoutResultPage() {
  const { runtime, storefront, design } = requireStorefrontPage(await resolveStorefrontPage());
  const cookieHeader = (await cookies()).toString() || null;
  const hostedCheckout = runtime.hostedCheckout;
  const hostedStatus = hostedCheckout
    ? await hostedCheckout.status({ hostname: storefront.hostname, cookieHeader }).catch(() => null)
    : null;
  const receipt = hostedStatus?.status === "captured"
    ? await runtime.cart.getReceipt(storefront.hostname, cookieHeader).catch(() => null)
    : null;

  const terminalFailure = hostedStatus?.status === "failed"
    || hostedStatus?.status === "cancelled"
    || hostedStatus?.status === "expired"
    || hostedStatus?.status === "stock_conflict";
  const processing = hostedStatus?.status === "active"
    || hostedStatus?.status === "provider_ready"
    || hostedStatus?.status === "processing"
    || hostedStatus?.status === "captured";

  return <StorefrontFrame storefront={storefront} design={design}>
    <main className="checkout-result-page store-container">
      {receipt ? <div className="checkout-result-layout">
        <article className="checkout-result-state checkout-result-success">
          <span className="checkout-result-mark" aria-hidden="true">✓</span>
          <h1>Ödemeniz alındı</h1>
          <p>Siparişiniz başarıyla oluşturuldu.</p>
          <Link className="store-button" href="/account">Siparişlerimi gör</Link>
        </article>
        <CheckoutSummary summary={receipt} />
      </div> : terminalFailure ? <article className="checkout-result-state">
        <span className="checkout-result-mark" aria-hidden="true">↩</span>
        <h1>Ödeme tamamlanamadı</h1>
        <p>Sepetiniz korunuyor; yeniden deneyebilirsiniz.</p>
        <Link className="store-button" href="/cart">Sepete dön</Link>
      </article> : processing ? <article className="checkout-result-state" aria-live="polite">
        <span className="checkout-result-spinner" aria-hidden="true" />
        <h1>Ödeme doğrulanıyor</h1>
        <p>Sağlayıcı onayı bekleniyor.</p>
        <Link className="store-button store-button-secondary" href="/checkout/payment/result">Durumu yenile</Link>
      </article> : <article className="checkout-result-state">
        <span className="checkout-result-mark" aria-hidden="true">↩</span>
        <h1>Ödeme durumu alınamadı</h1>
        <p>Sepetinizden güvenle devam edebilirsiniz.</p>
        <Link className="store-button" href="/cart">Sepete dön</Link>
      </article>}
    </main>
  </StorefrontFrame>;
}
