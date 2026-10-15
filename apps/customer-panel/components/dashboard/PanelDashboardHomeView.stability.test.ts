import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {readFileSync} from 'node:fs';
import {compile,withEditor} from '../settings/design/design-editor-test-utils.ts';
import {createMerchantDashboardSliceLoader,createMerchantDashboardViewModel} from '../../lib/panel-ui/dashboard-model.ts';
import {readyAuthority,unavailableAuthority} from '../../lib/panel-ui/authority-slice.ts';

const now='2026-10-15T12:00:00.000Z',chrome={storeSlug:'fixture',membershipLabel:'Mağaza sahibi',planCode:'base',planVersion:1,entitlementStatus:'active' as const,locale:'tr',storefrontHostname:'fixture.example.test',analyticsAvailable:false};
const catalog={totalProducts:4,activeProducts:3,draftProducts:1,productLimit:10,activeVariants:6,outOfStockVariants:0,productsWithoutMedia:1,activeMedia:7};
const orders={totalOrders:2,pendingOrders:1,fulfilledOrders:1,revenueCents:100,currency:'TRY',asOf:now};
const carts={abandoned:1,recovered:0,lostValueCents:10,recoveredValueCents:0,currency:'TRY',asOf:now};
const customers={active:1,archived:0,consentedEmail:1,totalSpentCents:100,currency:'TRY',asOf:now};
const analytics=(period='month',revenueCents=125000)=>({period,rangeStart:'2026-10-01T00:00:00.000Z',rangeEnd:now,generatedAt:now,currency:'TRY',revenueCents,orders:{total:12,paid:10,cancelled:1,refunded:1},customers:{total:30,newInPeriod:4},catalog:{activeProducts:8,lowStockVariants:2},series:[{startsAt:'2026-10-01T00:00:00.000Z',orders:2,revenueCents:20000}],topProducts:[{productId:'11111111-1111-4111-8111-111111111111',title:'Fixture product',quantity:5,revenueCents:50000}]});
const recent=[{id:'11111111-1111-4111-8111-111111111111',orderNumber:'ORDER-1',customerName:'Ada',itemCount:1,totalCents:100,currency:'TRY',status:'pending',paymentStatus:'pending',createdAt:now}];
const dashboard=(value:any=analytics())=>createMerchantDashboardViewModel(chrome,readyAuthority(catalog,now),readyAuthority(orders,now),readyAuthority(carts,now),readyAuthority(customers,now),value?readyAuthority(value,now):unavailableAuthority(true));
const base={dashboard:dashboard(),state:'loaded',ordersState:'loaded',cartsState:'loaded',customersState:'loaded',analyticsState:'loaded',recentOrdersState:'loaded',recentOrdersResolved:true,recentOrders:recent,onRefresh(){},period:'month',activeVisitorsEnabled:false};
function deferred(){let resolve!:(value:any)=>void,reject!:(error:unknown)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function components(overrides:Record<string,unknown>={}){return compile<any>(new URL('./PanelDashboardHomeView.tsx',import.meta.url),{
 'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},
 '@/components/panel/PanelPageShell':{PanelPageShell:({children}:any)=>React.createElement('div',null,children),PanelActionButton:({children,...props}:any)=>React.createElement('a',props,children)},
 '@/components/panel/PanelLayoutClient':{usePanelChromeModel:()=>chrome},
 '@/components/panel/PanelTopbarChrome':{PanelTopbarBridge:({actions,context}:any)=>React.createElement('div',null,context,actions)},
 '@/components/shared/ProductThumbnail':{ProductThumbnail:()=>React.createElement('span')},
 '@/lib/panel-ui/dashboard-model':{createMerchantDashboardSliceLoader,createMerchantDashboardViewModel},
 '@/lib/catalog-ui/client':{catalogApi:{getDashboardSummary:async()=>catalog}},
 '@/lib/order-ui/client':{orderApi:{getDashboardSummary:async()=>orders,listOrders:async()=>({items:recent})}},
 '@/lib/abandoned-cart-ui/client':{abandonedCartApi:{getSummary:async()=>carts}},
 '@/lib/customer-ui/client':{customerApi:{summary:async()=>customers}},
 '@/lib/analytics-ui/client':{analyticsApi:{dashboard:async()=>analytics()},createAnalyticsBrowserApi:()=>({})},
 '@/lib/analytics-ui/active-visitors':{createActiveVisitorPoller(){throw Error('no_new_polling');}},...overrides,
});}
test('same-period refresh keeps ready chart, product and order DOM while errors hide retained analytics',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 await withEditor(async({container,render})=>{
  await render(React.createElement(Presentation,base));const chart=container.querySelector('[data-dashboard-chart]'),row=container.querySelector('tbody tr');assert.ok(chart);assert.ok(row);
  await render(React.createElement(Presentation,{...base,analyticsState:'loading',ordersState:'loading',recentOrdersState:'loading'}));
  assert.ok(container.querySelector('[data-dashboard-chart]')===chart,'resolved chart DOM is retained');assert.ok(container.querySelector('tbody tr')===row,'resolved order row DOM is retained');assert.match(container.textContent!,/Fixture product/);assert.match(container.textContent!,/ORDER-1/);assert.equal(container.querySelector('.salesCard')?.getAttribute('aria-busy'),'true');
  await render(React.createElement(Presentation,{...base,dashboard:dashboard(null),analyticsState:'error'}));assert.equal(container.querySelector('[data-dashboard-chart]'),null);assert.equal(container.textContent!.includes('Fixture product'),false);assert.match(container.textContent!,/Satış verisi alınamıyor/);
 });
});
test('changing periods hides old results and ignores a delayed older period response',async()=>{
 const pending:{period:string;response:ReturnType<typeof deferred>}[]=[];
 const{PanelDashboardHomeView:Home}=components({'@/lib/analytics-ui/client':{analyticsApi:{dashboard:(period:string)=>{const response=deferred();pending.push({period,response});return response.promise;}},createAnalyticsBrowserApi:()=>({})}});
 await withEditor(async({container,render,change})=>{
  await render(React.createElement(Home));assert.equal(pending[0].period,'month');await React.act(async()=>pending[0].response.resolve(analytics()));assert.ok(container.querySelector('[data-dashboard-chart]'));
  const select=container.querySelector<HTMLSelectElement>('select[aria-label="Dönem"]')!;await change(select,'week');assert.equal(container.querySelector('[data-dashboard-chart]'),null);assert.equal(container.textContent!.includes('Fixture product'),false);assert.equal(pending[1].period,'week');await change(select,'year');assert.equal(pending[2].period,'year');
  await React.act(async()=>pending[2].response.resolve(analytics('year',900000)));assert.ok(container.querySelector('[data-dashboard-chart]'));await React.act(async()=>pending[1].response.resolve(analytics('week',100)));assert.equal(container.querySelector('select')?.value,'year');assert.match(container.querySelector('.salesCard')!.textContent!,/9[.,]000/);
 });
});
test('deferred background slice refresh preserves resolved content and an analytics failure stays explicit',async()=>{
 const pending:ReturnType<typeof deferred>[]=[],cart=deferred();
 const{PanelDashboardHomeView:Home}=components({'@/lib/abandoned-cart-ui/client':{abandonedCartApi:{getSummary:()=>cart.promise}},'@/lib/analytics-ui/client':{analyticsApi:{dashboard:()=>{const response=deferred();pending.push(response);return response.promise;}},createAnalyticsBrowserApi:()=>({})}});
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Home));await React.act(async()=>{pending[0].resolve(analytics());cart.reject(Error('unavailable'));});const chart=container.querySelector('[data-dashboard-chart]');assert.ok(chart);
  await click(Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Tekrar dene')!);assert.equal(pending.length,2);assert.ok(container.querySelector('[data-dashboard-chart]')===chart,'resolved chart DOM is retained');await React.act(async()=>pending[1].reject(Error('authority_unavailable')));assert.equal(container.querySelector('[data-dashboard-chart]'),null);assert.match(container.textContent!,/Satış verisi alınamıyor/);
 });
});
test('loading and resolved-empty views keep shared data body slots and a reserved insight status area',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 await withEditor(async({container,render})=>{
  const expected=['recent-orders','order-status','sales-chart','tasks','top-products'];
  await render(React.createElement(Presentation,{...base,dashboard:dashboard(null),analyticsState:'loading',recentOrdersState:'loading',ordersState:'loading',recentOrders:[],recentOrdersResolved:false}));
  for(const slot of expected)assert.ok(container.querySelector(`[data-dashboard-body="${slot}"]`),slot);
  await render(React.createElement(Presentation,{...base,recentOrders:[],recentOrdersResolved:true}));for(const slot of expected)assert.ok(container.querySelector(`[data-dashboard-body="${slot}"]`),slot);assert.ok(container.querySelector('[data-dashboard-insight-status]'));
 });
 const css=readFileSync(new URL('./panel-dashboard.module.css',import.meta.url),'utf8');assert.match(css,/\.recentOrdersBody\s*\{[^}]*min-height:\s*336px/);assert.match(css,/\.orderStatusContent\s*\{[^}]*min-height:\s*233px/);assert.match(css,/\.taskBody\s*\{[^}]*min-height:\s*288px/);assert.match(css,/\.topProductsBody\s*\{[^}]*min-height:\s*280px/);assert.match(css,/\.recentOrdersTable\s*\{[^}]*min-width:\s*0/);assert.match(css,/\.salesChart\s*\{[^}]*min-height:\s*376px/);assert.doesNotMatch(css,/\.recentOrdersBody\s*\{[^}]*(?:max-height|overflow:\s*hidden)/);
});

test('a successfully resolved empty recent list survives refresh but never an error',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 await withEditor(async({container,render})=>{
  await render(React.createElement(Presentation,{...base,recentOrders:[]}));const empty=container.querySelector('[data-dashboard-body="recent-orders"] strong');assert.equal(empty?.textContent,'Henüz sipariş bulunmuyor.');assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'true');
  await render(React.createElement(Presentation,{...base,recentOrders:[],recentOrdersState:'loading',recentOrdersResolved:true}));assert.ok(container.querySelector('[data-dashboard-body="recent-orders"] strong')===empty);assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'true');assert.equal(container.querySelector('.recentOrders')?.getAttribute('aria-busy'),'true');
  await render(React.createElement(Presentation,{...base,recentOrdersState:'error',recentOrdersResolved:false}));assert.equal(container.querySelector('[data-dashboard-body="recent-orders"] tbody'),null);assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'false');assert.match(container.querySelector('[data-dashboard-body="recent-orders"]')!.textContent!,/şu anda kullanılamıyor/);
 });
});
