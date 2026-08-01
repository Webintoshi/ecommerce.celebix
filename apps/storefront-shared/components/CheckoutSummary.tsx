import type { PublicCart, PublicCheckoutReceipt } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";

type Summary = Pick<PublicCart | PublicCheckoutReceipt, "items" | "subtotalCents" | "shippingCents" | "totalCents">;

export function CheckoutSummary({ summary }: Readonly<{ summary: Summary }>) {
  return <aside className="checkout-summary" aria-label="Sipariş özeti"><span>SİPARİŞ ÖZETİ</span><h2>Sipariş özeti</h2><ul>{summary.items.map((item) => <li className="checkout-summary-line" key={item.variantId}>{item.media ? <img className="checkout-summary-media" src={item.media.url} alt={item.media.altText || item.title} width={item.media.width ?? 88} height={item.media.height ?? 88} /> : <span className="checkout-summary-media is-empty" aria-hidden="true">◇</span>}<span className="checkout-summary-copy"><b>{item.title}</b><small>{item.variantTitle}</small><small>{item.quantity} adet</small></span><strong>{formatTry(item.lineTotalCents)}</strong></li>)}</ul><dl><div><dt>Ara toplam</dt><dd>{formatTry(summary.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{summary.shippingCents === 0 ? "Ücretsiz" : formatTry(summary.shippingCents)}</dd></div><div><dt>Toplam</dt><dd>{formatTry(summary.totalCents)}</dd></div></dl></aside>;
}
