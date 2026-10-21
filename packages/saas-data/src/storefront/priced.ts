import { parsePublicCart, parsePublicCartV2, type PricedPublicCart, type PricedPublicCartV2 } from '@celebix/saas-contracts';

/** Database/payment readers require money. Hidden projections are exclusively a public response. */
export function parsePricedPublicCart(value: unknown): PricedPublicCart {
  const cart = parsePublicCart(value);
  if (cart.pricesHidden || cart.subtotalCents === null || cart.shippingCents === null || cart.totalCents === null
    || cart.items.some(item => item.pricesHidden || item.unitPriceCents === null || item.lineTotalCents === null)) throw new TypeError('priced_storefront_required');
  return cart as PricedPublicCart;
}
export function parsePricedPublicCartV2(value: unknown): PricedPublicCartV2 {
  const cart = parsePublicCartV2(value);
  if (cart.pricesHidden || cart.subtotalCents === null || cart.shippingCents === null || cart.totalCents === null
    || cart.lineDiscountCents === null || cart.shippingDiscountCents === null || cart.discountCents === null
    || cart.items.some(item => item.pricesHidden || item.unitPriceCents === null || item.lineTotalCents === null || item.discountCents === null || item.payableCents === null)) throw new TypeError('priced_storefront_required');
  return cart as PricedPublicCartV2;
}
