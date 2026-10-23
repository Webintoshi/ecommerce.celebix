import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAccountingTaxFilters,parseAccountingTaxReport} from './tax.ts';

const filters={dateFrom:'2026-10-01',dateTo:'2026-10-31'};
const row={currency:'TRY',grossSalesCents:23000,knownGrossCents:23000,unknownGrossCents:0,taxableBaseCents:20000,vatCents:3000,exemptGrossCents:0,zeroRateGrossCents:0,knownLineCount:2,unknownLineCount:0,returnGrossCents:0,knownReturnGrossCents:0,returnVatCents:0,unknownReturnGrossCents:0,reversalGrossCents:0,knownReversalGrossCents:0,reversalVatCents:0,unknownReversalGrossCents:0};
const report={dateFrom:'2026-10-01',dateTo:'2026-10-31',timeZone:'UTC',startAt:'2026-10-01T00:00:00.000Z',endAt:'2026-11-01T00:00:00.000Z',currencies:[row],limitations:['purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable']};
test('tax report preserves mixed-rate gross while separating base and VAT without manufacturing a profit',()=>{
 assert.deepEqual(parseAccountingTaxFilters(filters),filters);
 assert.deepEqual(parseAccountingTaxReport(report),report);
 assert.throws(()=>parseAccountingTaxReport({...report,profitCents:20000}));
 for(const patch of [{vatCents:3001},{unknownGrossCents:1},{knownLineCount:1.1},{currency:'try'},{vatCents:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>parseAccountingTaxReport({...report,currencies:[{...row,...patch}]}));
});
test('unknown historical sales and unallocated returns remain explicit coverage',()=>{
 const partial={...row,grossSalesCents:28000,unknownGrossCents:5000,unknownLineCount:1,returnGrossCents:1000,knownReturnGrossCents:0,unknownReturnGrossCents:1000};
 assert.equal(parseAccountingTaxReport({...report,currencies:[partial]}).currencies[0]!.unknownGrossCents,5000);
 for(const patch of [{unknownReturnGrossCents:999},{returnVatCents:1,knownReturnGrossCents:0},{unknownGrossCents:5001}])assert.throws(()=>parseAccountingTaxReport({...report,currencies:[{...partial,...patch}]}));
});
test('tax query rejects tenant authority, invalid periods, duplicates and unknown limitations',()=>{
 for(const input of [{...filters,storeId:'private'},{dateFrom:'2026-02-30',dateTo:'2026-03-01'},{dateFrom:'2026-11-01',dateTo:'2026-10-01'},{dateFrom:'2025-01-01',dateTo:'2026-10-01'},{...filters,profitScope:'known_cost'}])assert.throws(()=>parseAccountingTaxFilters(input));
 assert.throws(()=>parseAccountingTaxReport({...report,currencies:[row,row]}));
 assert.throws(()=>parseAccountingTaxReport({...report,limitations:['tax_payable']}));
 assert.deepEqual(parseAccountingTaxReport({...report,currencies:[]}).currencies,[]);
});

test('tax report respects store-local calendar dates and reports reversal evidence separately',()=>{
 const local={...report,timeZone:'Europe/Istanbul',startAt:'2026-09-30T21:00:00.000Z',endAt:'2026-10-31T21:00:00.000Z',currencies:[{...row,returnGrossCents:1200,knownReturnGrossCents:1200,returnVatCents:200,reversalGrossCents:1200,knownReversalGrossCents:1200,reversalVatCents:200}]};
 assert.deepEqual(parseAccountingTaxReport(local),local);
 for(const value of [{...local,startAt:'2026-10-01T21:00:00.000Z'},{...local,timeZone:'Wrong/Zone'},{...local,currencies:[{...row,reversalGrossCents:1200,knownReversalGrossCents:1200,reversalVatCents:1201}]}])assert.throws(()=>parseAccountingTaxReport(value));
});
