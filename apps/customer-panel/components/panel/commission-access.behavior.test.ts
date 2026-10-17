import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import{renderToStaticMarkup}from'react-dom/server';
import{compile}from'../settings/design/design-editor-test-utils.ts';
import{getPanelNavigation,getPanelRoutePresentation}from'../../lib/panel-ui/navigation.ts';
import{isCashierPanelPathAllowed}from'../../lib/panel-ui/cashier-access.ts';

test('commission page is manager-only even when a cashier has full accounting access',async()=>{
 for(const role of['store_owner','admin','cashier','editor','analyst'])for(const full of[false,true]){
  const {default:Page}=compile<any>(new URL('../../app/(panel)/accounting/commissions/page.tsx',import.meta.url),{'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{store:{id:'store'},membership:{id:'member',role}},accountingAccess:{canManageAccounting:full}})},'@/components/accounting/CommissionConsole':{CommissionConsole:()=>null}});
  const view=await Page();assert.equal(view.props.canRead,role==='store_owner'||role==='admin');
 }
 for(const full of[false,true])for(const path of['/accounting/commissions','/accounting/commissions/','/accounting/commissions/private'])assert.equal(isCashierPanelPathAllowed(path,full),false);
});
test('manager commission menu and heading exist while default and register modes exclude payroll',()=>{
 for(const available of[false,true]){
  const entries=getPanelNavigation({analyticsAvailable:true,accountingCommissionsAvailable:available}).flatMap(item=>[item,...item.children??[]]);assert.equal(entries.some(item=>item.href==='/accounting/commissions'),available);
  const cashier=getPanelNavigation({analyticsAvailable:true,navigationMode:'register',cashierAccountingAvailable:true,accountingCommissionsAvailable:available}).flatMap(item=>[item,...item.children??[]]);assert.equal(cashier.some(item=>item.href==='/accounting/commissions'),false);
 }
 assert.equal(getPanelRoutePresentation('/accounting/commissions').title,'Primler');
});
test('accounting tabs render commission only from the server-derived manager presentation context',()=>{
 const{AccountingNavigation,AccountingNavigationProvider}=compile<any>(new URL('../accounting/AccountingNavigation.tsx',import.meta.url),{'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)}});
 for(const available of[false,true]){
  const html=renderToStaticMarkup(React.createElement(AccountingNavigationProvider,{commissionsAvailable:available},React.createElement(AccountingNavigation,{active:'overview'})));assert.equal(html.includes('/accounting/commissions'),available);
 }
});
