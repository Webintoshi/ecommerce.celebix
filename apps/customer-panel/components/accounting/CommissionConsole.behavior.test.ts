import assert from 'node:assert/strict';
import test from 'node:test';
import React,{act} from 'react';
import {compile,mounted,click,effectiveCss} from '../../lib/mira-final-test-support.ts';

const row={membershipId:'11111111-1111-4111-8111-111111111111',displayName:'Ayçin Çelebi',phoneMasked:'+90 ••••••• 9052',commissionEnabled:true,commissionRateBps:3500,completedSaleCount:2,merchandiseSalesCents:240000,returnAdjustmentCents:20000,collectionDiscountCents:20000,eligibleBaseCents:200000,earnedCommissionCents:5000};
const report={dateFrom:'2026-10-01',dateTo:'2026-10-17',basis:'net_product_sales',currency:'TRY',prospectiveOnly:true,rows:[row],totals:{completedSaleCount:2,merchandiseSalesCents:240000,returnAdjustmentCents:20000,collectionDiscountCents:20000,eligibleBaseCents:200000,earnedCommissionCents:5000}};
const flush=()=>act(async()=>{await new Promise(done=>setTimeout(done,0));});
async function fill(element:any,value:string){const key=Object.keys(element).find(k=>k.startsWith('__reactProps$'))!;await act(async()=>element[key].onChange({target:{value}}));}
function component(read:(filters:any,signal?:AbortSignal)=>Promise<unknown>){return compile('components/accounting/CommissionConsole.tsx',{'@/lib/accounting-ui/client':{accountingUi:{commissions:read}},'./CommissionPaymentsWorkspace':{CommissionPaymentsWorkspace:()=>null}}).CommissionConsole;}
test('commission report shows real staff identity, masked phone and authoritative snapshot earnings without recalculating from current rate',async()=>{
 let calls=0;
 await mounted(component(async()=>{calls++;return report;}),{canRead:true,scopeKey:'store:manager'},async host=>{
  await flush();assert.equal(calls,1);assert.match(host.textContent,/Ayçin Çelebi/);assert.match(host.textContent,/9052/);
  assert.match(host.querySelector('tbody')?.textContent,/₺50,00/);assert.match(host.querySelector('tbody')?.textContent,/%35/);
  assert.doesNotMatch(host.querySelector('tbody')?.textContent,/₺700,00/);assert.match(host.textContent,/Kargo/);assert.match(host.textContent,/[İi]ade/u);assert.match(host.textContent,/[İi]skonto/u);
  assert.equal(host.querySelector('h1')?.className,'sr-only');assert.equal(host.querySelectorAll('button').length,2);assert.equal(host.querySelector('input[name="currency"]'),null);
 });
});
test('commission filters default to current month, reject over 366 days and preserve invalid drafts',async()=>{
 const requests:any[]=[];
 await mounted(component(async filters=>{requests.push(filters);return{...report,...filters};}),{canRead:true,scopeKey:'store:manager'},async(host,window)=>{
  await flush();const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'});assert.deepEqual(requests[0],{dateFrom:today.slice(0,7)+'-01',dateTo:today});
  await fill(host.querySelector('[name="dateFrom"]'),'2025-01-01');await fill(host.querySelector('[name="dateTo"]'),'2026-10-17');
  await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests.length,1);assert.match(host.querySelector('[role="alert"]')?.textContent,/366/);assert.equal(host.querySelector('[name="dateFrom"]').value,'2025-01-01');
  await fill(host.querySelector('[name="dateFrom"]'),'2026-09-01');await fill(host.querySelector('[name="dateTo"]'),'2026-09-30');await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await flush();assert.deepEqual(requests.at(-1),{dateFrom:'2026-09-01',dateTo:'2026-09-30'});
 });
});
test('same-period refresh preserves report while a failed new period never displays previous earnings or a false empty state',async()=>{
 let count=0,reject!:(error:Error)=>void;
 await mounted(component(async filters=>++count===1?{...report,...filters}:new Promise((_resolve,fail)=>{reject=fail;})),{canRead:true,scopeKey:'store:manager'},async(host,window)=>{
  await flush();const table=host.querySelector('table');await click(host,'Yenile');assert.equal(host.querySelector('table'),table);await act(async()=>reject(new Error('offline')));assert.equal(host.querySelector('table'),table);
  await fill(host.querySelector('[name="dateFrom"]'),'2026-09-01');await fill(host.querySelector('[name="dateTo"]'),'2026-09-30');await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(host.querySelector('table'),null);await act(async()=>reject(new Error('offline')));assert.equal(host.querySelector('table'),null);assert.doesNotMatch(host.textContent,/Bu dönemde prim kaydı yok/);assert.ok(host.querySelector('[role="alert"]'));
 });
});
test('denied commission viewers perform no reads and empty manager report has no fabricated earnings',async()=>{
 let reads=0;await mounted(component(async()=>{reads++;return report;}),{canRead:false,scopeKey:'store:cashier'},async host=>{await flush();assert.equal(reads,0);assert.equal(host.querySelector('form'),null);assert.match(host.textContent,/mağaza sahibi veya yönetici/);});
 await mounted(component(async()=>({...report,rows:[],totals:{...report.totals,completedSaleCount:0,merchandiseSalesCents:0,returnAdjustmentCents:0,collectionDiscountCents:0,eligibleBaseCents:0,earnedCommissionCents:0}})),{canRead:true,scopeKey:'store:manager'},async host=>{await flush();assert.match(host.textContent,/Bu dönemde prim kaydı yok/);assert.equal(host.querySelector('table'),null);});
});
test('commission table becomes bounded labelled cards on small screens',()=>{
 for(const width of[390,1024,1440]){
  const table=effectiveCss('components/accounting/commissions.module.css','<table class="table"><tbody><tr><td data-label="Kasiyer">Ayçin</td></tr></tbody></table>','.table',width);
  assert.equal(table.width,'100%');assert.equal(table.minWidth,'0');if(width===390)assert.equal(table.display,'block');
 }
});
