import assert from 'node:assert/strict';
import test from 'node:test';
import { assertToshiGeneratedLimits, automaticFieldActions, selectedContentCreditCost } from './toshi-policy.ts';
const request={fields:['description','seoTitle','seoDescription'],currentDraft:{description:'<p><br></p>',seoTitle:'Mevcut başlık',seoDescription:''}} as any;
test('empty markup generates while existing selected SEO optimizes independently',()=>{
 assert.deepEqual(automaticFieldActions(request),{description:'create',seoTitle:'improve',seoDescription:'create'});
 assert.deepEqual(automaticFieldActions({...request,fields:['seoDescription']}),{seoDescription:'create'});
});
test('only selected outputs contribute fixed credit charges',()=>{
 assert.equal(selectedContentCreditCost(['description']),7);
 assert.equal(selectedContentCreditCost(['seoTitle','seoDescription']),3);
 assert.equal(selectedContentCreditCost(['description','seoTitle','seoDescription']),10);
 assert.throws(()=>selectedContentCreditCost(['description','description'] as any));
});
test('generated limits count Unicode characters and accept exact boundaries',()=>{
 assert.doesNotThrow(()=>assertToshiGeneratedLimits({seoTitle:'İ'.repeat(60),seoDescription:'ş'.repeat(160)} as any));
 assert.throws(()=>assertToshiGeneratedLimits({seoTitle:'İ'.repeat(61)} as any));
 assert.throws(()=>assertToshiGeneratedLimits({seoDescription:'ş'.repeat(161)} as any));
});
test('description maximum is checked across structured blocks',()=>{
 assert.throws(()=>assertToshiGeneratedLimits({description:[{type:'paragraph',children:[{type:'text',text:Array(1001).fill('ürün').join(' ')}]}]} as any));
 assert.doesNotThrow(()=>assertToshiGeneratedLimits({description:[{type:'paragraph',children:[{type:'text',text:Array(1000).fill('ürün').join(' ')}]}]} as any));
});
