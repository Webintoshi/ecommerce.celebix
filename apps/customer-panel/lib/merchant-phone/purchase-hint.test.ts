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
