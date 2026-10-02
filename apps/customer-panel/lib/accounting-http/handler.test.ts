import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountingHttpHandlers} from './handler.ts';
const ID='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222',RID='33333333-3333-4333-8333-333333333333';
const ORIGIN='https://panel.saas-staging.celebix.site',NOW=new Date('2026-10-02T12:00:00Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return new Request(`http://internal:3400${path}`,{method,headers:{cookie:`__Host-celebix_panel=${COOKIE}`,...(method==='GET'?{}:{origin:ORIGIN,'content-type':'application/json','idempotency-key':OP}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
function setup(accounting:Record<string,unknown>,role='store_owner'){
  const tenant={store:{id:ID,slug:'store'},membership:{id:ID,role}};
  return createAccountingHttpHandlers({resolveRuntime:async()=>({accounting,access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:tenant})}} as never),now:()=>NOW,requestId:()=>RID});
}
const receipt={customerId:ID,orderId:null,amountCents:500000,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:1,note:null};
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
