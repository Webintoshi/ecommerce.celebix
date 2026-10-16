import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compile,source} from '../../lib/mira-final-test-support.ts';
import {getPanelNavigation,getPanelRoutePresentation} from '../../lib/panel-ui/navigation.ts';

test('profitability page keeps owner and admin report authority scoped to their store',async()=>{
 const path='app/(panel)/accounting/profitability/page.tsx';
 assert.ok(existsSync(new URL('../../'+path,import.meta.url)),'dedicated read-only profitability page exists');
 for(const role of['store_owner','admin','cashier','editor']){
  let got:any;
  const Page=compile(path,{'@/components/accounting/ProfitabilityConsole':{ProfitabilityConsole:(props:any)=>{got=props;return createElement('div')}},'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{store:{id:'store'},membership:{id:'actor',role}}})}}).default;
  renderToStaticMarkup(await Page());
  assert.equal(got.canRead,role==='store_owner'||role==='admin');
  assert.equal(got.scopeKey,'store:actor');
 }
});

test('profitability report is discoverable across shared accounting pages and keeps cashier isolation',()=>{
 const group=getPanelNavigation({analyticsAvailable:false}).find(item=>item.key==='accounting');
 assert.equal(group?.children?.find(item=>item.href==='/accounting/profitability')?.label,'Gelir ve kâr');
 assert.equal(getPanelRoutePresentation('/accounting/profitability').title,'Gelir ve kâr');
 assert.equal(getPanelNavigation({analyticsAvailable:false,navigationMode:'register'}).some(item=>item.href==='/accounting/profitability'),false);
 const Navigation=compile('components/accounting/AccountingNavigation.tsx').AccountingNavigation;
 const html=renderToStaticMarkup(createElement(Navigation,{active:'profitability'}));
 assert.match(html,/href="\/accounting\/profitability"[^>]*aria-current="page"/u);
 for(const href of['/accounting','/accounting/receivables','/accounting/accounts','/accounting/cash-sessions','/accounting/suppliers','/accounting/expenses','/accounting/settings'])assert.ok(html.includes(`href="${href}"`),href);
 for(const path of['components/accounting/AccountingConsole.tsx','components/accounting/SupplierDebtsConsole.tsx','components/accounting/CashSessionsConsole.tsx','app/(panel)/accounting/settings/page.tsx'])assert.match(source(path),/<AccountingNavigation\b|href="\/accounting\/profitability"/u,path);
});
