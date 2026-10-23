import assert from 'node:assert/strict';
import test from 'node:test';

const api=await import('./index.ts').catch(()=>null);
const ID='11111111-1111-4111-8111-111111111111',VARIANT='22222222-2222-4222-8222-222222222222';
function contract(){assert.ok(api,'product tax contracts must exist');return api;}

test('tax choices distinguish configured taxable, exempt and unknown without coercion',()=>{
 const {parseProductTaxChoice}=contract();
 for(const rateBps of[0,100,500,1000,1800,2000,10000])assert.deepEqual(parseProductTaxChoice({treatment:'taxable',rateBps}),{treatment:'taxable',rateBps});
 assert.deepEqual(parseProductTaxChoice({treatment:'exempt',rateBps:null}),{treatment:'exempt',rateBps:null});
 for(const invalid of[null,undefined,{},[],{treatment:'taxable',rateBps:null},{treatment:'taxable',rateBps:'2000'},{treatment:'taxable',rateBps:-1},{treatment:'taxable',rateBps:10001},{treatment:'taxable',rateBps:1.5},{treatment:'exempt',rateBps:0},{treatment:'taxable',rateBps:2000,storeId:ID}])assert.throws(()=>parseProductTaxChoice(invalid));
 const accessor={treatment:'taxable',get rateBps(){throw Error('must not execute getters');}};
 assert.throws(()=>parseProductTaxChoice(accessor),/product_tax_contract_invalid/);
});
test('gross tax splits use exact integer rounding and preserve the saved gross price',()=>{
 const {splitProductTaxGross,addProductTaxToNet}=contract();
 assert.deepEqual(splitProductTaxGross(12000,{treatment:'taxable',rateBps:2000}),{grossCents:12000,baseCents:10000,taxCents:2000});
 assert.deepEqual(splitProductTaxGross(1,{treatment:'taxable',rateBps:10000}),{grossCents:1,baseCents:0,taxCents:1});
 assert.deepEqual(splitProductTaxGross(1999,{treatment:'taxable',rateBps:2000}),{grossCents:1999,baseCents:1666,taxCents:333});
 for(const tax of[{treatment:'exempt',rateBps:null},{treatment:'taxable',rateBps:0}]as const)assert.deepEqual(splitProductTaxGross(1999,tax),{grossCents:1999,baseCents:1999,taxCents:0});
 const gross=Number.MAX_SAFE_INTEGER,result=splitProductTaxGross(gross,{treatment:'taxable',rateBps:2000});
 assert.equal(result.taxCents,Number((BigInt(gross)*2000n+6000n)/12000n));assert.equal(result.baseCents+result.taxCents,gross);
 assert.equal(addProductTaxToNet(10001,{treatment:'taxable',rateBps:2000}),12001);
 for(const value of[-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>splitProductTaxGross(value,{treatment:'taxable',rateBps:2000}));
 assert.throws(()=>addProductTaxToNet(Number.MAX_SAFE_INTEGER,{treatment:'taxable',rateBps:2000}));
});
test('variant null inherits a configured product and never turns unknown into zero',()=>{
 const {resolveProductTax}=contract(),tax={treatment:'taxable',rateBps:2000}as const,exempt={treatment:'exempt',rateBps:null}as const;
 assert.equal(resolveProductTax(null,null),null);assert.deepEqual(resolveProductTax(tax,null),tax);assert.deepEqual(resolveProductTax(tax,exempt),exempt);
});
test('dedicated tax reads preserve versions, explicit inheritance and unknown while rejecting inconsistent projections',()=>{
 const {parseProductTaxRead}=contract(),tax={treatment:'taxable',rateBps:2000};
 const value={productId:ID,productVersion:2,tax,variants:[{variantId:VARIANT,variantVersion:3,tax:null,effectiveTax:tax,taxSource:'product'}]};
 assert.deepEqual(parseProductTaxRead(value),value);
 assert.deepEqual(parseProductTaxRead({...value,tax:null,variants:[{...value.variants[0],effectiveTax:null,taxSource:'unknown'}]}).tax,null);
 for(const invalid of[{...value,variants:[{...value.variants[0],taxSource:'variant'}]},{...value,variants:[{...value.variants[0],effectiveTax:null}]},{...value,variants:[value.variants[0],value.variants[0]]},{...value,productVersion:0},{...value,extra:true}])assert.throws(()=>parseProductTaxRead(invalid));
});
