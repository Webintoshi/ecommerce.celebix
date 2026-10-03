import assert from 'node:assert/strict';
import test from 'node:test';
const feature = await import('./campaign-ui-model.ts');
type Progress = (presentation: unknown, cart: unknown) => null | Readonly<{ remainingCents: number; percent: number; achieved: boolean }>;
const model = () => { const candidate = (feature as Record<string, unknown>).freeShippingProgress; assert.equal(typeof candidate, 'function', 'published free-shipping progress model is implemented'); return candidate as Progress; };
const presentation = { showShippingProgress: true, freeShippingThresholdCents: 125050 };
const cart = { currency: 'TRY', subtotalCents: 100000, shippingCents: 1489, itemCount: 1, checkoutBlocker: null };
test('progress uses the exact merchandise subtotal and clamps at threshold', () => {
  assert.deepEqual(model()(presentation, cart), { remainingCents: 25050, percent: 79, achieved: false });
  assert.deepEqual(model()(presentation, { ...cart, subtotalCents: 125050, shippingCents: 0 }), { remainingCents: 0, percent: 100, achieved: true });
  assert.deepEqual(model()(presentation, { ...cart, subtotalCents: 900000, shippingCents: 0 }), { remainingCents: 0, percent: 100, achieved: true });
});
test('disabled, unverified, free-base, wrong-currency and invalid carts never promise threshold shipping', () => {
  const run = model();
  for (const [config, value] of [[{...presentation,showShippingProgress:false},cart],[{showShippingProgress:true},cart],[presentation,{...cart,checkoutBlocker:'shipping_unavailable'}],[presentation,{...cart,checkoutBlocker:'stock_unavailable'}],[presentation,{...cart,shippingCents:0}],[presentation,{...cart,currency:'EUR'}],[presentation,{...cart,itemCount:0}],[presentation,{...cart,subtotalCents:125050,shippingCents:1489}],[{...presentation,freeShippingThresholdCents:0},cart]]) assert.equal(run(config,value),null);
});
