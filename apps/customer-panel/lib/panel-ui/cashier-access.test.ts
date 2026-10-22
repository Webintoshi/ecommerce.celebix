import assert from 'node:assert/strict';
import test from 'node:test';
import { isCashierPanelPathAllowed } from './cashier-access.ts';
test('orders grant admits only list, UUID detail and print routes',()=>{
 const id='25900000-0000-4000-8000-000000000001';
 for(const path of ['/orders',`/orders/${id}`,`/orders/${id}/print`]){assert.equal(isCashierPanelPathAllowed(path,false,true),true,path);assert.equal(isCashierPanelPathAllowed(path,false,false),false,path);}
 for(const path of ['/orders/payment-links','/orders/drafts','/orders/abandoned-carts','/orders/evil','/orders/../settings',`/orders/${id}/edit`,`/orders/${id}/print/evil`,'/orders?canManageOrders=true'])assert.equal(isCashierPanelPathAllowed(path,false,true),false,path);
});

test('cashiers can reach sales, analytics, product editing and their own security settings', () => {
  for (const path of ['/orders/quick-links', '/analytics', '/products', '/products/new', '/products/11111111-1111-4111-8111-111111111111', '/accounting/receivables', '/settings/security']) {
    assert.equal(isCashierPanelPathAllowed(path), true, path);
  }
});

test('Overview is denied by default and its grant opens only the exact root route',()=>{
 assert.equal(isCashierPanelPathAllowed('/'),false);
 assert.equal(isCashierPanelPathAllowed('/',true,true,false),false);
 assert.equal(isCashierPanelPathAllowed('/',false,false,true),true);
 for(const path of ['/customers','/orders','/orders/payment-links','/settings/design','/marketing','/overview','//','/?canViewOverview=true'])assert.equal(isCashierPanelPathAllowed(path,false,false,true),false,path);
});

test('cashier page access denies ecommerce and near matches even when the sidebar is bypassed', () => {
  for (const path of [null, '', '/orders', '/orders/payment-links', '/orders/quick-links/evil', '/products/reviews', '/products/collections', '/products/auto-import', '/products/stock', '/products-evil', '/products/%2fsettings', '/products/new/../reviews', '/analytics/settings', '/customers', '/accounting', '/settings', '/settings/administrators', '/settings/design', '/marketing', '/discounts', '/content', '/marketplaces', '/seo', '/toshi']) {
    assert.equal(isCashierPanelPathAllowed(path), false, String(path));
  }
});

test('trusted full accounting access opens the whole accounting family without exposing ecommerce or lookalike paths',()=>{
 for(const path of ['/accounting','/accounting/accounts','/accounting/expenses','/accounting/suppliers','/accounting/profitability','/accounting/cash-sessions','/accounting/settings','/accounting/invoicing-integration','/accounting/invoicing-integration/new','/accounting/invoicing-integration/11111111-1111-4111-8111-111111111111/edit']){
  assert.equal(isCashierPanelPathAllowed(path,true),true,path);assert.equal(isCashierPanelPathAllowed(path,false),false,path);
 }
 for(const path of ['/accounting-evil','/accounting/../settings','/accounting/%2e%2e/settings','/accounting//accounts','/accounting?x=1','/orders','/settings/design','/marketing','/marketplaces'])assert.equal(isCashierPanelPathAllowed(path,true),false,path);
});
