import assert from 'node:assert/strict';
import test from 'node:test';
import * as contracts from './index.ts';
const origin = { generationId: 'a0000000-0000-4000-8000-000000000001', draftId: 'b0000000-0000-4000-8000-000000000001' };
test('origin map accepts only exact own selected fields and UUID references, never caller authority', () => {
  const parse = contracts.parseContentAuthoringFieldOrigins;
  assert.equal(typeof parse, 'function');
  assert.deepEqual(parse({description:origin}, ['description']), {description:origin});
  assert.deepEqual(parse({seoTitle:null}, ['seoTitle','seoDescription']), {seoTitle:null});
  assert.deepEqual(parse({}), {});
  for (const value of [null, [], {x:null}, {description:{...origin,origin:'ai'}}, {description:{...origin,savedContentHash:'x'}}, {description:{...origin,draftId:'bad'}}, {description:undefined}, Object.create({description:origin})]) assert.throws(()=>parse(value));
  assert.throws(()=>parse({seoTitle:origin}, ['description']));
});

test('public V1 and V2 reject private origin references',async()=>{
 const {parsePublicProduct,parsePublicProductV2}=await import('../storefront/validation.ts');
 const product={id:origin.generationId,slug:'product',title:'Product',currency:'TRY',status:'active',priceCents:100,available:true,variants:[{id:origin.draftId,title:'Default',priceCents:100,stockTracking:false,stockQuantity:0,available:true,attributes:{}}],media:[]};
 assert.equal(parsePublicProduct(product).title,'Product');
 assert.equal(parsePublicProductV2({...product,seoTitle:null,seoDescription:null}).title,'Product');
 assert.throws(()=>parsePublicProduct({...product,contentOrigins:{description:origin}}));
 assert.throws(()=>parsePublicProductV2({...product,seoTitle:null,seoDescription:null,contentOrigins:{description:origin}}));
});

test('origin references reject accessors, symbols and nonenumerable properties without invoking getters', () => {
  let reads = 0;
  for (const nested of [false, true]) {
    for (const decorate of [
      (v: object) => Object.defineProperty(v, nested ? 'generationId' : 'description', { enumerable: true, configurable: true, get() { reads++; return nested ? origin.generationId : origin; } }),
      (v: object) => Object.defineProperty(v, 'hidden', { value: 'forbidden', enumerable: false }),
      (v: object) => Object.defineProperty(v, Symbol('hidden'), { value: 'forbidden', enumerable: true }),
    ]) {
      const value = nested ? { description: decorate({ ...origin }) } : decorate({ description: origin });
      assert.throws(() => contracts.parseContentAuthoringFieldOrigins(value), TypeError);
      assert.equal(reads, 0);
    }
  }
});
