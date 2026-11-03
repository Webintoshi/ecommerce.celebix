import assert from 'node:assert/strict';
import test from 'node:test';
import { TOSHI_CREDIT_OFFERS } from './credits.ts';

test('sale catalog retires test credit while preserving the four normal immutable credit offers', () => {
 assert.equal(TOSHI_CREDIT_OFFERS.some(offer=>String(offer.id)==='toshi-test-1'),false);
 assert.deepEqual(TOSHI_CREDIT_OFFERS,[
  {id:'toshi-500',credits:500,netCents:24900},{id:'toshi-2500',credits:2500,netCents:99900},
  {id:'toshi-10000',credits:10000,netCents:299900},{id:'toshi-50000',credits:50000,netCents:1249900},
 ]);
 assert.ok(Object.isFrozen(TOSHI_CREDIT_OFFERS));assert.ok(TOSHI_CREDIT_OFFERS.every(Object.isFrozen));
});
