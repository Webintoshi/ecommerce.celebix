import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { readStandardHostedCheckoutCookie } from "@/lib/checkout/standard-hosted-cookie.ts";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme sonucu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

const HOSTED_RESULT_TARGET = "/checkout/payment/result";

function hostedReturnScript(target: string): string {
  const serialized = JSON.stringify(target);
  return `try{if(window.top&&window.top!==window){window.top.location.replace(${serialized});}else{window.location.replace(${serialized});}}catch{window.location.replace(${serialized});}`;
}

export default async function QuickOrderResultPage() {
  if (readStandardHostedCheckoutCookie((await cookies()).toString() || null).kind === "present") {
    const nonce = (await headers()).get("x-nonce") ?? undefined;
    return <main className="store-container store-section checkout-result-page">
      <article className="checkout-result-state" aria-live="polite">
        <span className="checkout-result-spinner" aria-hidden="true" />
        <h1>Ödeme doğrulanıyor</h1>
        <p>PayTR sonucu alındı; güvenli sipariş ekranına yönlendiriliyorsunuz.</p>
        <a className="store-button" href={HOSTED_RESULT_TARGET} target="_top">Ödeme sonucunu aç</a>
      </article>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: hostedReturnScript(HOSTED_RESULT_TARGET) }} />
    </main>;
  }
  return <main className="store-container store-section">
    <h1>Ödeme sonucu</h1>
    <p>Ödemenizin kesin durumu güvenli bildirim tamamlandığında güncellenir. Bu dönüş sayfası siparişi onaylamaz.</p>
    <a href="/api/quick-order/status">Ödeme durumunu görüntüle</a>
  </main>;
}
