import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultProfitabilityPeriod,profitabilityFilters,profitabilityGaps} from './profitability-model.ts';

test('default profitability period starts at the current Istanbul month and ends today',()=>{
 assert.deepEqual(defaultProfitabilityPeriod(new Date('2026-09-30T22:30:00Z')),{dateFrom:'2026-10-01',dateTo:'2026-10-01'});
 assert.deepEqual(defaultProfitabilityPeriod(new Date('2026-10-15T08:30:00Z')),{dateFrom:'2026-10-01',dateTo:'2026-10-15'});
});
test('profitability filters accept valid calendar dates and no more than 366 inclusive days',()=>{
 assert.deepEqual(profitabilityFilters({dateFrom:'2026-01-01',dateTo:'2027-01-01',currency:' try '}),{dateFrom:'2026-01-01',dateTo:'2027-01-01',currency:'TRY'});
 for(const draft of[{dateFrom:'2026-02-30',dateTo:'2026-03-01',currency:''},{dateFrom:'2026-10-15',dateTo:'2026-10-01',currency:''},{dateFrom:'2026-01-01',dateTo:'2027-01-02',currency:''},{dateFrom:'',dateTo:'2026-10-15',currency:''},{dateFrom:'2026-10-01',dateTo:'2026-10-15',currency:'TL'}])assert.throws(()=>profitabilityFilters(draft));
});
test('missing cost, unmatched returns and unclassified payments explain unavailable profit',()=>{
 assert.deepEqual(profitabilityGaps({missingCostOrderCount:0,unresolvedReturnCount:0,unclassifiedSupplierPaymentCount:0}),[]);
 const gaps=profitabilityGaps({missingCostOrderCount:2,unresolvedReturnCount:1,unclassifiedSupplierPaymentCount:3});
 assert.equal(gaps.length,3);assert.match(gaps[0],/2 satış/);assert.match(gaps[0],/sipariş oluşturulurken/);assert.match(gaps[1],/1 iade/);assert.match(gaps[2],/3 tedarikçi ödemesi/);
});
