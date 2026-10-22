import assert from 'node:assert/strict';
import test from 'node:test';
import {compile} from '../settings/design/design-editor-test-utils.ts';

function bridge(role:string,pathname:string,allowed:boolean){
 const context={membership:{role}};let reads=0;
 const {requireServerPanelAccess}=compile<any>(new URL('../../lib/server-access.ts',import.meta.url),{
  'server-only':{},
  '@/lib/server-overview/access':{resolvePanelOverviewAccess:async(value:unknown)=>{assert.equal(value,context);reads++;return{canViewOverview:allowed};}},
  '@/lib/server-orders/access':{resolvePanelOrdersAccess:async()=>({canManageOrders:false})},
  '@/lib/server-accounting/access':{resolvePanelAccountingAccess:async()=>({canManageAccounting:false,canCollectReceivables:false})},
  './commercial-packages/route-model.ts':{commercialRouteDecision:()=>({kind:'allowed'})},
  'next/headers':{headers:async()=>new Headers({'x-celebix-panel-pathname':pathname})},
  'next/navigation':{redirect:(path:string)=>{throw Error('redirect:'+path);}},
  '@/lib/server-session':{resolveServerPanelSession:async()=>({})},
  '@/lib/server-panel-access/decision':{decideServerPanelAccess:()=>({kind:'render',session:{},tenantContext:context})},
 });
 return{requireServerPanelAccess,reads:()=>reads};
}
test('cashier Overview page authority follows the current native grant and opens no other page',async()=>{
 for(const allowed of [false,true])for(const pathname of ['/','/orders','/customers','/settings/design']){
  const value=bridge('cashier',pathname,allowed);
  if(allowed&&pathname==='/')assert.deepEqual((await value.requireServerPanelAccess()).overviewAccess,{canViewOverview:true});
  else await assert.rejects(value.requireServerPanelAccess(),/redirect:\/orders\/quick-links/);
  assert.equal(value.reads(),1);
 }
 const manager=bridge('store_owner','/',false);assert.equal((await manager.requireServerPanelAccess()).tenantContext.membership.role,'store_owner');
});
test('home page renders the granted cashier dashboard and safely redirects legacy or revoked access',async()=>{
 for(const overviewAccess of [undefined,{canViewOverview:false},{canViewOverview:true}]){
  const {default:Page}=compile<any>(new URL('../../app/(panel)/page.tsx',import.meta.url),{
   '@/components/dashboard/PanelDashboardHomeView':{PanelDashboardHomeView:()=>null},
   '@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{membership:{role:'cashier'}},overviewAccess})},
   'next/navigation':{redirect:(path:string)=>{throw Error('redirect:'+path);}},
  });
  if(overviewAccess?.canViewOverview)assert.ok(await Page());else await assert.rejects(Page(),/redirect:\/orders\/quick-links/);
 }
});

test('server shell passes only an exact Overview boolean into cashier navigation chrome',async()=>{
 for(const canViewOverview of [undefined,false,'true',true]){
  const {PanelShell}=compile<any>(new URL('./PanelShell.tsx',import.meta.url),{
   '@/lib/panel-ui/chrome-model':{createPanelChromeModel:()=>({navigationMode:'register',storeSlug:'fixture'})},
   '@/lib/server-analytics/availability':{resolvePanelAnalyticsAvailability:async()=>false},
   '@/lib/panel-store-options/default':{resolveDefaultPanelStoreOptions:async()=>undefined},
   '@/lib/server-panel-branding/default':{resolveDefaultPanelStoreBranding:async()=>null},
   './PanelLayoutClient':{PanelLayoutClient:()=>null},
   '@/components/accounting/AccountingNavigation':{AccountingNavigationProvider:()=>null},
   './SupportBanner':{SupportBanner:()=>null},
  });
  const output=await PanelShell({tenantContext:{store:{id:'fixture'},membership:{role:'cashier'}},overviewAccess:{canViewOverview},children:null});
  const model=output.props.children[1].props.model;assert.equal(model.cashierOverviewAvailable,canViewOverview===true);
 }
});
