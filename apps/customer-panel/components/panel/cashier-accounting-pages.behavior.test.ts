import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { compile } from '../settings/design/design-editor-test-utils.ts';
import { getPanelNavigation } from '../../lib/panel-ui/navigation.ts';
const Placeholder=()=>null;
function access(role:string,full:boolean){const plan=COMMERCIAL_PACKAGES[3];return{tenantContext:{store:{id:'11111111-1111-4111-8111-111111111111'},membership:{id:'22222222-2222-4222-8222-222222222222',role},entitlements:{schemaVersion:1,planId:plan.id,planCode:plan.code,version:plan.version,status:'active',features:plan.features,limits:plan.limits,validFrom:'2026-01-01T00:00:00Z'}},accountingAccess:{canManageAccounting:full,canCollectReceivables:false}};}
const components={'@/components/accounting/AccountingConsole':{AccountingConsole:Placeholder},'@/components/accounting/ProfitabilityConsole':{ProfitabilityConsole:Placeholder},'@/components/accounting/SupplierDebtsConsole':{SupplierDebtsConsole:Placeholder},'@/components/accounting/CashSessionsConsole':{CashSessionsConsole:Placeholder},'@/components/accounting/AccountingNavigation':{AccountingNavigation:Placeholder},'@/components/merchant-admin/MerchantModuleConsole':{MerchantModuleConsole:Placeholder},'@/components/merchant-admin/MerchantRecordEditor':{MerchantRecordEditor:Placeholder},'@/components/content/MerchantContentEditor':{MerchantContentEditor:Placeholder},'@/lib/server-content-resource-authoring/locale':{resolveInitialContentLocale:async()=>'tr'},'@/lib/server-content-resource-authoring/runtime':{contentResourceAuthoringEnabled:()=>false,contentResearchEnabled:()=>false}};
function operationalElement(node:any):any{if(node?.props&&('canManage'in node.props||'canRead'in node.props))return node;return React.Children.toArray(node?.props?.children).map(operationalElement).find(Boolean);}
test('all eleven accounting pages delegate full permissions only to the DB-approved cashier and preserve existing owner/admin roles',async()=>{
 const paths=['accounting','accounting/accounts','accounting/expenses','accounting/receivables','accounting/profitability','accounting/suppliers','accounting/cash-sessions','accounting/settings','accounting/invoicing-integration','accounting/invoicing-integration/new','accounting/invoicing-integration/[recordId]/edit'];
 for(const role of ['cashier','admin','store_owner','editor'])for(const full of [false,true])for(const path of paths){
  const Page=compile<any>(new URL(`../../app/(panel)/${path}/page.tsx`,import.meta.url),{...components,'@/lib/server-access':{requireServerPanelAccess:async()=>access(role,full)}}).default;
  const view=await Page({params:Promise.resolve({recordId:'33333333-3333-4333-8333-333333333333'}),searchParams:Promise.resolve({})});const operational=operationalElement(view);assert.ok(operational,path);
  assert.equal(operational.props.canRead??operational.props.canManage,role==='admin'||role==='store_owner'||role==='cashier'&&full,`${role}/${full}/${path}`);
 }
});
test('full accounting adds the existing accounting menu while ecommerce stays hidden and the limited menu remains unchanged by default',()=>{
 for(const full of [false,true]){
  const nav=getPanelNavigation({analyticsAvailable:true,navigationMode:'register',cashierAccountingAvailable:full});const entries=nav.flatMap(item=>[item,...item.children??[]]);
  for(const path of ['/accounting','/accounting/accounts','/accounting/suppliers','/accounting/settings','/accounting/invoicing-integration'])assert.equal(entries.some(item=>item.href===path),full,path);
  assert.equal(entries.some(item=>item.href==='/accounting/receivables'),true);
  for(const path of ['/orders','/settings/design','/customers','/marketplaces','/marketing','/discounts','/settings/administrators'])assert.equal(entries.some(item=>item.href===path),false,path);
 }
});
test('generic record renderer does not promote an accounting-approved cashier to other integration or settings editors',async()=>{
 for(const kind of ['invoice_integration','accounting_profile','marketplace_connection','payment_setting','general_setting']){
  const {renderMerchantRecordPage}=compile<any>(new URL('../merchant-admin/render-merchant-record-page.tsx',import.meta.url),{...components,'@/lib/server-access':{requireServerPanelAccess:async()=>access('cashier',true)}});
  const view=await renderMerchantRecordPage({kind,permission:'integrations.manage',returnTo:'/'});assert.equal(view.props.canManage,['invoice_integration','accounting_profile'].includes(kind),kind);
 }
});
