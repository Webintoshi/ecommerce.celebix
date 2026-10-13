import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';
const {getPanelNavigation}=compile<any>(new URL('../../lib/panel-ui/navigation.ts',import.meta.url));
const model={storeSlug:'fixture',membershipLabel:'Mağaza sahibi',planCode:'base',planVersion:1,entitlementStatus:'active',locale:'tr'};
test('server derives staff navigation from actual role and excludes support even when public label says owner',async()=>{
 for(const role of ['store_owner','admin','editor','analyst','cashier'])for(const support of [false,true]){
  let actual:any;
  const {PanelShell}=compile<any>(new URL('./PanelShell.tsx',import.meta.url),{
   '@/lib/panel-ui/chrome-model':{createPanelChromeModel:()=>model},
   '@/lib/server-analytics/availability':{resolvePanelAnalyticsAvailability:async()=>false},
   '@/lib/panel-store-options/default':{resolveDefaultPanelStoreOptions:async()=>[]},
   '@/lib/server-panel-branding/default':{resolveDefaultPanelStoreBranding:async()=>null},
   './PanelLayoutClient':{PanelLayoutClient:({model}:any)=>{actual=model;return null;}},
   './SupportBanner':{SupportBanner:()=>null},
  });
  renderToStaticMarkup(await PanelShell({tenantContext:{membership:{role},store:{id:'fixture'}},support:support?{}:undefined,children:null}));
  assert.equal(actual.staffManagementAvailable,role==='store_owner'&&!support);
 }
});
test('desktop drawer and navigation search expose staff only with server availability',async()=>{
 const {PanelNavigation}=compile<any>(new URL('./PanelNavigation.tsx',import.meta.url),{
  '@/lib/panel-ui/navigation':compile(new URL('../../lib/panel-ui/navigation.ts',import.meta.url)),
  'next/navigation':{usePathname:()=>'/settings/administrators'},
  'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},
 });
 for(const mode of ['desktop','drawer'])for(const available of [false,true])await withEditor(async({container,render,change})=>{
  await render(React.createElement(PanelNavigation,{mode,staffManagementAvailable:available}));
  assert.equal(Boolean(container.querySelector('a[href="/settings/administrators"]')),available);
  const search=container.querySelector<HTMLInputElement>('input')!;
  await change(search,'personel');
  assert.equal(Boolean(container.querySelector('a[href="/settings/administrators"]')),available);
 });
});
