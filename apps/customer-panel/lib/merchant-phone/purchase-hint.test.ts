import assert from 'node:assert/strict';
import test from 'node:test';
import { merchantPurchaseHintFromPage, merchantPurchaseHintFromSearch, merchantPurchaseSearch, merchantPurchaseDestination } from './purchase-hint.ts';

test('the only purchase hint names one SKU and carries no checkout authority', () => {
  assert.equal(merchantPurchaseHintFromPage(undefined), undefined);
  assert.equal(merchantPurchaseHintFromPage({}), undefined);
  assert.equal(merchantPurchaseHintFromPage({purchase: 'toshi-test-1'}), 'toshi-test-1');
  assert.equal(merchantPurchaseHintFromSearch(''), undefined);
  assert.equal(merchantPurchaseHintFromSearch('?purchase=toshi-test-1'), 'toshi-test-1');
  assert.equal(merchantPurchaseSearch(undefined), '');
  assert.equal(merchantPurchaseSearch('toshi-test-1'), '?purchase=toshi-test-1');
  assert.equal(merchantPurchaseDestination(undefined), '/');
  assert.equal(merchantPurchaseDestination('toshi-test-1'), '/settings/artificial-intelligence?purchase=toshi-test-1');
});

test('unknown duplicate and extra navigation fields never become a purchase hint', () => {
  for (const query of [
    {purchase: 'toshi-500'}, {purchase: ['toshi-test-1', 'toshi-test-1']},
    {purchase: 'toshi-test-1', returnTo: 'https://evil.example'},
    {purchase: 'toshi-test-1', storeId: 'forged'}, {purchase: 'toshi-test-1', total: '1'},
  ]) assert.equal(merchantPurchaseHintFromPage(query), undefined);
  for (const search of [
    '?purchase=toshi-500', '?purchase=toshi-test-1&purchase=toshi-test-1',
    '?purchase=toshi-test-1&returnTo=https://evil.example', '?returnTo=/settings/artificial-intelligence',
    '?purchase=toshi-test-1&storeId=forged', '?purchase=toshi-test-1&total=1',
    '?purchase=%74oshi-test-1', '?purchase=toshi-test-1#fragment',
  ]) assert.throws(() => merchantPurchaseHintFromSearch(search));
  assert.throws(() => merchantPurchaseSearch('https://evil.example' as never));
});

test('all six paid package intents round-trip without amounts or arbitrary redirect targets', () => {
 for(const purchase of ['starter','growth','professional']) for(const term of ['monthly','annual']){
  const search='?'+new URLSearchParams({purchase,term}).toString();
  const hint=merchantPurchaseHintFromPage({purchase,term});
  assert.ok(hint);
  assert.equal(merchantPurchaseHintFromSearch(search),hint);
  assert.equal(merchantPurchaseSearch(hint),search);
  assert.equal(merchantPurchaseDestination(hint),'/settings/plan'+search+'#plan-checkout');
 }
 for(const query of [{purchase:'free_starter',term:'annual'},{purchase:'growth',term:'once'},{purchase:'growth',term:['monthly','annual']},{purchase:'growth',term:'annual',amount:'1'}]){
  assert.equal(merchantPurchaseHintFromPage(query),undefined);
 }
 for(const search of ['?purchase=growth','?purchase=growth&term=annual&term=monthly','?purchase=professional&term=monthly&returnTo=https://example.com']){
  assert.throws(()=>merchantPurchaseHintFromSearch(search));
 }
});
