import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { resolvePublicQuickOrder } from "@/lib/checkout/public-quick-link.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const metadata: Metadata = Object.freeze({
  title: "Hızlı sipariş",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(cents: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}

export default async function QuickOrderPage() {
  const requestHeaders = await headers();
  const authority = selectTrustedStorefrontHostAuthority(requestHeaders);
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (authority.kind !== "trusted" || runtime === null) {
    return <main className="store-container store-section"><h1>Hızlı sipariş kullanılamıyor</h1><p>Bağlantıyı yeniden açmayı deneyin.</p></main>;
  }
  const cookieStore = await cookies();
  const selected = await resolvePublicQuickOrder({
    trustedHostname: authority.hostname,
    cookieHeader: cookieStore.toString() || null,
    now: new Date(),
    runtime: runtime.checkout,
  });
  if (selected.kind !== "active") {
    return <main className="store-container store-section"><h1>Hızlı sipariş bulunamadı</h1><p>Bağlantının süresi dolmuş veya bağlantı artık kullanılamıyor olabilir.</p></main>;
  }
  const { quote } = selected;
  const operationId = randomUUID();
  return <main className="store-container store-section">
    <span>GÜVENLİ HIZLI SİPARİŞ</span>
    <h1>{quote.merchantName}</h1>
    <p>Ödeme öncesi sipariş özetinizi kontrol edin.</p>
    <ul aria-label="Sipariş ürünleri">
      {quote.items.map((item, index) => <li key={`${item.productName}-${index}`}>
        <strong>{item.productName}</strong>{item.variantName ? ` · ${item.variantName}` : ""}
        <span> × {item.quantity} — {money(item.lineTotalCents)}</span>
      </li>)}
    </ul>
    <dl>
      <div><dt>Ara toplam</dt><dd>{money(quote.subtotalCents)}</dd></div>
      <div><dt>Kargo</dt><dd>{money(quote.shippingCents)}</dd></div>
      <div><dt>İndirim</dt><dd>-{money(quote.discountCents)}</dd></div>
      <div><dt>Toplam</dt><dd><strong>{money(quote.totalCents)}</strong></dd></div>
    </dl>
    <form method="post" action="/api/quick-order/checkout">
      <input type="hidden" name="operation_id" value={operationId} />
      <button type="submit">Güvenli ödemeye geç</button>
    </form>
  </main>;
}
