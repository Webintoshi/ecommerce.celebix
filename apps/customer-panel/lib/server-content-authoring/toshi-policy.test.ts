import assert from 'node:assert/strict';
import test from 'node:test';
import { assertToshiGeneratedLimits, assertProductWriterCompleteness, automaticFieldActions, selectedContentCreditCost } from './toshi-policy.ts';
import type {ProductFactPacket}from'../../../../packages/saas-contracts/src/content-authoring/types.ts';
import {validateProductDraftOutput}from'../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import {createProductWriterProtocol}from'./writer-protocol.ts';
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

const writerPacket:ProductFactPacket={title:'Erişte',sourceFingerprint:'a'.repeat(64),facts:[{ref:'product:title:0',field:'title',value:'Erişte',scope:'product',source:'current_draft'}]};
function decodedDescription(descriptionMarkdown:string){
 const writer=createProductWriterProtocol({packet:writerPacket,fields:['description'],nonce:'a'.repeat(32)});
 const draft=validateProductDraftOutput(writer.decode({descriptionMarkdown}),writerPacket,['description']);
 assertToshiGeneratedLimits(draft);return draft;
}
test('invisible Unicode letter padding cannot complete a decoded and grounded thin description',()=>{
 for(const filler of ['\u115f','\u1160','\u3164','\uffa0']){
  const draft=decodedDescription('Erişte.\n\n## Ürün\n\n'+Array(180).fill(filler).join(' ')+'\n\n## Kullanım\n\nErişte.');
  assert.throws(()=>assertProductWriterCompleteness(draft),/invalid_output/,JSON.stringify(filler));
 }
});
test('invisible Unicode letter headings cannot supply meaningful sections in a decoded description',()=>{
 for(const filler of ['\u115f','\u1160','\u3164','\uffa0']){
  const draft=decodedDescription('## '+filler+'\n\n'+Array(180).fill('ürün').join(' ')+'\n\n## \u200b'+filler);
  assert.throws(()=>assertProductWriterCompleteness(draft),/invalid_output/,JSON.stringify(filler));
 }
});
test('normal Turkish and genuine CJK words retain their existing completeness counts',()=>{
 for(const [word,firstHeading,lastHeading]of [['ürün','Ürünü tanıyın','Kullanım önerileri'],['商品','商品紹介','使用例']]){
  const markdown=(count:number)=>'## '+firstHeading+'\n\n'+Array(count).fill(word).join(' ')+'\n\n## '+lastHeading;
  assert.throws(()=>assertProductWriterCompleteness(decodedDescription(markdown(179))),/invalid_output/);
  assert.doesNotThrow(()=>assertProductWriterCompleteness(decodedDescription(markdown(180))));
 }
});
