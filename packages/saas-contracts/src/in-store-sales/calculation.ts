import type { InStoreDiscount, InStoreSaleTotals } from './types.ts';

export interface InStorePriceLine { readonly unitPriceCents:number;readonly quantity:number;readonly discountEligible:boolean; }
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
export function calculateInStoreTotals(lines:readonly InStorePriceLine[], discount:InStoreDiscount|null):Readonly<InStoreSaleTotals> {
  const invalid = ():never => { throw new TypeError('in_store_discount_invalid'); };
  if (!Array.isArray(lines) || lines.length > 100) invalid();
  let subtotal = 0n; let eligible = 0n;
  for (const line of lines) {
    if (!line || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999 || typeof line.discountEligible !== 'boolean') invalid();
    const value = BigInt(line.unitPriceCents) * BigInt(line.quantity);
    subtotal += value; if (line.discountEligible) eligible += value;
  }
  if (subtotal > MAX) invalid();
  let deducted = 0n;
  if (discount !== null) {
    if (!discount || typeof discount !== 'object') invalid();
    if (discount.kind === 'percentage') {
      if (!Number.isSafeInteger(discount.percentageBps) || discount.percentageBps < 1 || discount.percentageBps >= 10000 || Object.keys(discount).some(key=>!['kind','percentageBps'].includes(key))) invalid();
      deducted = eligible * BigInt(discount.percentageBps) / 10000n;
    } else if (discount.kind === 'fixed_amount') {
      if (!Number.isSafeInteger(discount.amountCents) || discount.amountCents < 1 || Object.keys(discount).some(key=>!['kind','amountCents'].includes(key))) invalid();
      deducted = BigInt(discount.amountCents);
    } else invalid();
    if (eligible === 0n || deducted >= eligible || subtotal-deducted <= 0n) invalid();
  }
  return Object.freeze({subtotalCents:Number(subtotal),eligibleSubtotalCents:Number(eligible),discountCents:Number(deducted),totalCents:Number(subtotal-deducted)});
}
