import type { PublicCheckoutQuoteV2 } from "@celebix/saas-contracts";
import type { CheckoutIntentKind } from "../cart/types.ts";

type QuotedCheckout = Readonly<{ quote: PublicCheckoutQuoteV2; quoteDigest: string }>;
type QuoteRequest = (intent: CheckoutIntentKind, codes: readonly string[]) => Promise<QuotedCheckout>;
export type ReconciledCheckoutQuote = QuotedCheckout & Readonly<{
  normalizedCodes: readonly string[];
  rejectedCodes: readonly string[];
}>;

// The server digest includes rejected promotions. Confirm the retained candidates
// again, within one serialized operation, before exposing a submit-ready digest.
export async function reconcileCheckoutQuote(request: QuoteRequest, intent: CheckoutIntentKind, codes: readonly string[]): Promise<ReconciledCheckoutQuote> {
  if (codes.length > 5) throw new Error("checkout_quote_candidates_invalid");
  let candidates = Object.freeze([...codes]);
  const rejectedCodes = new Set<string>();
  for (let attempt = 0; attempt <= 5; attempt += 1) {
    const selected = await request(intent, candidates);
    if (selected.quote.rejectedPromotions.length === 0) {
      return Object.freeze({ ...selected, normalizedCodes: candidates, rejectedCodes: Object.freeze([...rejectedCodes]) });
    }
    const rejected = new Set(selected.quote.rejectedPromotions.map(promotion => promotion.normalizedCode));
    const retained = candidates.filter(code => !rejected.has(code));
    if (retained.length === candidates.length) throw new Error("checkout_quote_rejection_invalid");
    for (const code of candidates) if (rejected.has(code)) rejectedCodes.add(code);
    candidates = Object.freeze(retained);
  }
  throw new Error("checkout_quote_reconciliation_failed");
}
