import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';

test('product VAT selection distinguishes missing, taxable zero and exemption without inventing a rate',async()=>{
 assert.ok(existsSync(new URL('./product-tax.ts',import.meta.url)),'Product VAT form model is missing');
 const {taxFromChoice,taxChoice,taxLabel}=await import('./product-tax.ts');
 assert.equal(taxFromChoice(''),null);assert.deepEqual(taxFromChoice('0'),{treatment:'taxable',rateBps:0});assert.deepEqual(taxFromChoice('exempt'),{treatment:'exempt',rateBps:null});
 assert.deepEqual(taxFromChoice('2000'),{treatment:'taxable',rateBps:2000});assert.equal(taxChoice(null),'');assert.equal(taxChoice({treatment:'taxable',rateBps:0}),'0');
 assert.equal(taxLabel(null),'KDV belirtilmedi');assert.equal(taxLabel({treatment:'taxable',rateBps:0}),'KDV %0');assert.equal(taxLabel({treatment:'exempt',rateBps:null}),'KDV muaf');
 for(const value of ['-1','1.5','10001','secret'])assert.throws(()=>taxFromChoice(value));
});
test('tax changes preserve gross entry while explicit excluded entry shows the final charged amount with integer rounding',async()=>{
 assert.ok(existsSync(new URL('./product-tax.ts',import.meta.url)),'Product VAT form model is missing');
 const {sellingPriceCents,effectiveTax}=await import('./product-tax.ts');const twenty={treatment:'taxable' as const,rateBps:2000},ten={treatment:'taxable' as const,rateBps:1000};
 assert.equal(sellingPriceCents(10000,'included',twenty),10000);assert.equal(sellingPriceCents(10000,'included',ten),10000);assert.equal(sellingPriceCents(10000,'included',null),10000);
 assert.equal(sellingPriceCents(10000,'excluded',twenty),12000);assert.equal(sellingPriceCents(101,'excluded',{treatment:'taxable',rateBps:1000}),111);assert.equal(sellingPriceCents(10000,'excluded',{treatment:'exempt',rateBps:null}),10000);
 assert.equal(sellingPriceCents(10000,'excluded',null),null);assert.deepEqual(effectiveTax(twenty,null),twenty);assert.deepEqual(effectiveTax(twenty,ten),ten);assert.equal(effectiveTax(null,null),null);
});
test('variant form tax edits preserve gross and cost while null override inherits and explicit excluded entry uses product VAT',async()=>{
 const {buildVariantUpdatePayload}=await import('./forms.ts');
 const row={title:'M',sku:'SKU-1',barcode:'',price:'100,00',compareAt:'',cost:'40,00',stockTracking:true,stockQuantity:'2'};
 const changed=buildVariantUpdatePayload({...row,taxChoice:'1000'},3,{});assert.equal(changed.ok,true);if(changed.ok){assert.deepEqual(changed.value.variant.tax,{treatment:'taxable',rateBps:1000});assert.equal(changed.value.variant.priceCents,10000);assert.equal(changed.value.variant.costCents,4000);}
 const inherited=buildVariantUpdatePayload({...row,taxChoice:'',priceBasis:'excluded',productTax:{treatment:'taxable',rateBps:2000}},3,{});assert.equal(inherited.ok,true);if(inherited.ok){assert.equal(inherited.value.variant.tax,null);assert.equal(inherited.value.variant.priceCents,12000);}
 const ordinary=buildVariantUpdatePayload(row,3,{});assert.equal(ordinary.ok,true);if(ordinary.ok)assert.equal(Object.hasOwn(ordinary.value.variant,'tax'),false);
});
test('an invalid explicit variant VAT never previews as product inheritance',async()=>{
 const model=await import('./product-tax.ts');
 assert.equal(typeof model.effectiveTaxForChoice,'function');
 const product={treatment:'taxable' as const,rateBps:2000};
 assert.deepEqual(model.effectiveTaxForChoice(product,''),product);
 assert.equal(model.effectiveTaxForChoice(product,'custom:'),null);
 assert.equal(model.effectiveTaxForChoice(product,'custom:101'),null);
 assert.deepEqual(model.effectiveTaxForChoice(product,'0'),{treatment:'taxable',rateBps:0});
});
