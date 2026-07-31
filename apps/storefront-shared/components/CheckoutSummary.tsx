import type { PublicCart, PublicCheckoutReceipt } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";

type Summary = Pick<PublicCart | PublicCheckoutReceipt, "items" | "subtotalCents" | "shippingCents" | "totalCents">;

export function CheckoutSummary({ summary }: Readonly<{ summary: Summary }>) {
  return <aside className="checkout-summary" aria-label="Sipariş özeti"><span>SİPARİŞ ÖZETİ</span><h2>{summary.items.length} ürün</h2><ul>{summary.items.map((item) => <li key={item.variantId}><span>{item.title}<small>{item.variantTitle} · {item.quantity} adet</small></span><strong>{formatTry(item.lineTotalCents)}</strong></li>)}</ul><dl><div><dt>Ara toplam</dt><dd>{formatTry(summary.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{summary.shippingCents === 0 ? "Ücretsiz" : formatTry(summary.shippingCents)}</dd></div><div><dt>Toplam</dt><dd>{formatTry(summary.totalCents)}</dd></div></dl></aside>;
}
