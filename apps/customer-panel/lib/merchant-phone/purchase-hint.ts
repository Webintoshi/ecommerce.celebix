/** Navigation only. Authentication, store authority and prices never come from this hint. */
export const MERCHANT_PURCHASE_HINT = 'toshi-test-1' as const;
export type MerchantPurchaseHint = typeof MERCHANT_PURCHASE_HINT;
const SEARCH = `?purchase=${MERCHANT_PURCHASE_HINT}`;

export function merchantPurchaseHintFromPage(query?: Readonly<Record<string, unknown>>): MerchantPurchaseHint | undefined {
  return query && Object.keys(query).length === 1 && Object.hasOwn(query, 'purchase') && query.purchase === MERCHANT_PURCHASE_HINT
    ? MERCHANT_PURCHASE_HINT : undefined;
}

/** Boundary routes reject duplicate/extra fields rather than accepting a general redirect URL. */
export function merchantPurchaseHintFromSearch(search: string): MerchantPurchaseHint | undefined {
  if (search === '') return undefined;
  if (search !== SEARCH) throw new Error('merchant_purchase_hint_invalid');
  return MERCHANT_PURCHASE_HINT;
}

export function merchantPurchaseSearch(hint?: MerchantPurchaseHint): string {
  if (hint === undefined) return '';
  if (hint !== MERCHANT_PURCHASE_HINT) throw new Error('merchant_purchase_hint_invalid');
  return SEARCH;
}

export function merchantPurchaseDestination(hint?: MerchantPurchaseHint): string {
  const search = merchantPurchaseSearch(hint);
  return search ? `/settings/artificial-intelligence${search}` : '/';
}
