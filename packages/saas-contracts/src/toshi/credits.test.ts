import assert from 'node:assert/strict';
import test from 'node:test';
import { TOSHI_CREDIT_OFFERS } from './credits.ts';

test('one-credit test SKU totals exactly one TRY including rounded VAT without changing existing offers', () => {
 const offer=TOSHI_CREDIT_OFFERS.find(offer=>String(offer.id)==='toshi-test-1');
 assert.deepEqual(offer,{id:'toshi-test-1',credits:1,netCents:83});
 assert.equal(offer!.netCents+Number((BigInt(offer!.netCents)*2000n+5000n)/10000n),100);
 assert.deepEqual(TOSHI_CREDIT_OFFERS.filter(offer=>String(offer.id)!=='toshi-test-1'),[
  {id:'toshi-500',credits:500,netCents:24900},{id:'toshi-2500',credits:2500,netCents:99900},
  {id:'toshi-10000',credits:10000,netCents:299900},{id:'toshi-50000',credits:50000,netCents:1249900},
 ]);
 assert.ok(Object.isFrozen(TOSHI_CREDIT_OFFERS));assert.ok(Object.isFrozen(offer));
});
