import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_TRENDYOL_PRICING,calculateTrendyolPrice,parseTrendyolPricingRule} from './index.ts';

test('each seller protects the website amount with its own commission and shipping',()=>{
 for(const [commissionBps,salePriceCents]of[[1200,21591],[1700,22892],[2200,24359]]){
  const rule={...DEFAULT_TRENDYOL_PRICING,commissionBps,averageShippingCents:9000,withholdingBps:0};
  const result=calculateTrendyolPrice(10000,rule);
  assert.equal(result.salePriceCents,salePriceCents);
  assert.ok(result.expectedPaymentCents>=10000);
  assert.equal(result.salePriceCents-result.commissionCents-result.shippingCents,result.expectedPaymentCents);
 }
});
test('commission VAT and optional withholding coverage remain separate cash deductions',()=>{
 const rule={...DEFAULT_TRENDYOL_PRICING,commissionBps:1700,averageShippingCents:3000};
 const uncovered=calculateTrendyolPrice(10000,rule);
 assert.equal(uncovered.salePriceCents,15663);assert.equal(uncovered.expectedPaymentCents,9869);
 const covered=calculateTrendyolPrice(10000,{...rule,coverWithholding:true});
 assert.equal(covered.salePriceCents,15822);assert.equal(covered.expectedPaymentCents,10000);
 const separateVat=calculateTrendyolPrice(10000,{...rule,commissionVatIncluded:false,withholdingBps:0});
 assert.equal(separateVat.salePriceCents,16332);assert.ok(separateVat.commissionVatCents>0);assert.ok(separateVat.expectedPaymentCents>=10000);
});
test('upward rounding and all allowed money boundaries preserve the retained target',()=>{
 for(const rounding of['cent','lira','ninety'] as const){
  for(const price of[1,3,99,100,10001,99999999]){
   const rule={...DEFAULT_TRENDYOL_PRICING,commissionBps:2200,averageShippingCents:9000,otherFeeCents:132,coverWithholding:true,rounding};
   const result=calculateTrendyolPrice(price,rule);assert.ok(Number.isSafeInteger(result.salePriceCents));assert.ok(result.expectedPaymentCents>=price);
   if(rounding==='lira')assert.equal(result.salePriceCents%100,0);
   if(rounding==='ninety')assert.equal(result.salePriceCents%100,90);
  }
 }
});
test('invalid rates, non-integers, secrets, unsupported keys and unsafe money fail closed',()=>{
 for(const value of[NaN,Infinity,-1,0,0.1,Number.MAX_SAFE_INTEGER])assert.throws(()=>calculateTrendyolPrice(value,DEFAULT_TRENDYOL_PRICING));
 for(const rule of[{...DEFAULT_TRENDYOL_PRICING,commissionBps:10000},{...DEFAULT_TRENDYOL_PRICING,commissionBps:9000,commissionVatIncluded:false},{...DEFAULT_TRENDYOL_PRICING,averageShippingCents:-1},{...DEFAULT_TRENDYOL_PRICING,apiSecret:'unexpected'}])assert.throws(()=>parseTrendyolPricingRule(rule));
 assert.throws(()=>calculateTrendyolPrice(999999999999,{...DEFAULT_TRENDYOL_PRICING,commissionBps:9999,withholdingBps:0}));
 assert.deepEqual(parseTrendyolPricingRule(DEFAULT_TRENDYOL_PRICING),DEFAULT_TRENDYOL_PRICING);
});
