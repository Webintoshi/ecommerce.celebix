import assert from 'node:assert/strict';
import test from 'node:test';
import {getPanelNavigation,getPanelRoutePresentation,isPanelNavigationPathActive} from './navigation.ts';

test('accounting menu reaches each financial workspace and retains legal/invoice settings',()=>{
  const accounting=getPanelNavigation({analyticsAvailable:false}).find(item=>item.key==='accounting');
  for(const href of ['/accounting','/accounting/receivables','/accounting/accounts','/accounting/expenses','/accounting/settings','/accounting/invoicing-integration']){
    assert.ok(accounting?.children?.some(item=>item.href===href),href);
    assert.ok(getPanelRoutePresentation(href).title);
  }
  assert.equal(isPanelNavigationPathActive('/accounting/receivables','/accounting'),true);
  assert.equal(getPanelNavigation({analyticsAvailable:false,navigationMode:'register'}).some(item=>item.key==='accounting'),false);
});
