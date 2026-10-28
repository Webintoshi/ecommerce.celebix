export const TOSHI_CREDIT_PRICES = Object.freeze({ description: 7, seoTitle: 1, seoDescription: 2, imageAlt: 1 } as const);
export const TOSHI_CREDIT_OFFERS = Object.freeze([
  Object.freeze({ id: 'toshi-test-1', credits: 1, netCents: 83 }),
  Object.freeze({ id: 'toshi-500', credits: 500, netCents: 24_900 }),
  Object.freeze({ id: 'toshi-2500', credits: 2_500, netCents: 99_900 }),
  Object.freeze({ id: 'toshi-10000', credits: 10_000, netCents: 299_900 }),
  Object.freeze({ id: 'toshi-50000', credits: 50_000, netCents: 1_249_900 }),
] as const);
export type ToshiCreditOffer = (typeof TOSHI_CREDIT_OFFERS)[number];
export type ToshiCreditWallet = Readonly<{ balance: number; reserved: number; available: number }>;
export function parseToshiCreditWallet(value: unknown): ToshiCreditWallet {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw TypeError('toshi_credit_wallet_invalid');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 3 || keys.some(key => typeof key !== 'string' || !['balance', 'reserved', 'available'].includes(key))) throw TypeError('toshi_credit_wallet_invalid');
  const result: Record<string, number> = {};
  for (const key of ['balance', 'reserved', 'available']) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0) throw TypeError('toshi_credit_wallet_invalid');
    result[key] = descriptor.value;
  }
  if (result.reserved! > result.balance! || result.available !== result.balance! - result.reserved!) throw TypeError('toshi_credit_wallet_invalid');
  return Object.freeze({ balance: result.balance!, reserved: result.reserved!, available: result.available! });
}
