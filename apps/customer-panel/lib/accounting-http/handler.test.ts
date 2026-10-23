import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountingHttpHandlers} from './handler.ts';
const ID='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222',RID='33333333-3333-4333-8333-333333333333';
const ORIGIN='https://panel.saas-staging.celebix.site',NOW=new Date('2026-10-02T12:00:00Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return new Request(`http://internal:3400${path}`,{method,headers:{cookie:`__Host-celebix_panel=${COOKIE}`,...(method==='GET'?{}:{origin:ORIGIN,'content-type':'application/json','idempotency-key':OP}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
function setup(accounting:Record<string,unknown>,role='store_owner'){
  const tenant={store:{id:ID,slug:'store'},membership:{id:ID,role}};
  return createAccountingHttpHandlers({resolveRuntime:async()=>({accounting:{access:async()=>({canManageAccounting:false,canCollectReceivables:false}),...accounting},access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:tenant})}} as never),now:()=>NOW,requestId:()=>RID});
}
const receipt={customerId:ID,orderId:null,amountCents:500000,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:1,note:null};
const commissionReport={dateFrom:'2026-10-01',dateTo:'2026-10-31',basis:'net_product_sales',currency:'TRY',prospectiveOnly:true,rows:[],totals:{completedSaleCount:0,merchandiseSalesCents:0,returnAdjustmentCents:0,collectionDiscountCents:0,eligibleBaseCents:0,earnedCommissionCents:0}};
test('commission report is manager-only even when a cashier has full accounting access',async()=>{
 const path='/api/accounting/commissions?dateFrom=2026-10-01&dateTo=2026-10-31',calls:any[]=[];
 for(const role of ['store_owner','admin']){const h=setup({commissions:async(input:any)=>{calls.push(input);return commissionReport;}},role) as any;assert.equal(typeof h.commissions,'function');const response=await h.commissions(request(path));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{data:commissionReport});}
 assert.equal(calls.length,2);assert.deepEqual(calls[0].filters,{dateFrom:'2026-10-01',dateTo:'2026-10-31'});assert.equal(calls[0].tenantContext.store.id,ID);
 let grantReads=0;const cashier=setup({access:async()=>{grantReads++;return{canManageAccounting:true,canCollectReceivables:true};},commissions:async()=>{throw Error('private payroll must not be read');}},'cashier') as any;
 assert.equal((await cashier.commissions(request(path))).status,403);assert.equal(grantReads,0);
});
test('commission filters reject duplicated forged and unbounded requests before the repository',async()=>{
 let calls=0;const h=setup({commissions:async()=>{calls++;return commissionReport;}}) as any,path='/api/accounting/commissions?dateFrom=2026-10-01&dateTo=2026-10-31';
 for(const input of [path+'&dateFrom=2026-10-01',path+'&storeId='+ID,path+'&commissionRateBps=2000','/api/accounting/commissions','/api/accounting/commissions?dateFrom=2025-01-01&dateTo=2026-10-31','/api/accounting/commissions?dateFrom=2026-02-31&dateTo=2026-03-01'])assert.equal((await h.commissions(request(input))).status,400);
 assert.equal((await h.commissions(request(path,'POST'))).status,405);assert.equal((await h.commissions(request(path,'GET',undefined,{'x-membership-id':ID}))).status,400);assert.equal(calls,0);
});
test('commission report binds the period and rejects malformed native output',async()=>{
 const path='/api/accounting/commissions?dateFrom=2026-10-01&dateTo=2026-10-31';
 for(const value of [{...commissionReport,dateFrom:'2026-09-01'},{...commissionReport,prospectiveOnly:false},{...commissionReport,totals:{...commissionReport.totals,earnedCommissionCents:1}}]){const h=setup({commissions:async()=>value}) as any;assert.equal((await h.commissions(request(path))).status,503);}
});
test('a native full-accounting grant admits cashier reporting and discount collection without changing the role',async()=>{
 const calls:any[]=[];let reads=0;const h=setup({access:async(input:any)=>{reads++;assert.equal(input.tenantContext.membership.role,'cashier');return{canManageAccounting:true,canCollectReceivables:true};},overview:async(input:any)=>{calls.push(input);return{};},profitability:async(input:any)=>{calls.push(input);return{};},collect:async(input:any)=>{calls.push(input);return{};}},'cashier');
 assert.equal((await h.get(request('/api/accounting/overview'),'overview')).status,200);
 assert.equal((await h.profitability(request('/api/accounting/profitability?dateFrom=2026-10-01&dateTo=2026-10-31'))).status,200);
 assert.equal((await h.mutate(request('/api/accounting/collections','POST',{...receipt,discountCents:40000}),'collect')).status,200);
 assert.equal(reads,3);assert.equal(calls.length,3);assert.ok(calls.every(input=>input.tenantContext.membership.role==='cashier'));
});
test('revocation and malformed grant results deny subsequent cashier finance requests',async()=>{
 let enabled=true,calls=0;const h=setup({access:async()=>({canManageAccounting:enabled,canCollectReceivables:enabled}),accounts:async()=>{calls++;return{};}},'cashier');
 assert.equal((await h.get(request('/api/accounting/accounts'),'accounts')).status,200);enabled=false;
 assert.equal((await h.get(request('/api/accounting/accounts'),'accounts')).status,403);assert.equal(calls,1);
 assert.equal((await h.get(request('/api/accounting/accounts?canManageAccounting=true'),'accounts')).status,403);
 assert.equal((await h.get(request('/api/accounting/accounts','GET',undefined,{'x-celebix-can-manage-accounting':'true'}),'accounts')).status,400);
 const invalid=setup({access:async()=>({canManageAccounting:true}),accounts:async()=>{calls++;}},'cashier');assert.equal((await invalid.get(request('/api/accounting/accounts'),'accounts')).status,503);assert.equal(calls,1);
});
test('collection discount accepts separate cents or discount-only and rejects cashier discount before ledger',async()=>{const calls:any[]=[];const h=setup({collect:async(v:unknown)=>{calls.push(v);return{};}});for(const intent of[{...receipt,amountCents:200000,discountCents:40000},{...receipt,amountCents:0,discountCents:40000}])assert.equal((await h.mutate(request('/api/accounting/collections','POST',intent),'collect')).status,200);assert.equal(calls[0].intent.amountCents,200000);assert.equal(calls[0].intent.discountCents,40000);assert.equal(calls[1].intent.amountCents,0);const cashier=setup({collect:async()=>{throw Error('must not reach ledger');}},'cashier');assert.equal((await cashier.mutate(request('/api/accounting/collections','POST',{...receipt,discountCents:40000}),'collect')).status,403);for(const patch of[{discountCents:-1},{discountCents:0.5},{discountCents:Number.MAX_SAFE_INTEGER},{amountCents:0,discountCents:0}])assert.equal((await h.mutate(request('/api/accounting/collections','POST',{...receipt,...patch}),'collect')).status,400);assert.equal(calls.length,2);});
test('profitability accepts only bounded date/currency and trusted manager session',async()=>{const calls:any[]=[];const h=setup({profitability:async(v:unknown)=>{calls.push(v);return{dateFrom:'2026-10-01',dateTo:'2026-10-31',currencies:[]};}}),path='/api/accounting/profitability?dateFrom=2026-10-01&dateTo=2026-10-31&currency=TRY';assert.equal(typeof (h as any).profitability,'function');const response=await (h as any).profitability(request(path));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls[0].tenantContext.store.id,ID);assert.deepEqual(calls[0].filters,{dateFrom:'2026-10-01',dateTo:'2026-10-31',currency:'TRY'});for(const suffix of['&channel=POS','&storeId=x','&currency=EUR'])assert.equal((await (h as any).profitability(request(path+suffix))).status,400);assert.equal((await (h as any).profitability(request('/api/accounting/profitability'))).status,400);assert.equal((await (setup({},'cashier') as any).profitability(request(path))).status,403);assert.equal((await (h as any).profitability(request(path,'POST'))).status,405);assert.equal(calls.length,1);});
test('profitability forwards only the explicit known-cost scope and retains legacy requests',async()=>{const calls:any[]=[],h=setup({profitability:async(input:any)=>{calls.push(input);return{dateFrom:input.filters.dateFrom,dateTo:input.filters.dateTo,...input.filters.profitScope?{profitScope:input.filters.profitScope}:{},currencies:[]};}}),path='/api/accounting/profitability?dateFrom=2026-10-01&dateTo=2026-10-31';const legacy=await h.profitability(request(path));assert.deepEqual(await legacy.json(),{data:{dateFrom:'2026-10-01',dateTo:'2026-10-31',currencies:[]}});const scoped=await h.profitability(request(path+'&profitScope=known_cost'));assert.equal(scoped.status,200);assert.equal(scoped.headers.get('cache-control'),'no-store');assert.deepEqual(calls[1].filters,{dateFrom:'2026-10-01',dateTo:'2026-10-31',profitScope:'known_cost'});assert.equal(calls[1].tenantContext.store.id,ID);for(const suffix of['&profitScope=all','&profitScope=','&profitScope=known_cost&profitScope=known_cost','&profitScope=known_cost&storeId=x'])assert.equal((await h.profitability(request(path+suffix))).status,400);assert.equal(calls.length,2);});
test('overview filters and tenant come from the session, not browser authority',async()=>{
  const calls:any[]=[];const h=setup({overview:async(input:unknown)=>{calls.push(input);return{currencies:[],accounts:[],recentEvents:[]};}});
  const response=await h.get(request('/api/accounting/overview?dateFrom=2026-09-01&dateTo=2026-09-30&channel=POS&currency=TRY'),'overview');
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:{currencies:[],accounts:[],recentEvents:[]}});assert.equal(calls[0].tenantContext.store.id,ID);assert.equal(calls[0].filters.dateTo,'2026-09-30');
  for(const path of ['/api/accounting/overview?storeId='+ID,'/api/accounting/overview?currency=TRY&currency=USD','/api/accounting/overview?dateFrom=2026-02-31'])assert.equal((await h.get(request(path),'overview')).status,400);
  assert.equal((await h.get(request('/api/accounting/overview','GET',undefined,{'x-tenant-id':ID}),'overview')).status,400);assert.equal(calls.length,1);
});
test('collection command validates cents/version and binds retry key to the session',async()=>{
  const calls:any[]=[];const h=setup({collect:async(input:unknown)=>{calls.push(input);return{operationId:OP,replayed:false};}});
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',receipt),'collect')).status,200);assert.equal(calls[0].operationId,OP);assert.equal(calls[0].intent.amountCents,500000);assert.equal(calls[0].tenantContext.store.id,ID);
  for(const body of [{...receipt,amountCents:0},{...receipt,amountCents:5.5},{...receipt,expectedVersion:0},{...receipt,storeId:ID}])assert.equal((await h.mutate(request('/api/accounting/collections','POST',body),'collect')).status,400);
  assert.equal(calls.length,1);
});
test('finance writes reject foreign origin malformed retry key and read-only roles',async()=>{
  let calls=0;const h=setup({collect:async()=>{calls++;}});
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',receipt,{origin:'https://evil.example'}),'collect')).status,403);
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',receipt,{'idempotency-key':'bad'}),'collect')).status,400);
  for(const role of ['editor','analyst'])assert.equal((await setup({collect:async()=>{calls++;}},role).mutate(request('/api/accounting/collections','POST',receipt),'collect')).status,403);
  assert.equal(calls,0);
});
test('cashier cannot access general finance but narrow collection still reaches durable grant validation',async()=>{
  let calls=0;const h=setup({overview:async()=>{calls++;},accounts:async()=>{calls++;},collect:async()=>{calls++;const e=new Error('denied');Object.assign(e,{code:'membership_denied'});throw e;}},'cashier');
  assert.equal((await h.get(request('/api/accounting/overview'),'overview')).status,403);assert.equal((await h.get(request('/api/accounting/accounts'),'accounts')).status,403);
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',receipt),'collect')).status,403);assert.equal(calls,1);
});
test('customer/order/operation URLs bind valid source IDs and prohibit query injection',async()=>{
  const calls:any[]=[];const h=setup({customerAccount:async(v:unknown)=>{calls.push(v);return{};},orderFinance:async(v:unknown)=>{calls.push(v);return{};},operation:async(v:unknown)=>{calls.push(v);return null;}});
  assert.equal((await h.customer(request(`/api/accounting/customers/${ID}?currency=TRY`),ID)).status,200);assert.equal(calls[0].customerId,ID);
  assert.equal((await h.order(request(`/api/accounting/orders/${ID}`),ID)).status,200);assert.equal(calls[1].orderId,ID);
  assert.equal((await h.operation(request(`/api/accounting/operations/${OP}`),OP)).status,200);assert.equal(calls[2].operationId,OP);
  assert.equal((await h.customer(request(`/api/accounting/customers/${ID}?orderId=${OP}`),ID)).status,400);
  assert.equal((await h.order(request('/api/accounting/orders/bad'),'bad')).status,400);assert.equal(calls.length,3);
});
test('unavailable/unauthenticated cannot read money and responses never expose thrown details',async()=>{
  const h=createAccountingHttpHandlers({resolveRuntime:async()=>null,now:()=>NOW,requestId:()=>RID});assert.equal((await h.get(request('/api/accounting/overview'),'overview')).status,503);
  const live=setup({overview:async()=>{throw Error('private connection credential');}});
  assert.equal((await live.get(new Request('http://internal:3400/api/accounting/overview'),'overview')).status,401);
  const response=await live.get(request('/api/accounting/overview'),'overview');assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'unavailable'});assert.equal(response.headers.get('cache-control'),'no-store');
});
test('bounded mutation stream refuses oversize and mismatched byte lengths before ledger',async()=>{
  let calls=0;const h=setup({collect:async()=>{calls++;}});
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',{...receipt,note:'x'.repeat(70000)}),'collect')).status,400);
  assert.equal((await h.mutate(request('/api/accounting/collections','POST',receipt,{'content-length':'1'}),'collect')).status,400);assert.equal(calls,0);
});
test('cashier account choices are a separate grant-scoped projection without balances',async()=>{
  const h=setup({collectionAccounts:async()=>({accounts:[{id:ID,name:'Kasa',type:'cash',currency:'TRY'}]})},'cashier');
  const response=await h.get(request('/api/accounting/collection-accounts'),'collection-accounts' as never);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:{accounts:[{id:ID,name:'Kasa',type:'cash',currency:'TRY'}]}});
});
test('allocation preview binds customer order currency and exact positive cents before durable FIFO calculation',async()=>{
  const calls:any[]=[];const h=setup({previewCollection:async(input:unknown)=>{calls.push(input);return{customerId:ID,version:3,dueCents:600000,allocations:[{receivableId:OP,orderId:OP,amountCents:200000}]};}},'cashier');
  const response=await h.preview(request(`/api/accounting/collection-preview?customerId=${ID}&orderId=${OP}&currency=TRY&amountCents=200000`));assert.equal(response.status,200);assert.equal(calls[0].amountCents,200000);assert.equal(calls[0].orderId,OP);
  for(const amount of ['0','1.1','-3','9007199254740992'])assert.equal((await h.preview(request(`/api/accounting/collection-preview?customerId=${ID}&amountCents=${amount}`))).status,400);assert.equal(calls.length,1);
});
test('schedule routes bind manager authority, trusted tenant and a dedicated operation key',async()=>{
 const calls:any[]=[];const h=setup({schedules:async(v:unknown)=>{calls.push(v);return{schedules:[],today:'2026-10-15',hasMore:false};},schedule:async(v:unknown)=>{calls.push(v);return{};},saveSchedule:async(v:unknown)=>{calls.push(v);return{};},scheduleOperation:async(v:unknown)=>{calls.push(v);return null;}});
 assert.equal((await h.schedules(request('/api/accounting/schedules?dueStatus=overdue'))).status,200);assert.equal(calls[0].filters.dueStatus,'overdue');
 assert.equal((await h.schedule(request(`/api/accounting/schedules/${ID}`),ID)).status,200);assert.equal(calls[1].receivableId,ID);
 const intent={receivableId:ID,expectedVersion:1,installments:[{dueDate:'2026-10-20',amountCents:1000}]};
 assert.equal((await h.saveSchedule(request('/api/accounting/schedules','POST',intent))).status,200);assert.equal(calls[2].operationId,OP);assert.equal(calls[2].tenantContext.store.id,ID);
 assert.equal((await h.scheduleOperation(request(`/api/accounting/schedule-operations/${OP}`),OP)).status,200);
 assert.equal((await h.schedules(request('/api/accounting/schedules?dueStatus=overdue&dueStatus=today'))).status,400);
 assert.equal((await h.saveSchedule(request('/api/accounting/schedules','POST',{...intent,storeId:ID}))).status,400);
 assert.equal((await h.saveSchedule(request('/api/accounting/schedules','POST',intent,{origin:'https://evil.example'}))).status,403);
 assert.equal((await setup({},'cashier').saveSchedule(request('/api/accounting/schedules','POST',intent))).status,403);
 assert.equal(calls.length,4);
});
test('cash count routes bind one cash account and reject cashier origin and extra authority',async()=>{
 const calls:any[]=[];const h=setup({cashSessions:async(v:unknown)=>{calls.push(v);return{};},cashMutate:async(v:unknown)=>{calls.push(v);return{};},cashOperation:async(v:unknown)=>{calls.push(v);return null;}});assert.equal(typeof (h as any).cashSessions,'function');
 assert.equal((await (h as any).cashSessions(request(`/api/accounting/cash-sessions?accountId=${ID}`))).status,200);assert.equal(calls[0].accountId,ID);
 const intent={accountId:ID,expectedVersion:1,expectedLastSessionId:null,countedCents:0,note:null};assert.equal((await (h as any).cashMutate(request('/api/accounting/cash-sessions/open','POST',intent),'open')).status,200);assert.equal(calls[1].operationId,OP);assert.equal(calls[1].kind,'open');
 assert.equal((await (h as any).cashOperation(request(`/api/accounting/cash-session-operations/${OP}`),OP)).status,200);
 assert.equal((await (h as any).cashSessions(request(`/api/accounting/cash-sessions?accountId=${ID}&accountId=${OP}`))).status,400);
 assert.equal((await (h as any).cashMutate(request('/api/accounting/cash-sessions/open','POST',{...intent,storeId:ID}),'open')).status,400);
 assert.equal((await (h as any).cashMutate(request('/api/accounting/cash-sessions/open','POST',intent,{origin:'https://evil.example'}),'open')).status,403);
 for(const role of ['cashier','analyst','editor'])assert.equal((await (setup({},role) as any).cashSessions(request(`/api/accounting/cash-sessions?accountId=${ID}`))).status,403);
 assert.equal(calls.length,3);
});

test('supplier routes use exact owner origin paths and deny cashier or duplicate authority',async()=>{const calls:any[]=[];const h=setup({suppliers:async(v:unknown)=>{calls.push(v);return{};},supplier:async(v:unknown)=>{calls.push(v);return{};},supplierMutate:async(v:unknown)=>{calls.push(v);return{};},supplierOperation:async(v:unknown)=>{calls.push(v);return null;}}) as any;assert.equal(typeof h.suppliers,'function');assert.equal((await h.suppliers(request('/api/accounting/suppliers?status=open&due=overdue'))).status,200);assert.deepEqual(calls[0].filters,{status:'open',due:'overdue'});assert.equal((await h.supplier(request(`/api/accounting/suppliers/${ID}`),ID)).status,200);const intent={supplierName:'Örnek',amountCents:10000,currency:'TRY',occurredOn:'2026-10-01',dueOn:null,documentNumber:null,note:'Mal alımı'};assert.equal((await h.supplierMutate(request('/api/accounting/suppliers/actions/createDebt','POST',intent),'createDebt')).status,200);assert.equal(calls[2].operationId,OP);assert.equal((await h.supplierOperation(request(`/api/accounting/supplier-operations/${OP}`),OP)).status,200);assert.equal((await h.suppliers(request('/api/accounting/suppliers?status=open&status=paid'))).status,400);assert.equal((await h.suppliers(request('/api/accounting/suppliers?storeId='+ID))).status,400);assert.equal((await h.supplierMutate(request('/api/accounting/suppliers/actions/createDebt','POST',intent,{origin:'https://evil.test'}),'createDebt')).status,403);assert.equal((await (setup({},'cashier') as any).suppliers(request('/api/accounting/suppliers'))).status,403);assert.equal(calls.length,4);});

const taxReport={dateFrom:'2026-10-01',dateTo:'2026-10-31',timeZone:'UTC',startAt:'2026-10-01T00:00:00.000Z',endAt:'2026-11-01T00:00:00.000Z',currencies:[],limitations:['purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable']};
test('VAT report binds period, admits granted cashiers, and rejects fabricated query authority',async()=>{
 const path='/api/accounting/tax?dateFrom=2026-10-01&dateTo=2026-10-31',calls:any[]=[];
 for(const role of ['store_owner','admin','cashier']){const h=setup({access:async()=>({canManageAccounting:true,canCollectReceivables:true}),tax:async(input:any)=>{calls.push(input);return taxReport;}},role);const response=await h.tax(request(path));assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:taxReport});assert.equal(response.headers.get('cache-control'),'no-store');}
 assert.equal(calls.length,3);assert.ok(calls.every(input=>input.tenantContext.store.id===ID));
 assert.equal((await setup({tax:async()=>taxReport},'cashier').tax(request(path))).status,403);
 const h=setup({tax:async()=>{throw Error('must not run');}});for(const suffix of ['&storeId='+ID,'&dateFrom=2026-10-01','&currency=TRY&currency=EUR'])assert.equal((await h.tax(request(path+suffix))).status,400);
 assert.equal((await h.tax(request(path,'POST'))).status,405);
});
test('VAT report rejects malformed amounts and an unrelated reporting period',async()=>{
 const path='/api/accounting/tax?dateFrom=2026-10-01&dateTo=2026-10-31';
 for(const report of [{...taxReport,startAt:'2026-09-01T00:00:00.000Z'},{...taxReport,limitations:[]},{...taxReport,currencies:[{currency:'TRY',vatCents:-1}]}])assert.equal((await setup({tax:async()=>report}).tax(request(path))).status,503);
});
