import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { GoogleMarketingCapturedResultSignal } from "@/components/GoogleMarketingCapturedResultSignal";
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

  const terminalFailure = hostedStatus?.status === "failed"
    || hostedStatus?.status === "cancelled"
    || hostedStatus?.status === "expired"
    || hostedStatus?.status === "stock_conflict";
  const processing = hostedStatus?.status === "active"
    || hostedStatus?.status === "provider_ready"
    || hostedStatus?.status === "processing"
    || hostedStatus?.status === "captured";

  return <StorefrontFrame storefront={storefront} design={design}>
    {hostedStatus?.status === "captured" ? <GoogleMarketingCapturedResultSignal sessionId={hostedStatus.sessionId} version={hostedStatus.version} /> : null}
    <div className="checkout-result-page store-container">
      {hostedStatus?.status === "captured" ? <article className="checkout-result-state checkout-result-success">
        <span className="checkout-result-mark" aria-hidden="true">✓</span>
        <h1>Ödemeniz alındı</h1>
        <p>Siparişiniz oluşturuldu. Ayrıntıları hesabınızdan görebilirsiniz.</p>
        <Link className="store-button" href="/account">Siparişlerimi gör</Link>
      </article> : terminalFailure ? <article className="checkout-result-state">
        <span className="checkout-result-mark" aria-hidden="true">↩</span>
        <h1>Ödeme tamamlanamadı</h1>
        <p>Sepetiniz korunuyor; yeniden deneyebilirsiniz.</p>
        <Link className="store-button" href="/checkout">Yeniden ödeme dene</Link>
      </article> : processing ? <article className="checkout-result-state" aria-live="polite">
        <span className="checkout-result-spinner" aria-hidden="true" />
        <h1>{hostedStatus?.status === "provider_ready" && hostedStatus.safeCode !== "provider_confirmation_pending" ? "Ödeme oturumunuz hazır" : "Ödeme sonucu kontrol ediliyor"}</h1>
        <p>{hostedStatus?.status === "provider_ready" && hostedStatus.safeCode !== "provider_confirmation_pending"
          ? "Başlattığınız ödeme oturumuna devam edebilirsiniz."
          : "Banka ve ödeme sağlayıcısının sonucu bekleniyor. Sepetiniz korunuyor; sonuç geldiğinde siparişiniz otomatik güncellenecek."}</p>
        {hostedStatus?.status === "provider_ready" && hostedStatus.safeCode !== "provider_confirmation_pending"
          ? <Link className="store-button" href="/checkout/payment">Ödemeye devam et</Link> : null}
        <Link className="store-button store-button-secondary" href="/checkout/payment/result">Durumu yenile</Link>
      </article> : <article className="checkout-result-state">
        <span className="checkout-result-mark" aria-hidden="true">↩</span>
        <h1>Ödeme durumu alınamadı</h1>
        <p>Sepetinizden güvenle devam edebilirsiniz.</p>
        <Link className="store-button" href="/cart">Sepete dön</Link>
      </article>}
    </div>
  </StorefrontFrame>;
}
