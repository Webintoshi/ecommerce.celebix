import type { PublicCheckoutQuoteV2 } from "@celebix/saas-contracts";

import {
  buildPromotionPresentation,
  couponRejectionMessage,
} from "@/lib/promotions/model.ts";

export function PromotionDetails({
  quote,
}: Readonly<{ quote: PublicCheckoutQuoteV2 }>) {
  const presentation = buildPromotionPresentation(quote);
  return (
    <div className="promotion-details">
      {presentation.labels.length > 0 ? (
        <ul className="promotion-labels" aria-label="Uygulanan kampanyalar">
          {presentation.labels.map((promotion, index) => (
            <li key={`${promotion.trigger}-${promotion.normalizedCode ?? "automatic"}-${index}`}>
              <span>{promotion.trigger === "automatic" ? "Otomatik kampanya" : "Kupon"}</span>
              <strong>{promotion.label}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      {presentation.gifts.length > 0 ? (
        <ul className="promotion-gifts" aria-label="Kampanya hediyeleri">
          {presentation.gifts.map((gift, index) => (
            <li key={`${gift.variantId}-${index}`}>
              <span aria-hidden="true">◇</span>
              <span><strong>Hediye: {gift.title}</strong><small>{gift.variantTitle} · {gift.quantity} adet</small></span>
            </li>
          ))}
        </ul>
      ) : null}
      {quote.rejectedPromotions.length > 0 ? (
        <p className="promotion-rejection" role="status">
          {couponRejectionMessage(quote.rejectedPromotions[0]!.reason)}
        </p>
      ) : null}
      {presentation.progressMessages.length > 0 ? (
        <ul className="promotion-progress" aria-live="polite" aria-label="Kampanya ilerlemesi">
          {presentation.progressMessages.map((message, index) => <li key={`${index}-${message.length}`}>{message}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
