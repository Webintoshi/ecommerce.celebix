import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountingHttpHandlers} from './handler.ts';

const STORE='11111111-1111-4111-8111-111111111111',MEMBER='22222222-2222-4222-8222-222222222222',ACCOUNT='33333333-3333-4333-8333-333333333333',OP='44444444-4444-4444-8444-444444444444',EVENT='55555555-5555-4555-8555-555555555555';
const ORIGIN='https://panel.saas-staging.celebix.site',NOW=new Date('2026-10-17T12:00:00Z'),TOKEN='a'.repeat(64);
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
const pay={membershipId:MEMBER,accountId:ACCOUNT,amountCents:2000,currency:'TRY',occurredOn:'2026-10-17',note:'Ekim prim ödemesi',expectedBalanceToken:TOKEN,expectedAccountVersion:1};
const balance={membershipId:MEMBER,displayName:'Test Kasiyer',phoneMasked:'+90 •••••• 0012',currency:'TRY',earnedCommissionCents:10000,paidCents:5000,dueCents:5000,overpaidCents:0,balanceToken:'b'.repeat(64)};
const balances={rows:[balance],totals:{earnedCommissionCents:10000,paidCents:5000,dueCents:5000,overpaidCents:0}};
const payment={id:OP,membershipId:MEMBER,eventId:EVENT,accountId:ACCOUNT,accountName:'Kasa',accountType:'cash',currency:'TRY',amountCents:2000,occurredOn:'2026-10-17',createdAt:'2026-10-17T12:00:00.000Z',note:pay.note,reversed:false,reversalReason:null};
const priorPayment={...payment,id:'66666666-6666-4666-8666-666666666666',eventId:'77777777-7777-4777-8777-777777777777',amountCents:3000};
const result={operationId:OP,replayed:false,kind:'pay',balance,payment,account:{id:ACCOUNT,name:'Kasa',type:'cash',currency:'TRY',balanceCents:18000,version:2,createdAt:'2026-10-01T12:00:00.000Z'},previousDueCents:7000,previousOverpaidCents:0,previousBalanceCents:20000,previousBalanceToken:TOKEN};
function request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){return new Request(`http://internal:3400${path}`,{method,headers:{cookie:`__Host-celebix_panel=${COOKIE}`,...(method==='GET'?{}:{origin:ORIGIN,'content-type':'application/json','idempotency-key':OP}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
function setup(accounting:Record<string,unknown>,role='store_owner'){return createAccountingHttpHandlers({resolveRuntime:async()=>({accounting:{access:async()=>({canManageAccounting:true,canCollectReceivables:true}),...accounting},access:{panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:STORE,slug:'store'},membership:{id:STORE,role}}})}} as never),now:()=>NOW,requestId:()=>EVENT}) as any;}

test('commission payment routes use one manager session and exact typed read/write results',async()=>{
 const calls:any[]=[];const h=setup({commissionBalances:async(i:any)=>{calls.push(i);return balances;},commissionPayments:async(i:any)=>{calls.push(i);return{balance,payments:[payment,priorPayment],hasMore:false,today:'2026-10-17'};},commissionPaymentOperation:async(i:any)=>{calls.push(i);return result;},commissionPaymentMutate:async(i:any)=>{calls.push(i);return result;}});
 assert.equal(typeof h.commissionBalances,'function');
 assert.equal((await h.commissionBalances(request('/api/accounting/commission-balances'))).status,200);
 assert.equal((await h.commissionPayments(request(`/api/accounting/commission-payments/${MEMBER}`),MEMBER)).status,200);
 assert.equal((await h.commissionPaymentOperation(request(`/api/accounting/commission-payment-operations/${OP}`),OP)).status,200);
 const response=await h.commissionPaymentMutate(request('/api/accounting/commission-payments/actions/pay','POST',pay),'pay');assert.equal(response.status,200);assert.deepEqual(await response.json(),{data:result});assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(calls.length,4);assert.ok(calls.every(i=>i.tenantContext.store.id===STORE));assert.equal(calls[1].membershipId,MEMBER);assert.equal(calls[2].operationId,OP);assert.deepEqual(calls[3].intent,pay);assert.equal(calls[3].kind,'pay');
});
test('full accounting cashiers cannot read, recover or pay commission money',async()=>{
 let reads=0;const deny=async()=>{reads++;throw Error('must not read');};for(const role of ['cashier','editor','analyst']){const h=setup({access:deny,commissionBalances:deny,commissionPayments:deny,commissionPaymentOperation:deny,commissionPaymentMutate:deny},role);
 assert.equal((await h.commissionBalances(request('/api/accounting/commission-balances'))).status,403);assert.equal((await h.commissionPayments(request(`/api/accounting/commission-payments/${MEMBER}`),MEMBER)).status,403);assert.equal((await h.commissionPaymentOperation(request(`/api/accounting/commission-payment-operations/${OP}`),OP)).status,403);assert.equal((await h.commissionPaymentMutate(request('/api/accounting/commission-payments/actions/pay','POST',pay),'pay')).status,403);}
 assert.equal(reads,0);
});
test('payout routes reject forged authority, query, origin, kind, cents, token and operation key',async()=>{
 let calls=0;const fn=async()=>{calls++;return result;},h=setup({commissionBalances:fn,commissionPayments:fn,commissionPaymentOperation:fn,commissionPaymentMutate:fn});
 for(const suffix of ['?storeId='+STORE,'?dateFrom=2026-10-01','?currency=TRY&currency=TRY'])assert.equal((await h.commissionBalances(request('/api/accounting/commission-balances'+suffix))).status,400);
 assert.equal((await h.commissionPayments(request(`/api/accounting/commission-payments/${MEMBER}?accountId=${ACCOUNT}`),MEMBER)).status,400);
 assert.equal((await h.commissionPaymentOperation(request(`/api/accounting/commission-payment-operations/${OP}`,'GET',undefined,{'x-membership-id':MEMBER}),OP)).status,400);
 const path='/api/accounting/commission-payments/actions/pay';
 assert.equal((await h.commissionPaymentMutate(request(path,'POST',pay,{origin:'https://evil.test'}),'pay')).status,403);
 assert.equal((await h.commissionPaymentMutate(request(path,'POST',pay,{'idempotency-key':'bad'}),'pay')).status,400);
 for(const patch of [{amountCents:0},{amountCents:1.5},{currency:'EUR'},{expectedBalanceToken:'a'},{expectedAccountVersion:0},{storeId:STORE}])assert.equal((await h.commissionPaymentMutate(request(path,'POST',{...pay,...patch}),'pay')).status,400);
 assert.equal((await h.commissionPaymentMutate(request(path,'POST',pay),'expense')).status,400);assert.equal(calls,0);
});
test('payout HTTP refuses foreign or malformed repository receipts and sanitizes failures',async()=>{
 for(const value of [{...result,operationId:EVENT},{...result,balance:{...balance,membershipId:STORE}},{...result,previousBalanceToken:'c'.repeat(64)},{...result,payment:{...payment,note:'different'}}]){const h=setup({commissionPaymentMutate:async()=>value});assert.equal((await h.commissionPaymentMutate(request('/api/accounting/commission-payments/actions/pay','POST',pay),'pay')).status,503);}
 const wrong=setup({commissionPayments:async()=>({balance:{...balance,membershipId:STORE},payments:[],hasMore:false,today:'2026-10-17'}),commissionPaymentOperation:async()=>({...result,operationId:EVENT}),commissionBalances:async()=>({...balances,totals:{...balances.totals,dueCents:0}})});
 assert.equal((await wrong.commissionPayments(request(`/api/accounting/commission-payments/${MEMBER}`),MEMBER)).status,503);assert.equal((await wrong.commissionPaymentOperation(request(`/api/accounting/commission-payment-operations/${OP}`),OP)).status,503);assert.equal((await wrong.commissionBalances(request('/api/accounting/commission-balances'))).status,503);
 const h=setup({commissionPaymentMutate:async()=>{throw Object.assign(new Error('private database details'),{code:'insufficient_funds'});}});const response=await h.commissionPaymentMutate(request('/api/accounting/commission-payments/actions/pay','POST',pay),'pay');assert.equal(response.status,409);assert.deepEqual(await response.json(),{code:'insufficient_funds'});
});
