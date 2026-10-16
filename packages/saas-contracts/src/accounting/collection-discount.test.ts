import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAccountingIntent,parseAccountingReceivable,parseAccountingEvent,parseAccountingOrderFinance,parseAccountingCurrencySummary} from './index.ts';
const ID='10000000-0000-4000-8000-000000000001',STAMP='2026-10-16T12:00:00.000Z';
const intent={customerId:ID,orderId:null,amountCents:200000,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:1,note:null};
const debt={id:ID,customerId:ID,customerName:'Test',customerPhone:null,customerArchived:false,orderId:ID,orderNumber:'TEST',channel:'POS',currency:'TRY',saleCents:240000,collectedCents:200000,returnCents:0,refundedCents:0,dueCents:0,refundDueCents:0,occurredAt:STAMP,dueDate:null,version:2};
const event={id:ID,kind:'collection',currency:'TRY',amountCents:200000,accountId:ID,customerId:ID,orderId:null,channel:'POS',paymentMethod:'cash',note:null,category:null,documentNumber:null,actorMembershipId:ID,occurredAt:STAMP,createdAt:STAMP,reversesEventId:null,reversed:false,allocations:[{receivableId:ID,orderId:ID,amountCents:200000}],metadata:{discountCents:40000,discountAllocations:[{receivableId:ID,orderId:ID,amountCents:40000}]}};
test('collection discount accepts cash plus discount and discount-only without changing legacy intent shape',()=>{
 assert.deepEqual(parseAccountingIntent('collect',{...intent,discountCents:40000}),{...intent,discountCents:40000});
 assert.equal(parseAccountingIntent('collect',{...intent,amountCents:0,discountCents:40000}).amountCents,0);
 assert.deepEqual(parseAccountingIntent('collect',intent),intent);
 assert.deepEqual(parseAccountingIntent('collect',{...intent,discountCents:0}),intent);
 for(const patch of[{amountCents:0},{amountCents:0,discountCents:0},{discountCents:-1},{discountCents:0.5},{discountCents:Number.MAX_SAFE_INTEGER},{amountCents:-1,discountCents:40000}])assert.throws(()=>parseAccountingIntent('collect',{...intent,...patch}));
});
test('receivable discount settles debt without inventing cash or a return and legacy fields remain unchanged',()=>{
 assert.deepEqual(parseAccountingReceivable({...debt,discountCents:40000}),{...debt,discountCents:40000});
 const legacy={...debt,dueCents:40000};assert.deepEqual(parseAccountingReceivable(legacy),legacy);
 for(const patch of[{discountCents:40000,dueCents:40000},{discountCents:40001,returnCents:200000},{discountCents:-1},{discountCents:0.5}])assert.throws(()=>parseAccountingReceivable({...debt,...patch}));
 assert.equal(parseAccountingReceivable({...debt,discountCents:40000,returnCents:200000,refundDueCents:200000}).refundDueCents,200000);
});
test('discount event cash and discount allocations stay independently exact',()=>{
 assert.deepEqual(parseAccountingEvent(event),event);
 const only={...event,amountCents:0,accountId:null,paymentMethod:null,allocations:[]};assert.equal(parseAccountingEvent(only).amountCents,0);
 for(const patch of[{metadata:{...event.metadata,discountCents:39999}},{metadata:{discountCents:40000,discountAllocations:[]}},{amountCents:240000},{amountCents:0},{metadata:{...event.metadata,discountCents:'40000'}}])assert.throws(()=>parseAccountingEvent({...event,...patch}));
 const reversed={...event,kind:'reversal',paymentMethod:null,reversesEventId:ID,allocations:[{receivableId:ID,orderId:ID,amountCents:-200000}],metadata:{...event.metadata,reversedKind:'collection'}};assert.equal(parseAccountingEvent(reversed).amountCents,200000);
});
test('discount-only paid order keeps the old finance DTO and has no zero receipt',()=>{
 const finance={status:'paid',collectedCents:0,dueCents:0,refundDueCents:0,version:2,receipts:[]};assert.deepEqual(parseAccountingOrderFinance(finance),finance);
 assert.throws(()=>parseAccountingOrderFinance({...finance,receipts:[{id:ID,amountCents:0,paymentMethod:'cash',receivedAt:STAMP,actorMembershipId:ID,reversed:false}]}));
});
test('overview settlement discount is optional signed money without changing old DTO keys',()=>{const summary={currency:'TRY',salesCents:240000,collectionsCents:200000,returnCents:0,refundsCents:0,expensesCents:0,commissionCents:0,dueCents:0,overdueCents:0,refundDueCents:0,recordedWebPaymentsCents:0};assert.deepEqual(parseAccountingCurrencySummary(summary),summary);for(const discountCents of[40000,-40000])assert.deepEqual(parseAccountingCurrencySummary({...summary,discountCents}),{...summary,discountCents});assert.throws(()=>parseAccountingCurrencySummary({...summary,discountCents:0.5}));});
