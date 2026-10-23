import assert from 'node:assert/strict';
import test from 'node:test';
import {compile,mounted,click} from '../../lib/mira-final-test-support.ts';
const filters={dateFrom:'2026-10-01',dateTo:'2026-10-31'};
const row={currency:'TRY',grossSalesCents:240000,knownGrossCents:120000,unknownGrossCents:120000,taxableBaseCents:100000,vatCents:20000,exemptGrossCents:0,zeroRateGrossCents:0,knownLineCount:1,unknownLineCount:1,returnGrossCents:12000,knownReturnGrossCents:12000,returnVatCents:2000,unknownReturnGrossCents:0,reversalGrossCents:0,knownReversalGrossCents:0,reversalVatCents:0,unknownReversalGrossCents:0};
const report={dateFrom:'2026-10-01',dateTo:'2026-10-31',timeZone:'UTC',startAt:'2026-10-01T00:00:00.000Z',endAt:'2026-11-01T00:00:00.000Z',currencies:[row],limitations:['purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable']};
function component(tax:unknown){return compile('components/accounting/AccountingTaxSummary.tsx',{'@/lib/accounting-ui/client':{accountingUi:{tax}}}).AccountingTaxSummary;}
test('sales VAT shows known and missing coverage separately from cash, profit and payable tax',async()=>{
 const calls:any[]=[];await mounted(component(async(...args:any[])=>{calls.push(args);return report;}),{scopeKey:'one',filters,revision:0},async host=>{
  const text=host.textContent;for(const label of ['Satışların KDV ayrımı','KDV hariç ürün tutarı','Satış KDV’si','KDV bilgisi eksik','1 satış kalemi','İadelerin KDV’si','Ödenecek vergi tutarı değildir'])assert.ok(text.includes(label),label);
  assert.equal(calls.length,1);assert.deepEqual(calls[0][0],filters);assert.ok(calls[0][1] instanceof AbortSignal);
 });
});
test('tax failure keeps the page usable and can be retried without duplicate background requests',async()=>{
 let calls=0;await mounted(component(async()=>{calls++;if(calls===1)throw Error('offline');return{...report,currencies:[]};}),{scopeKey:'one',filters,revision:0},async host=>{
  assert.ok(host.querySelector('[role="alert"]'));assert.equal(calls,1);await click(host,'KDV özetini yeniden dene');assert.equal(calls,2);assert.ok(host.textContent.includes('Bu dönemde satış veya iade yok.'));assert.equal(host.querySelector('[role="alert"]'),null);
 });
});
