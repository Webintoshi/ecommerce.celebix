import assert from 'node:assert/strict';
import test from 'node:test';
import * as accounting from './index.ts';
import {parseInStoreStaffGrant} from '../in-store-sales/validation.ts';
const id='11111111-1111-4111-8111-111111111111';
const period={dateFrom:'2026-10-01',dateTo:'2026-10-31'};
const numbers={completedSaleCount:1,merchandiseSalesCents:10000,returnAdjustmentCents:1000,collectionDiscountCents:500,eligibleBaseCents:8500,earnedCommissionCents:2125};
const row={membershipId:id,displayName:'Ali Veli',phoneMasked:'+90 •••••• 1234',commissionEnabled:true,commissionRateBps:2500,...numbers};
const report={...period,basis:'net_product_sales',currency:'TRY',prospectiveOnly:true,rows:[row],totals:numbers};
const parse=(v:unknown)=>(accounting as any).parseAccountingCommissions(v);
const filters=(v:unknown)=>(accounting as any).parseAccountingCommissionsFilters(v);
test('commission report exposes strict frozen prospective net product sales with exact totals',()=>{
 assert.equal(typeof (accounting as any).parseAccountingCommissions,'function');
 const value=parse(report);assert.deepEqual(value,report);assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.rows)&&Object.isFrozen(value.rows[0])&&Object.isFrozen(value.totals));
 assert.deepEqual(parse({...report,rows:[],totals:Object.fromEntries(Object.keys(numbers).map(k=>[k,0]))}).rows,[]);
});
test('commission period uses valid ISO dates and an inclusive maximum of 366 days',()=>{
 assert.equal(typeof(accounting as any).parseAccountingCommissionsFilters,'function');
 assert.deepEqual(filters({dateFrom:'2024-01-01',dateTo:'2024-12-31'}),{dateFrom:'2024-01-01',dateTo:'2024-12-31'});
 for(const value of[{...period,dateFrom:'2026-02-30'},{...period,dateFrom:'0000-01-01'},{dateFrom:'2024-01-01',dateTo:'2025-01-01'},{...period,dateTo:'2026-09-30'},{...period,membershipId:id},{dateFrom:1,dateTo:2}])assert.throws(()=>filters(value));
});
test('commission report rejects forged authority, duplicate recipients, unsafe amounts and altered totals',()=>{
 for(const value of[{...report,secret:'private'},{...report,basis:'gross_profit'},{...report,currency:'USD'},{...report,prospectiveOnly:false},{...report,rows:[row,row]},{...report,rows:[{...row,commissionRateBps:10001}]},{...report,rows:[{...row,commissionEnabled:true,commissionRateBps:0}]},{...report,rows:[{...row,earnedCommissionCents:'2125'}]},{...report,rows:[{...row,returnAdjustmentCents:-1}]},{...report,totals:{...numbers,earnedCommissionCents:2126}},{...report,totals:{...numbers,eligibleBaseCents:Number.MAX_SAFE_INTEGER+1}},{...report,rows:[{...row,phoneCiphertext:'private'}]}])assert.throws(()=>parse(value));
});
test('staff v6 commission opt-in supports over twenty percent without changing earlier exact DTOs',()=>{
 const v5={membershipId:id,label:'Ali',role:'cashier',enabled:true,locationIds:[id],discountLimitBps:0,version:1,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:false,canManageAccounting:false};
 const v6={...v5,commissionEnabled:true,commissionRateBps:2500};assert.deepEqual(parseInStoreStaffGrant(v6,6 as never),v6);assert.deepEqual(parseInStoreStaffGrant(v5,5),v5);assert.throws(()=>parseInStoreStaffGrant(v6,5));
 assert.deepEqual(parseInStoreStaffGrant({...v6,commissionEnabled:false,commissionRateBps:0},6 as never),{...v6,commissionEnabled:false,commissionRateBps:0});
 assert.equal(parseInStoreStaffGrant({...v6,commissionRateBps:10000},6 as never).commissionRateBps,10000);
 for(const patch of[{commissionRateBps:0},{commissionRateBps:10001},{commissionRateBps:1.5},{commissionRateBps:'100'},{commissionEnabled:'true'}])assert.throws(()=>parseInStoreStaffGrant({...v6,...patch},6 as never));
 assert.throws(()=>parseInStoreStaffGrant(v5,6 as never));
});

test('commission report bounds rows and rejects accessor records without reading them',()=>{
 let reads=0;const accessor={...row};Object.defineProperty(accessor,'earnedCommissionCents',{enumerable:true,get(){reads++;return 2125;}});assert.throws(()=>parse({...report,rows:[accessor]}));assert.equal(reads,0);
 const sparse:unknown[]=[];sparse.length=1;assert.throws(()=>parse({...report,rows:sparse}));assert.throws(()=>parse({...report,rows:Array(1001).fill(row)}));
});

test('commission money requires a completed qualifying sale',()=>{
 assert.throws(()=>parse({...report,rows:[{...row,completedSaleCount:0}],totals:{...numbers,completedSaleCount:0}}));
});

test('commission phones preserve the existing eighty character enrollment boundary',()=>{
 const phoneMasked='+'+'•'.repeat(79);assert.equal(parse({...report,rows:[{...row,phoneMasked}]}).rows[0].phoneMasked,phoneMasked);assert.throws(()=>parse({...report,rows:[{...row,phoneMasked:phoneMasked+'•'}]}));
});
