import {
  normalizePromotionCode,
  parsePublicCheckoutQuoteV2,
  type PublicCheckoutQuoteV2,
  type PublicRejectedPromotion,
} from "@celebix/saas-contracts";

export type PromotionPresentation = Readonly<{
  discountFacts: Readonly<{
    lineDiscountCents: number;
    shippingDiscountCents: number;
    discountCents: number;
    totalCents: number;
  }>;
  labels: readonly Readonly<{
    label: string;
    trigger: "automatic" | "code";
    normalizedCode?: string;
  }>[];
  gifts: readonly Readonly<{
    variantId: string;
    quantity: number;
    title: string;
    variantTitle: string;
  }>[];
  progressMessages: readonly string[];
}>;

export function normalizeCouponCandidate(value: unknown): string {
  try {
    return normalizePromotionCode(value);
  } catch {
    throw new Error("coupon_candidate_invalid");
  }
}

export function couponRejectionMessage(
  _reason: PublicRejectedPromotion["reason"],
): string {
  return "Bu kod şu anda uygulanamıyor.";
}

export function buildPromotionPresentation(
  value: unknown,
): PromotionPresentation {
  const quote: PublicCheckoutQuoteV2 = parsePublicCheckoutQuoteV2(value);
  const gifts = quote.gifts.flatMap((gift) => {
    if (!gift.autoAdd) return [];
    const line = quote.cart.items.find(
      (item) =>
        item.variantId === gift.variantId &&
        item.available &&
        item.unitPriceCents === 0 &&
        item.lineTotalCents === 0 &&
        item.discountCents === 0 &&
        item.payableCents === 0,
    );
    return line
      ? [
          Object.freeze({
            variantId: gift.variantId,
            quantity: gift.quantity,
            title: line.title,
            variantTitle: line.variantTitle,
          }),
        ]
      : [];
  });
  return Object.freeze({
    discountFacts: Object.freeze({
      lineDiscountCents: quote.cart.lineDiscountCents,
      shippingDiscountCents: quote.cart.shippingDiscountCents,
      discountCents: quote.cart.discountCents,
      totalCents: quote.cart.totalCents,
    }),
    labels: Object.freeze(
      quote.appliedPromotions.map((promotion) =>
        Object.freeze({
          label: promotion.name,
          trigger: promotion.normalizedCode ? ("code" as const) : ("automatic" as const),
          ...(promotion.normalizedCode
            ? { normalizedCode: promotion.normalizedCode }
            : {}),
        }),
      ),
    ),
    gifts: Object.freeze(gifts),
    progressMessages: quote.progressMessages,
  });
}
