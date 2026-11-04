import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';

function navigation(pathname:string){return compile<any>(new URL('./PanelNavigation.tsx',import.meta.url),{
  'next/navigation':{usePathname:()=>pathname},
  'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},
}).PanelNavigation;}

test('the server scopes the pilot to the trusted tenant slug and emits no rollout list',async()=>{
  const old=process.env.CELEBIX_PANEL_COMMERCE_NAV_STORES;
  try{
    process.env.CELEBIX_PANEL_COMMERCE_NAV_STORES='pilot-store';
    for(const slug of ['pilot-store','other-store',undefined]){
      let actual:any;
      const {PanelShell}=compile<any>(new URL('./PanelShell.tsx',import.meta.url),{
        '@/lib/panel-ui/chrome-model':{createPanelChromeModel:()=>({storeSlug:'pilot-store'})},
        '@/lib/server-analytics/availability':{resolvePanelAnalyticsAvailability:async()=>false},
        '@/lib/panel-store-options/default':{resolveDefaultPanelStoreOptions:async()=>[]},
        '@/lib/server-panel-branding/default':{resolveDefaultPanelStoreBranding:async()=>null},
        './PanelLayoutClient':{PanelLayoutClient:({model}:any)=>{actual=model;return null;}},
        '@/components/accounting/AccountingNavigation':{AccountingNavigationProvider:({children}:any)=>children},
        './SupportBanner':{SupportBanner:()=>null},
      });
      renderToStaticMarkup(await PanelShell({tenantContext:{store:{id:'fixture',slug},membership:{role:'store_owner'}},children:null}));
      assert.equal(actual.commerceNavigationAvailable===true,slug==='pilot-store');
      assert.doesNotMatch(JSON.stringify(actual),/CELEBIX_PANEL_COMMERCE_NAV_STORES/);
    }
  }finally{if(old===undefined)delete process.env.CELEBIX_PANEL_COMMERCE_NAV_STORES;else process.env.CELEBIX_PANEL_COMMERCE_NAV_STORES=old;}
});

test('desktop and drawer render the scoped grouping, preserve all destinations and locks, and search nested tasks',async()=>{
  const Component=navigation('/products/brands');
  for(const mode of ['desktop','drawer'])await withEditor(async({container,render,change})=>{
    await render(React.createElement(Component,{mode,commerceNavigationAvailable:true,staffManagementAvailable:false,lockedNavigationHrefs:['/orders/quick-links','/products/price-lists']}));
    assert.match(container.textContent||'',/F-Ticaret/);assert.match(container.textContent||'',/E-Ticaret/);
    assert.ok(container.querySelector('.navigationQuickSale a[href="/orders/quick-links"]'));
    assert.ok(container.querySelector('.navigationQuickSale .navigationLock'));
    assert.equal(container.querySelector('a[href="/settings/administrators"]'),null);
    assert.ok(container.querySelector('a[href="/products/new"]'));
    const current=container.querySelector('a[href="/products/brands"][aria-current="page"]');assert.ok(current);
    for(let parent=current.parentElement;parent&&parent!==container;parent=parent.parentElement)assert.equal(parent.hidden,false,'active route ancestors must be open');
    assert.ok(container.querySelector('a[href="/products/price-lists"] .navigationLock'));
    await change(container.querySelector('input')!,'ağırlık');
    assert.ok(container.querySelector('a[href="/products/attributes"]'));
    await change(container.querySelector('input')!,'personel');
    assert.equal(container.querySelector('a[href="/settings/administrators"]'),null);
  });
});

test('flag-off and cashier views preserve the existing menu and never gain a pilot section',async()=>{
  const Component=navigation('/products');
  for(const props of [{commerceNavigationAvailable:false},{commerceNavigationAvailable:true,navigationMode:'register',cashierOrdersAvailable:false}])await withEditor(async({container,render})=>{
    await render(React.createElement(Component,{mode:'desktop',...props}));
    assert.doesNotMatch(container.textContent||'',/F-Ticaret|E-Ticaret/);
    assert.equal(container.querySelector('.navigationQuickSale'),null);
    if(props.navigationMode)assert.equal(container.querySelector('a[href="/products/price-lists"]'),null);
  });
});

test('moved routes open only their actual menu ancestors rather than former path-prefix groups',async()=>{
  for(const [pathname,openId,closedId] of [
    ['/products/price-lists','inventory-pricing','catalog'],
    ['/settings/design','website','settings'],
    ['/products/attributes','catalog-features','catalog-list'],
  ])await withEditor(async({container,render})=>{
    const Component=navigation(pathname);
    await render(React.createElement(Component,{mode:'desktop',commerceNavigationAvailable:true}));
    assert.equal(container.querySelector<HTMLElement>(`#panel-commerce-nav-${openId}-desktop`)?.hidden,false);
    assert.equal(container.querySelector<HTMLElement>(`#panel-commerce-nav-${closedId}-desktop`)?.hidden,true);
  });
});
