/** Navigation only. Authentication, store authority and prices never come from this hint. */
export const MERCHANT_PURCHASE_HINT = 'toshi-test-1' as const;
type PackageCode = 'starter' | 'growth' | 'professional';
type PackageTerm = 'monthly' | 'annual';
type PackageHint = `${PackageCode}:${PackageTerm}`;
export type MerchantPurchaseHint = typeof MERCHANT_PURCHASE_HINT | PackageHint;

function isPackageCode(value: unknown): value is PackageCode {
  return value === 'starter' || value === 'growth' || value === 'professional';
}

function isPackageTerm(value: unknown): value is PackageTerm {
  return value === 'monthly' || value === 'annual';
}

export function merchantPackageSelection(hint: MerchantPurchaseHint | undefined) {
  if (!hint || hint === MERCHANT_PURCHASE_HINT) return undefined;
  const [code, term, extra] = hint.split(':');
  return !extra && isPackageCode(code) && isPackageTerm(term) ? { code, term } : undefined;
}

export function merchantPurchaseHintFromPage(query?: Readonly<Record<string, unknown>>): MerchantPurchaseHint | undefined {
  if (!query || !Object.hasOwn(query, 'purchase')) return undefined;
  const keys = Object.keys(query);
  if (keys.length === 1 && query.purchase === MERCHANT_PURCHASE_HINT) return MERCHANT_PURCHASE_HINT;
  if (keys.length === 2 && Object.hasOwn(query, 'term') && isPackageCode(query.purchase) && isPackageTerm(query.term)) {
    return `${query.purchase}:${query.term}`;
  }
}

/** Boundary routes accept only canonical, duplicate-free purchase queries. */
export function merchantPurchaseHintFromSearch(search: string): MerchantPurchaseHint | undefined {
  if (search === '') return undefined;
  const hint = merchantPurchaseHintFromPage(Object.fromEntries(new URLSearchParams(search)));
  if (hint === undefined || merchantPurchaseSearch(hint) !== search) throw new Error('merchant_purchase_hint_invalid');
  return hint;
}

export function merchantPurchaseSearch(hint?: MerchantPurchaseHint): string {
  if (hint === undefined) return '';
  if (hint === MERCHANT_PURCHASE_HINT) return `?purchase=${hint}`;
  const selection = merchantPackageSelection(hint);
  if (!selection) throw new Error('merchant_purchase_hint_invalid');
  return `?purchase=${selection.code}&term=${selection.term}`;
}

export function merchantPurchaseDestination(hint?: MerchantPurchaseHint): string {
  const search = merchantPurchaseSearch(hint);
  if (hint === MERCHANT_PURCHASE_HINT) return `/settings/artificial-intelligence${search}`;
  return search ? `/settings/plan${search}#plan-checkout` : '/';
}
