import assert from 'node:assert/strict';
import test from 'node:test';
import { isCashierPanelPathAllowed } from './cashier-access.ts';

test('cashiers can reach sales, analytics, product editing and their own security settings', () => {
  for (const path of ['/', '/orders/quick-links', '/analytics', '/products', '/products/new', '/products/11111111-1111-4111-8111-111111111111', '/accounting/receivables', '/settings/security']) {
    assert.equal(isCashierPanelPathAllowed(path), true, path);
  }
});

test('cashier page access denies ecommerce and near matches even when the sidebar is bypassed', () => {
  for (const path of [null, '', '/orders', '/orders/payment-links', '/orders/quick-links/evil', '/products/reviews', '/products/collections', '/products/auto-import', '/products/stock', '/products-evil', '/products/%2fsettings', '/products/new/../reviews', '/analytics/settings', '/customers', '/accounting', '/settings', '/settings/administrators', '/settings/design', '/marketing', '/discounts', '/content', '/marketplaces', '/seo', '/toshi']) {
    assert.equal(isCashierPanelPathAllowed(path), false, String(path));
  }
});
