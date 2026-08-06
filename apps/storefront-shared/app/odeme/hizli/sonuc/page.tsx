import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readStandardHostedCheckoutCookie } from "@/lib/checkout/standard-hosted-cookie.ts";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme sonucu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuickOrderResultPage() {
  if (readStandardHostedCheckoutCookie((await cookies()).toString() || null).kind === "present") {
    redirect("/checkout/payment/result");
  }
  return <main className="store-container store-section">
    <h1>Ödeme sonucu</h1>
    <p>Ödemenizin kesin durumu güvenli bildirim tamamlandığında güncellenir. Bu dönüş sayfası siparişi onaylamaz.</p>
    <a href="/api/quick-order/status">Ödeme durumunu görüntüle</a>
  </main>;
}
