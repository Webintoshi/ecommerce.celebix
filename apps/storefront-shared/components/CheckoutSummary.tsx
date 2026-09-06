import type {
  PublicCart,
  PublicCartLine,
  PublicCartLineV2,
  PublicCheckoutQuoteV2,
  PublicCheckoutReceipt,
} from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";
import { PromotionDetails } from "./PromotionDetails";

type Summary = Readonly<{
  items: readonly (PublicCartLine | PublicCartLineV2)[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  lineDiscountCents?: number;
  shippingDiscountCents?: number;
  discountCents?: number;
}> | Pick<PublicCart | PublicCheckoutReceipt, "items" | "subtotalCents" | "shippingCents" | "totalCents">;

export function CheckoutSummary({ summary, promotionQuote }: Readonly<{ summary: Summary; promotionQuote?: PublicCheckoutQuoteV2 | null }>) {
  const lineDiscountCents = "lineDiscountCents" in summary ? summary.lineDiscountCents : undefined;
  const shippingDiscountCents = "shippingDiscountCents" in summary ? summary.shippingDiscountCents : undefined;
  const discountCents = "discountCents" in summary ? summary.discountCents : undefined;
  return <aside className="checkout-summary" aria-label="Sipariş özeti"><span>SİPARİŞ ÖZETİ</span><h2>Sipariş özeti</h2><ul>{summary.items.map((item, index) => <li className="checkout-summary-line" key={`${item.variantId}-${index}`}>{item.media ? <img className="checkout-summary-media" src={item.media.url} alt={item.media.altText || item.title} width={item.media.width ?? 88} height={item.media.height ?? 88} /> : <span className="checkout-summary-media is-empty" aria-hidden="true">◇</span>}<span className="checkout-summary-copy"><b>{item.title}</b><small>{item.variantTitle}</small><small>{item.quantity} adet</small></span><strong>{"payableCents" in item && item.discountCents > 0 ? <><del>{formatTry(item.lineTotalCents)}</del><span>{formatTry(item.payableCents)}</span></> : formatTry(item.lineTotalCents)}</strong></li>)}</ul>{promotionQuote ? <PromotionDetails quote={promotionQuote} /> : null}<dl><div><dt>Ara toplam</dt><dd>{formatTry(summary.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{summary.shippingCents === 0 ? "Ücretsiz" : formatTry(summary.shippingCents)}</dd></div>{lineDiscountCents ? <div><dt>Ürün indirimi</dt><dd>-{formatTry(lineDiscountCents)}</dd></div> : null}{shippingDiscountCents ? <div><dt>Kargo indirimi</dt><dd>-{formatTry(shippingDiscountCents)}</dd></div> : null}{discountCents ? <div><dt>Toplam indirim</dt><dd>-{formatTry(discountCents)}</dd></div> : null}<div><dt>Toplam</dt><dd>{formatTry(summary.totalCents)}</dd></div></dl></aside>;
}
