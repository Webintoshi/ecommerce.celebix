import assert from 'node:assert/strict';
import test from 'node:test';
import {act} from 'react';
import type{AccountingProfitability} from '@celebix/saas-contracts';
import {compile,mounted,click} from '../../lib/mira-final-test-support.ts';

const row={currency:'TRY',salesCents:1000000,returnCents:100000,netSalesCents:900000,collectionsCents:500000,refundsCents:30000,expensesCents:120000,supplierPaymentsCents:0,operatingExpensesCents:120000,commissionCents:10000,netCashCents:340000,knownCostCents:400000,costedSalesCents:1000000,missingCostOrderCount:0,unresolvedReturnCount:0,unclassifiedSupplierPaymentCount:0,grossProfitCents:500000,profitCents:370000};
const report:AccountingProfitability={dateFrom:'2026-10-01',dateTo:'2026-10-15',currencies:[row]};
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
async function fill(input:any,value:string){const key=Object.keys(input).find(k=>k.startsWith('__reactProps$'))!;await act(async()=>input[key].onChange({target:{value}}));}
function component(read:(filters:any,signal?:AbortSignal)=>Promise<AccountingProfitability>){return compile('components/accounting/ProfitabilityConsole.tsx',{'@/lib/accounting-ui/client':{accountingUi:{profitability:read}}}).ProfitabilityConsole;}

test('profit report separates net sales, collections, registered profit and cash remaining',async()=>{
 let calls=0;
 await mounted(component(async()=>{calls++;return report}),{canRead:true,scopeKey:'store:actor'},async host=>{
  await flush();
  const cards=host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]');assert.ok(cards);
  assert.match(cards.textContent,/Net satış.*9\.000,00/);assert.match(cards.textContent,/Tahsilat.*5\.000,00/);assert.match(cards.textContent,/Hesaplanan kâr.*3\.700,00/);
  const cash=host.querySelector('section[aria-label="TRY para hareketleri"]');assert.ok(cash);assert.match(cash.textContent,/Tahsilattan kalan.*3\.400,00/);
  assert.match(host.textContent,/vergi ve kaydedilmemiş giderler hariç/);
  assert.equal(host.querySelector('select[name="channel"]'),null);assert.equal(host.querySelector('h1')?.className,'sr-only');
  assert.equal(calls,1);assert.equal(host.querySelector('a[href="/accounting/suppliers"]')?.textContent,'Tedarikçi borçları');
 });
});
test('settlement discount is explicit in profit while actual cash totals stay unchanged',async()=>{
 const discounted={...row,discountCents:40000,netSalesCents:860000,grossProfitCents:460000,profitCents:330000};
 await mounted(component(async()=>({...report,currencies:[discounted]})),{canRead:true,scopeKey:'store:actor'},async host=>{
  await flush();const profit=host.querySelector('section[aria-label="TRY kâr hesabı"]'),cash=host.querySelector('section[aria-label="TRY para hareketleri"]');
  assert.match(profit.textContent,/İskonto.*400,00/);assert.match(profit.textContent,/Net satış.*8\.600,00/);
  assert.doesNotMatch(cash.textContent,/İskonto/);assert.match(cash.textContent,/Tahsilat.*5\.000,00/);assert.match(cash.textContent,/Tahsilattan kalan.*3\.400,00/);
 });
});
test('profit is unavailable for missing historical cost or unresolved return and supplier classification',async()=>{
 const incomplete={...report,currencies:[{...row,knownCostCents:0,costedSalesCents:0,missingCostOrderCount:2,unresolvedReturnCount:1,unclassifiedSupplierPaymentCount:1,grossProfitCents:null,profitCents:null}]};
 await mounted(component(async()=>incomplete),{canRead:true,scopeKey:'store:actor'},async host=>{await flush();const cards=host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]');assert.match(cards.textContent,/Hesaplanan kârHesaplanamıyor/);assert.match(host.textContent,/2 satış/);assert.match(host.textContent,/sipariş oluşturulurken/);assert.match(host.textContent,/1 iade/);assert.match(host.textContent,/1 tedarikçi ödemesi/);assert.doesNotMatch(host.textContent,/Gerçek kâr|Net kâr/);});
});
test('supplier cash payment is separate from profit costs and currencies never merge',async()=>{
 const supplier={...row,expensesCents:170000,supplierPaymentsCents:50000,operatingExpensesCents:120000,unclassifiedSupplierPaymentCount:1,profitCents:null,netCashCents:290000};
 await mounted(component(async()=>({...report,currencies:[supplier,{...row,currency:'EUR'}]})),{canRead:true,scopeKey:'store:actor'},async host=>{await flush();assert.equal(host.querySelectorAll('dl[aria-label="Satış, tahsilat ve kâr"]').length,2);const cash=host.querySelector('section[aria-label="TRY para hareketleri"]');assert.match(cash.textContent,/Tedarikçilere ödenen.*500,00/);assert.match(cash.textContent,/Tahsilattan kalan.*2\.900,00/);assert.match(host.querySelector('section[aria-label="TRY kâr hesabı"]')?.textContent,/Ödenmiş işletme gideri.*1\.200,00/);});
});
test('same-query refresh retains totals while failed new filters cannot show old totals or false empty',async()=>{
 let reads=0,reject!:(error:Error)=>void;
 await mounted(component(async()=>++reads===1?report:new Promise((_resolve,fail)=>{reject=fail})),{canRead:true,scopeKey:'store:actor'},async(host,window)=>{
  await flush();const cards=host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]');await click(host,'Yenile');assert.equal(host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]'),cards);await act(async()=>reject(new Error('offline')));assert.equal(host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]'),cards);
  await fill(host.querySelector('input[name="dateFrom"]'),'2026-09-01');await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]'),null);await act(async()=>reject(new Error('offline')));assert.equal(host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]'),null);assert.doesNotMatch(host.textContent,/Bu dönemde muhasebe hareketi yok/);assert.ok(host.querySelector('[role="alert"]'));
 });
});
test('report uses applied date and currency filters only and keeps invalid drafts for correction',async()=>{
 const requests:any[]=[];
 await mounted(component(async filters=>{requests.push(filters);return{...report,dateFrom:filters.dateFrom,dateTo:filters.dateTo}}),{canRead:true,scopeKey:'store:actor'},async(host,window)=>{
  await flush();await fill(host.querySelector('input[name="dateFrom"]'),'2026-10-15');await fill(host.querySelector('input[name="dateTo"]'),'2026-10-01');await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,1);assert.equal(host.querySelector('input[name="dateFrom"]').value,'2026-10-15');assert.ok(host.querySelector('[role="alert"]'));
  await fill(host.querySelector('input[name="dateFrom"]'),'2026-09-01');await fill(host.querySelector('input[name="dateTo"]'),'2026-09-30');await fill(host.querySelector('input[name="currency"]'),'eur');await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await flush();assert.deepEqual(requests.at(-1),{dateFrom:'2026-09-01',dateTo:'2026-09-30',currency:'EUR'});
 });
});
test('empty report has one useful next action and denied roles perform no report reads',async()=>{
 await mounted(component(async()=>({...report,currencies:[]})),{canRead:true,scopeKey:'store:actor'},async host=>{await flush();assert.match(host.textContent,/Bu dönemde muhasebe hareketi yok/);assert.equal(host.querySelector('dl[aria-label="Satış, tahsilat ve kâr"]'),null);});
 let calls=0;await mounted(component(async()=>{calls++;return report}),{canRead:false,scopeKey:'store:actor'},async host=>{await flush();assert.equal(calls,0);assert.match(host.textContent,/mağaza yöneticisi yetkisi/);assert.equal(host.querySelector('form'),null);});
});
test('zero cash outflows do not show a misleading minus zero',async()=>{
 await mounted(component(async()=>report),{canRead:true,scopeKey:'store:actor'},async host=>{await flush();assert.doesNotMatch(host.textContent,/-₺0,00/);});
});
