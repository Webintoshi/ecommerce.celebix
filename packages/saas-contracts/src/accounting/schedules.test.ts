import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAccountingScheduleIntent,parseAccountingScheduleFilters,parseAccountingDebtSchedule,parseAccountingSchedules,parseAccountingScheduleResult} from './schedules.ts';
const ID='11111111-1111-4111-8111-111111111111';
const receivable={id:ID,customerId:ID,customerName:'Test',customerPhone:null,customerArchived:false,orderId:null,orderNumber:null,channel:null,currency:'TRY',saleCents:10000,collectedCents:4000,returnCents:0,refundedCents:0,dueCents:6000,refundDueCents:0,occurredAt:'2026-10-15T00:00:00.000Z',dueDate:'2026-10-20',version:1};
const schedule={receivable,hasPlan:true,plannedCents:8000,unplannedCents:0,installments:[{dueDate:'2026-10-20',amountCents:4000,coveredCents:2000,dueCents:2000},{dueDate:'2026-11-20',amountCents:4000,coveredCents:0,dueCents:4000}]};
test('schedule intent accepts only dated positive integer installments, immutable and ascending',()=>{
 const input={receivableId:ID,expectedVersion:1,installments:[{dueDate:'2026-10-20',amountCents:6000}]};
 assert.deepEqual(parseAccountingScheduleIntent(input),input);assert.ok(Object.isFrozen(parseAccountingScheduleIntent(input).installments));
 for(const bad of [{...input,storeId:ID},{...input,expectedVersion:0},{...input,installments:[]},{...input,installments:[{dueDate:'2026-02-30',amountCents:1}]},{...input,installments:[{dueDate:'2026-10-20',amountCents:0}]},{...input,installments:[{dueDate:'2026-10-20',amountCents:1.5}]},{...input,installments:[{dueDate:'2026-10-20',amountCents:1},{dueDate:'2026-10-20',amountCents:1}]},{...input,installments:[{dueDate:'2026-11-20',amountCents:1},{dueDate:'2026-10-20',amountCents:1}]},{...input,installments:[{dueDate:'2026-10-20',amountCents:Number.MAX_SAFE_INTEGER},{dueDate:'2026-11-20',amountCents:1}]}])assert.throws(()=>parseAccountingScheduleIntent(bad));
});
test('schedule filters are a separate allowlist and reject date/status/authority injection',()=>{
 assert.deepEqual(parseAccountingScheduleFilters({dueStatus:'today',currency:'TRY'}),{dueStatus:'today',currency:'TRY'});
 for(const value of [{dueStatus:'paid'},{storeId:ID},{dueStatus:'today',dateFrom:'2026-02-30'}])assert.throws(()=>parseAccountingScheduleFilters(value));
});
test('schedule response reconciles actual debt, oldest-first coverage and unplanned reopened residual',()=>{
 assert.deepEqual(parseAccountingDebtSchedule(schedule),schedule);
 const reopened={...schedule,receivable:{...receivable,collectedCents:0,dueCents:10000},unplannedCents:2000,installments:schedule.installments.map(i=>({...i,coveredCents:0,dueCents:i.amountCents}))};
 assert.deepEqual(parseAccountingDebtSchedule(reopened),reopened);
 for(const bad of [{...schedule,plannedCents:6000},{...schedule,unplannedCents:1},{...schedule,installments:[{...schedule.installments[0],coveredCents:0,dueCents:4000},schedule.installments[1]]},{...schedule,hasPlan:false},{...schedule,extra:true}])assert.throws(()=>parseAccountingDebtSchedule(bad));
 assert.equal(parseAccountingSchedules({schedules:[schedule],today:'2026-10-15',hasMore:false}).schedules.length,1);
 assert.equal(parseAccountingScheduleResult({operationId:ID,replayed:false,schedule}).operationId,ID);
});
