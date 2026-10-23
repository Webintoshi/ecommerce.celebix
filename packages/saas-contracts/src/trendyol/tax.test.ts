import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from './index.ts';
const ID='11111111-1111-4111-8111-111111111111';
test('Trendyol supports only explicit canonical VAT rates and preserves exempt versus zero-rated tax',()=>{
 const {trendyolVatRate,trendyolTaxIssue}=api as any;assert.equal(typeof trendyolVatRate,'function');
 assert.equal(trendyolVatRate(null),null);assert.equal(trendyolTaxIssue(null),'tax_required');
 for(const rate of[0,1,10,20])assert.equal(trendyolVatRate({treatment:'taxable',rateBps:rate*100}),rate);
 assert.equal(trendyolVatRate({treatment:'exempt',rateBps:null}),0);assert.equal(trendyolTaxIssue({treatment:'taxable',rateBps:500}),'tax_unsupported');
});
test('VAT product reads are opt-in while the legacy exact product parser remains unchanged',()=>{
 const row={productId:ID,variantId:ID,title:'Product',sku:null,barcode:null,webPriceCents:10000,quantity:1,mapping:null,status:'not_configured',issue:null,updatedAt:'2026-10-23T10:00:00Z'},legacy={items:[row],nextCursor:null};
 assert.deepEqual(api.parseTrendyolProducts(legacy),legacy);
 const parse=(api as any).parseTrendyolTaxProducts;assert.equal(typeof parse,'function');
 const value={items:[{...row,tax:null}],nextCursor:null};assert.deepEqual(parse(value),value);assert.throws(()=>api.parseTrendyolProducts(value));assert.throws(()=>parse(legacy));
 assert.deepEqual(parse({items:[{...row,tax:{treatment:'exempt',rateBps:null}}],nextCursor:null}).items[0].tax,{treatment:'exempt',rateBps:null});
 let invoked=false;const accessor={...row};Object.defineProperty(accessor,'tax',{enumerable:true,get(){invoked=true;return null;}});assert.throws(()=>parse({items:[accessor],nextCursor:null}));assert.equal(invoked,false);
});
