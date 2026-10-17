import assert from 'node:assert/strict';
import test from 'node:test';
import * as accounting from './index.ts';
const member='11111111-1111-4111-8111-111111111111',other='11111111-1111-4111-8111-111111111112',op='22222222-2222-4222-8222-222222222222',accountId='33333333-3333-4333-8333-333333333333',eventId='44444444-4444-4444-8444-444444444444';
const before='a'.repeat(64),after='b'.repeat(64),createdAt='2026-10-17T12:00:00.000Z';
const balance={membershipId:member,displayName:'Ali Veli',phoneMasked:'+90 •••••• 1234',currency:'TRY',earnedCommissionCents:10000,paidCents:3000,dueCents:7000,overpaidCents:0,balanceToken:after};
const totals={earnedCommissionCents:10000,paidCents:3000,dueCents:7000,overpaidCents:0};
const pay={membershipId:member,accountId,amountCents:3000,currency:'TRY',occurredOn:'2026-10-17',note:'Prim ödemesi',expectedBalanceToken:before,expectedAccountVersion:1};
const payment={id:op,membershipId:member,eventId,accountId,accountName:'Kasa',accountType:'cash',currency:'TRY',amountCents:3000,occurredOn:'2026-10-17',createdAt,note:'Prim ödemesi',reversed:false,reversalReason:null};
const account={id:accountId,name:'Kasa',type:'cash',currency:'TRY',balanceCents:17000,version:2,createdAt};
const result={operationId:op,replayed:false,kind:'pay',balance,payment,account,previousDueCents:10000,previousOverpaidCents:0,previousBalanceCents:20000,previousBalanceToken:before};
function parse(name:string,...values:unknown[]):any{const f=(accounting as any)[name];assert.equal(typeof f,'function',name+' is exported');return f(...values);}
test('commission payment intents require exact recipient, balance snapshot, account version and positive cents',()=>{
 assert.deepEqual(parse('parseAccountingCommissionPaymentIntent','pay',pay),pay);
 const reverse={membershipId:member,paymentId:op,reason:'Yanlış kayıt',expectedBalanceToken:before,expectedAccountVersion:2};assert.deepEqual(parse('parseAccountingCommissionPaymentIntent','reversePayment',reverse),reverse);
 for(const patch of[{amountCents:0},{amountCents:1.1},{amountCents:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},{expectedBalanceToken:'A'.repeat(64)},{expectedAccountVersion:0},{membershipId:'bad'},{note:''},{occurredOn:'2026-02-30'},{storeId:member}])assert.throws(()=>parse('parseAccountingCommissionPaymentIntent','pay',{...pay,...patch}));
 assert.throws(()=>parse('parseAccountingCommissionPaymentIntent','other',pay));
 let reads=0;assert.throws(()=>parse('parseAccountingCommissionPaymentIntent','pay',{...pay,get note(){reads++;return 'secret';}}));assert.equal(reads,0);
});
test('commission balances retain overpaid returns separately and sum every row with safe integers',()=>{
 const value=parse('parseAccountingCommissionBalances',{rows:[balance],totals});assert.deepEqual(value,{rows:[balance],totals});assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.rows)&&Object.isFrozen(value.rows[0])&&Object.isFrozen(value.totals));
 const over={...balance,membershipId:other,earnedCommissionCents:1000,paidCents:2000,dueCents:0,overpaidCents:1000};assert.equal(parse('parseAccountingCommissionBalances',{rows:[balance,over],totals:{earnedCommissionCents:11000,paidCents:5000,dueCents:7000,overpaidCents:1000}}).totals.overpaidCents,1000);
 for(const value of[{rows:[{...balance,dueCents:6999}],totals},{rows:[{...balance,overpaidCents:1}],totals},{rows:[balance,balance],totals},{rows:[balance],totals:{...totals,paidCents:3001}},{rows:[{...balance,paidCents:Number.MAX_SAFE_INTEGER+1}],totals},{rows:[{...balance,phoneMasked:'x'.repeat(81)}],totals},{rows:Array(1001).fill(balance),totals}])assert.throws(()=>parse('parseAccountingCommissionBalances',value));
 const sparse:unknown[]=[];sparse.length=1;assert.throws(()=>parse('parseAccountingCommissionBalances',{rows:sparse,totals}));
});
test('commission payment history binds every payout to recipient and complete-history paid totals',()=>{
 const detail={balance,payments:[payment],hasMore:false,today:'2026-10-17'};assert.deepEqual(parse('parseAccountingCommissionPaymentDetail',detail),detail);
 for(const patch of[{payments:[{...payment,membershipId:other}]},{payments:[payment,payment]},{payments:[{...payment,accountType:'card'}]},{payments:[{...payment,reversed:true}]},{payments:[]},{hasMore:true},{today:'2026-02-30'},{today:undefined}])assert.throws(()=>parse('parseAccountingCommissionPaymentDetail',{...detail,...patch}));
 const reversed={...payment,reversed:true,reversalReason:'Yanlış kayıt'};assert.deepEqual(parse('parseAccountingCommissionPaymentDetail',{balance:{...balance,paidCents:0,dueCents:10000},payments:[reversed],hasMore:false,today:'2026-10-17'}).payments,[reversed]);
});
test('commission payment receipt binds the exact partial debit and immutable recovery input',()=>{
 assert.deepEqual(parse('parseAccountingCommissionPaymentResult',result),result);assert.equal(parse('accountingCommissionPaymentResultMatches',result,'pay',pay,op),true);
 for(const patch of[{previousDueCents:9999},{previousOverpaidCents:1},{previousBalanceCents:20001},{previousBalanceToken:after},{account:{...account,type:'card'}},{balance:{...balance,currency:'USD'}},{payment:{...payment,id:other}}])assert.throws(()=>parse('parseAccountingCommissionPaymentResult',{...result,...patch}));
 for(const patch of[{membershipId:other},{accountId:other},{amountCents:3001},{expectedBalanceToken:after},{expectedAccountVersion:2},{occurredOn:'2026-10-16'},{note:'Other'}])assert.equal(parse('accountingCommissionPaymentResultMatches',result,'pay',{...pay,...patch},op),false);
 assert.equal(parse('accountingCommissionPaymentResultMatches',result,'pay',pay,other),false);
});
test('reversal restores the same account once and can cross overpaid advance into outstanding debt',()=>{
 const reverse={membershipId:member,paymentId:other,reason:'Yanlış kayıt',expectedBalanceToken:before,expectedAccountVersion:2};
 const r={...result,kind:'reversePayment',balance:{...balance,earnedCommissionCents:2000,paidCents:0,dueCents:2000},payment:{...payment,id:other,reversed:true,reversalReason:'Yanlış kayıt'},account:{...account,balanceCents:20000,version:3},previousDueCents:0,previousOverpaidCents:1000,previousBalanceCents:17000};
 assert.deepEqual(parse('parseAccountingCommissionPaymentResult',r),r);assert.equal(parse('accountingCommissionPaymentResultMatches',r,'reversePayment',reverse,op),true);
 assert.equal(parse('accountingCommissionPaymentResultMatches',r,'reversePayment',{...reverse,paymentId:op},op),false);assert.throws(()=>parse('parseAccountingCommissionPaymentResult',{...r,payment}));
});
