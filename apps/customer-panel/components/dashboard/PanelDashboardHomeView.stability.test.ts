import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
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
 '@/lib/overview-ui/client':{overviewApi:{dashboard:async()=>analytics()}},
 '@/lib/analytics-ui/active-visitors':{createActiveVisitorPoller(){throw Error('no_new_polling');}},...overrides,
});}
test('overview keeps conversion secondary and task rows navigate without a duplicate media spotlight',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 await withEditor(async({container,render})=>{
  await render(React.createElement(Presentation,base));
  assert.equal(container.querySelectorAll('[data-metric="sales"]').length,1);
  assert.equal(container.querySelector('.salesCard [data-metric="conversion"]'),null);
  assert.ok(container.querySelector('details [data-metric="conversion"]'));
  assert.equal(container.querySelector('[aria-label="Öncelikli mağaza işi"]'),null);
  const tasks=container.querySelectorAll('.attentionList li');assert.ok(tasks.length>0);
  for(const task of tasks){const link=task.querySelector('a[href]');assert.ok(link);assert.ok(link!.querySelector('strong'));assert.ok(link!.getAttribute('aria-label'));}
  assert.ok(container.querySelector('a[href="/products/new"]'));
  assert.ok(container.querySelector('a[href="/orders/quick-links"]'));
 });
});
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
 await withEditor(async({container,render,click})=>{
  const expected=['recent-orders','order-status','sales-chart','tasks','top-products'];
  await render(React.createElement(Presentation,{...base,dashboard:dashboard(null),analyticsState:'loading',recentOrdersState:'loading',ordersState:'loading',recentOrders:[],recentOrdersResolved:false}));
  for(const slot of expected)assert.ok(container.querySelector(`[data-dashboard-body="${slot}"]`),slot);
  await render(React.createElement(Presentation,{...base,recentOrders:[],recentOrdersResolved:true}));for(const slot of expected)assert.ok(container.querySelector(`[data-dashboard-body="${slot}"]`),slot);assert.ok(container.querySelector('[data-dashboard-insight-status]'));
  const extra=container.querySelector<HTMLDetailsElement>('details.secondaryDetails')!;assert.ok(extra,'extra information has an accessible native disclosure');assert.equal(extra.open,false);await click(extra.querySelector('summary')!);assert.equal(extra.open,true);assert.ok(extra.querySelector('[data-dashboard-body="order-status"]'));assert.ok(extra.querySelector('#customer-view-title'));
 });
});

test('a successfully resolved empty recent list survives refresh but never an error',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 await withEditor(async({container,render})=>{
  await render(React.createElement(Presentation,{...base,recentOrders:[]}));const empty=container.querySelector('[data-dashboard-body="recent-orders"] strong');assert.equal(empty?.textContent,'Henüz sipariş bulunmuyor.');assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'true');
  await render(React.createElement(Presentation,{...base,recentOrders:[],recentOrdersState:'loading',recentOrdersResolved:true}));assert.ok(container.querySelector('[data-dashboard-body="recent-orders"] strong')===empty);assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'true');assert.equal(container.querySelector('.recentOrders')?.getAttribute('aria-busy'),'true');
  await render(React.createElement(Presentation,{...base,recentOrdersState:'error',recentOrdersResolved:false}));assert.equal(container.querySelector('[data-dashboard-body="recent-orders"] tbody'),null);assert.equal(container.querySelector('[data-dashboard-body="recent-orders"]')?.getAttribute('data-empty'),'false');assert.match(container.querySelector('[data-dashboard-body="recent-orders"]')!.textContent!,/şu anda kullanılamıyor/);
 });
});

test('recent orders use current customer identity after profile edits and preserve legacy snapshot fallback',async()=>{
 const{PanelDashboardPresentation:Presentation}=components();
 const snapshot=Object.freeze({...recent[0],customerName:'Eski Müşteri',customerEmail:'old@example.test'});
 const currentCustomer=Object.freeze({id:'22222222-2222-4222-8222-222222222222',name:'Deniz Yeni',email:null,phone:null,archived:false});
 await withEditor(async({container,render})=>{
  const cell=()=>container.querySelector('[data-dashboard-body="recent-orders"] td[data-label="Müşteri"]')!;
  await render(React.createElement(Presentation,{...base,recentOrders:[{...snapshot,currentCustomer}]}));
  assert.match(cell().textContent!,/Deniz Yeni$/);
  assert.equal(cell().querySelector('[aria-hidden="true"]')?.textContent,'D');
  assert.doesNotMatch(cell().textContent!,/Eski Müşteri|old@example\.test/);
  await render(React.createElement(Presentation,{...base,recentOrders:[{...snapshot,currentCustomer:{...currentCustomer,name:'Ayşe Güncel'}}]}));
  assert.match(cell().textContent!,/Ayşe Güncel$/);
  assert.equal(cell().querySelector('[aria-hidden="true"]')?.textContent,'A');
  assert.doesNotMatch(cell().textContent!,/Deniz Yeni|Eski Müşteri/);
  for(const order of [snapshot,{...snapshot,currentCustomer:null}]){
   await render(React.createElement(Presentation,{...base,recentOrders:[order]}));
   assert.match(cell().textContent!,/Eski Müşteri$/);
   assert.equal(cell().querySelector('[aria-hidden="true"]')?.textContent,'E');
  }
  assert.equal(snapshot.customerName,'Eski Müşteri');
 });
});

test('cashier Overview skips forbidden reads and links while its independent Orders grant controls operational rows',async()=>{
 for(const allowed of [false,true]){
  const calls:string[]=[],cashierChrome={...chrome,navigationMode:'register',cashierOverviewAvailable:true,cashierOrdersAvailable:allowed,storefrontHostname:undefined};
  const{PanelDashboardHomeView:Home}=components({
   '@/components/panel/PanelLayoutClient':{usePanelChromeModel:()=>cashierChrome},
   '@/lib/catalog-ui/client':{catalogApi:{getDashboardSummary:async()=>{calls.push('catalog');return{...catalog,productsWithoutMedia:0};}}},
   '@/lib/order-ui/client':{orderApi:{getDashboardSummary:async()=>{calls.push('orders');return orders;},listOrders:async()=>{calls.push('recent');return{items:recent};}}},
   '@/lib/abandoned-cart-ui/client':{abandonedCartApi:{getSummary:async()=>{calls.push('carts');return carts;}}},
   '@/lib/customer-ui/client':{customerApi:{summary:async()=>{calls.push('customers');return customers;}}},
   '@/lib/analytics-ui/client':{analyticsApi:{dashboard:async()=>{calls.push('analytics');return analytics();}},createAnalyticsBrowserApi:()=>({})},
   '@/lib/overview-ui/client':{overviewApi:{dashboard:async()=>{calls.push('overview');return analytics();}}},
  });
  await withEditor(async({container,render})=>{
   await render(React.createElement(Home));await React.act(async()=>{await Promise.resolve();});
   assert.ok(calls.includes('overview'));assert.equal(calls.includes('analytics'),false);assert.ok(calls.includes('catalog'));assert.equal(calls.includes('customers'),false);assert.equal(calls.includes('carts'),false);
   assert.equal(calls.includes('orders'),allowed);assert.equal(calls.includes('recent'),allowed);
   assert.equal(Boolean(container.querySelector('[data-dashboard-body="recent-orders"]')),allowed);assert.equal(Boolean(container.querySelector('[data-dashboard-body="order-status"]')),allowed);
   assert.ok(container.querySelector('[data-dashboard-chart="sales"]'));assert.match(container.textContent!,/Yeni müşteri/);
   for(const link of Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))){const path=link.getAttribute('href')!;assert.equal(/^\/(customers|discounts|settings|setup)(\/|$)/.test(path),false,path);assert.equal(path.startsWith('/orders/abandoned-carts'),false,path);if(!allowed)assert.equal(path==='/orders'||/^\/orders\/[0-9a-f-]+$/.test(path),false,path);}
   assert.equal(container.querySelector('#customer-view-title'),null);assert.doesNotMatch(container.textContent!,/Müşteri veya sepet verilerinin|operasyon sinyalleri kullanılamıyor/i);
  });
 }
});

test('cashier permission revocation hides retained order data and stops its subsequent reloads',async()=>{
 let granted=true;const calls:string[]=[],cashierChrome=()=>({...chrome,navigationMode:'register',cashierOverviewAvailable:true,cashierOrdersAvailable:granted});
 const{PanelDashboardHomeView:Home}=components({'@/components/panel/PanelLayoutClient':{usePanelChromeModel:cashierChrome},'@/lib/order-ui/client':{orderApi:{getDashboardSummary:async()=>{calls.push('summary');return orders;},listOrders:async()=>{calls.push('recent');return{items:recent};}}}});
 await withEditor(async({container,render})=>{
  await render(React.createElement(Home));assert.ok(container.textContent!.includes('ORDER-1'));const count=calls.length;granted=false;await render(React.createElement(Home));
  assert.equal(container.textContent!.includes('ORDER-1'),false);assert.equal(container.querySelector('[data-dashboard-body="order-status"]'),null);assert.equal(calls.length,count);
 });
});
