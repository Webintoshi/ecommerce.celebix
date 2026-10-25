import assert from 'node:assert/strict';
import test from 'node:test';
import * as contracts from '../index.ts';

test('product page settings are independent closed settings with version zero', () => {
  assert.equal(typeof contracts.parseProductPageReviewSettings, 'function');
  const parse = contracts.parseProductPageReviewSettings;
  assert.deepEqual(parse({enabled:false,version:0}), {enabled:false,version:0});
  assert.deepEqual(parse({enabled:true,version:2}), {enabled:true,version:2});
  for (const value of [{enabled:false,version:-1},{enabled:1,version:0},{enabled:true,version:1,delayDays:7},{enabled:true,version:Number.MAX_SAFE_INTEGER+1}]) assert.throws(()=>parse(value));
  assert.throws(()=>contracts.parseReviewCollectionSettings({enabled:true,version:1}));
});
test('availability reveals only the form state and no account identity', () => {
  assert.equal(typeof contracts.parseProductPageReviewAvailability, 'function');
  const parse = contracts.parseProductPageReviewAvailability;
  for(const value of [{enabled:false},...['guest','available','submitted'].map(state=>({enabled:true,state}))]) assert.deepEqual(parse(value),value);
  for(const value of [{enabled:false,state:'guest'},{enabled:true},{enabled:true,state:'available',customerId:'x'},{enabled:true,state:'approved'}])assert.throws(()=>parse(value));
});
