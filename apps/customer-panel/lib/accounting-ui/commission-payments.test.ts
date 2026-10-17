import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountingUiClient,AccountingUiError} from './client.ts';
const MEMBER='22222222-2222-4222-8222-222222222222',ACCOUNT='33333333-3333-4333-8333-333333333333',OP='44444444-4444-4444-8444-444444444444',EVENT='55555555-5555-4555-8555-555555555555',TOKEN='a'.repeat(64);
const pay={membershipId:MEMBER,accountId:ACCOUNT,amountCents:2000,currency:'TRY',occurredOn:'2026-10-17',note:'Ekim prim ödemesi',expectedBalanceToken:TOKEN,expectedAccountVersion:1};
const balance={membershipId:MEMBER,displayName:'Test Kasiyer',phoneMasked:'+90 •••••• 0012',currency:'TRY',earnedCommissionCents:10000,paidCents:5000,dueCents:5000,overpaidCents:0,balanceToken:'b'.repeat(64)};
const balances={rows:[balance],totals:{earnedCommissionCents:10000,paidCents:5000,dueCents:5000,overpaidCents:0}};
const payment={id:OP,membershipId:MEMBER,eventId:EVENT,accountId:ACCOUNT,accountName:'Kasa',accountType:'cash',currency:'TRY',amountCents:2000,occurredOn:'2026-10-17',createdAt:'2026-10-17T12:00:00.000Z',note:pay.note,reversed:false,reversalReason:null};
const priorPayment={...payment,id:'66666666-6666-4666-8666-666666666666',eventId:'77777777-7777-4777-8777-777777777777',amountCents:3000};
const result={operationId:OP,replayed:false,kind:'pay',balance,payment,account:{id:ACCOUNT,name:'Kasa',type:'cash',currency:'TRY',balanceCents:18000,version:2,createdAt:'2026-10-01T12:00:00.000Z'},previousDueCents:7000,previousOverpaidCents:0,previousBalanceCents:20000,previousBalanceToken:TOKEN};
test('commission lifetime balances and history are cancellable no-store reads without period filters',async()=>{
 const calls:any[]=[],signal=new AbortController().signal,client=createAccountingUiClient({fetch:async(path,init)=>{calls.push({path,init});return Response.json({data:calls.length===1?balances:{balance,payments:[payment,priorPayment],hasMore:false,today:'2026-10-17'}});}}) as any;
 assert.equal(typeof client.commissionBalances,'function');assert.deepEqual(await client.commissionBalances(signal),balances);assert.equal((await client.commissionPayments(MEMBER,signal)).balance.membershipId,MEMBER);
 assert.deepEqual(calls.map(c=>c.path),['/api/accounting/commission-balances',`/api/accounting/commission-payments/${MEMBER}`]);assert.ok(calls.every(c=>c.init.method==='GET'&&c.init.cache==='no-store'&&c.init.signal===signal));
 const invalid=createAccountingUiClient({fetch:async()=>Response.json({data:{balance:{...balance,membershipId:ACCOUNT},payments:[],hasMore:false,today:'2026-10-17'}})}) as any;await assert.rejects(()=>invalid.commissionPayments(MEMBER),e=>e instanceof AccountingUiError&&!e.unknownResult);
});
test('an uncertain commission payment preserves one exact key/body and only explicit recovery reads',async()=>{
 const attempts:any[]=[],client=createAccountingUiClient({fetch:async(path,init)=>{attempts.push({path,body:init?.body,key:new Headers(init?.headers).get('idempotency-key')});if(init?.method==='GET')return Response.json({data:null});throw Error('connection lost');}}) as any;
 assert.equal(typeof client.commissionPaymentMutate,'function');for(let i=0;i<2;i++)await assert.rejects(()=>client.commissionPaymentMutate('pay',pay,OP),e=>e instanceof AccountingUiError&&e.unknownResult);assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0].path,'/api/accounting/commission-payments/actions/pay');assert.equal(attempts[0].key,OP);assert.deepEqual(JSON.parse(attempts[0].body),pay);assert.equal(await client.commissionPaymentOperation(OP),null);assert.equal(attempts[2].path,`/api/accounting/commission-payment-operations/${OP}`);
});
test('commission client binds successful payment receipts to every frozen command authority',async()=>{
 const good=createAccountingUiClient({fetch:async()=>Response.json({data:result})}) as any;assert.equal(typeof good.commissionPaymentMutate,'function');assert.deepEqual(await good.commissionPaymentMutate('pay',pay,OP),result);
 for(const value of [{...result,operationId:EVENT},{...result,previousBalanceToken:'c'.repeat(64)},{...result,payment:{...payment,accountId:MEMBER}},{...result,payment:{...payment,note:'another'}},{...result,account:{...result.account,version:3}},{...result,balance:{...balance,dueCents:7000}}]){const bad=createAccountingUiClient({fetch:async()=>Response.json({data:value})}) as any;await assert.rejects(()=>bad.commissionPaymentMutate('pay',pay,OP),e=>e instanceof AccountingUiError&&e.unknownResult);}
 let calls=0;const input=createAccountingUiClient({fetch:async()=>{calls++;return Response.json({data:result});}}) as any;for(const patch of [{amountCents:0},{amountCents:0.5},{expectedBalanceToken:'bad'},{currency:'EUR'},{storeId:MEMBER}])await assert.rejects(()=>input.commissionPaymentMutate('pay',{...pay,...patch},OP));assert.equal(calls,0);
});
test('commission recovery rejects another operation and malformed lifetime totals',async()=>{
 const other=createAccountingUiClient({fetch:async()=>Response.json({data:{...result,operationId:EVENT}})}) as any;assert.equal(typeof other.commissionPaymentOperation,'function');await assert.rejects(()=>other.commissionPaymentOperation(OP),e=>e instanceof AccountingUiError&&!e.unknownResult);
 const bad=createAccountingUiClient({fetch:async()=>Response.json({data:{...balances,totals:{...balances.totals,paidCents:4999}}})}) as any;await assert.rejects(()=>bad.commissionBalances(),e=>e instanceof AccountingUiError&&!e.unknownResult);
});
