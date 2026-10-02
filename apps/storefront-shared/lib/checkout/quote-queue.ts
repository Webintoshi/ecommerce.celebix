import type { CheckoutIntentKind } from "../cart/types.ts";

// The quote response also writes the coupon candidate cookie. Serialize all
// quote requests, including responses ignored by a newer UI request.
export function createCheckoutQuoteQueue<T>(request: (intent: CheckoutIntentKind, codes: readonly string[]) => Promise<T>) {
  let previous: Promise<void> = Promise.resolve();
  return (intent: CheckoutIntentKind, codes: readonly string[]): Promise<T> => {
    const candidates = Object.freeze([...codes]);
    const next = previous.then(() => request(intent, candidates));
    previous = next.then(() => undefined, () => undefined);
    return next;
  };
}
