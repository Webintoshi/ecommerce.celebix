import assert from 'node:assert/strict';
import test from 'node:test';
import { assertToshiGeneratedLimits, assertProductWriterCompleteness, automaticFieldActions, selectedContentCreditCost } from './toshi-policy.ts';
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

const expandedDraft=(count:number)=>({description:[
 {type:'heading',level:2,children:[{type:'text',text:'Ürünü tanıyın'}]},
 {type:'paragraph',children:[{type:'text',text:Array(count).fill('ürün').join(' ')}]},
 {type:'heading',level:2,children:[{type:'text',text:'Kullanım önerileri'}]},
]} as any);
test('fresh product descriptions need 180 body words and two meaningful sections',()=>{
 assert.throws(()=>assertProductWriterCompleteness(expandedDraft(179)),/invalid_output/);
 assert.doesNotThrow(()=>assertProductWriterCompleteness(expandedDraft(180)));
 const noSections=expandedDraft(200);noSections.description=noSections.description.filter((b:any)=>b.type==='paragraph');
 assert.throws(()=>assertProductWriterCompleteness(noSections),/invalid_output/);
});
test('headings, invisible text and internal refs cannot fill the product body minimum',()=>{
 const candidate=expandedDraft(50);candidate.description[0].children[0].text=Array(200).fill('başlık').join(' ');
 candidate.description.push({type:'paragraph',children:[{type:'fact',factRef:Array(200).fill('metadata').join(' '),value:'Erişte'}]});
 assert.throws(()=>assertProductWriterCompleteness(candidate),/invalid_output/);
 const emptyHeadings=expandedDraft(180);emptyHeadings.description[0].children[0].text='\u200b';
 assert.throws(()=>assertProductWriterCompleteness(emptyHeadings),/invalid_output/);
});
test('SEO-only generation has no product-body minimum',()=>{
 assert.doesNotThrow(()=>assertProductWriterCompleteness({seoTitle:'Ürün adı',seoDescription:'Ürün açıklaması.'} as any));
});
