import assert from 'node:assert/strict';
import test from 'node:test';
import {createProductValidationDiagnostic,reportProductValidationFailure}from'./validation-diagnostics.ts';

test('diagnostics contain only closed stages, attempt and bounded numeric counts',()=>{
 const diagnostic=createProductValidationDiagnostic({attempt:2,stage:'completeness',output:{text:'PRIVATE_OUTPUT'},parsed:{descriptionMarkdown:'PRIVATE_PRODUCT [[TOSHI_SOURCE_'+'a'.repeat(32)+'_0]]',seoTitle:'Şişe',seoDescription:'PRIVATE_META'},draft:{description:[{type:'heading',level:2,children:[{type:'text',text:'PRIVATE_HEADING'}]},{type:'paragraph',children:[{type:'text',text:'Bir ürün.'},{type:'fact',factRef:'PRIVATE_REF',value:'250',unit:'g'}]}]},sourceSlotsExpected:1});
 assert.ok(diagnostic);assert.equal(diagnostic.event,'toshi_product_validation_failed');assert.equal(diagnostic.attempt,2);assert.equal(diagnostic.stage,'completeness');
 assert.equal(diagnostic.counts.bodyWords,4);assert.equal(diagnostic.counts.h2Count,1);assert.equal(diagnostic.counts.seoTitleChars,4);assert.equal(diagnostic.counts.sourceSlotsExpected,1);assert.equal(diagnostic.counts.sourceMarkersFound,1);
 const serialized=JSON.stringify(diagnostic);for(const value of ['PRIVATE_OUTPUT','PRIVATE_PRODUCT','PRIVATE_META','PRIVATE_HEADING','PRIVATE_REF','TOSHI_SOURCE','stack'])assert.ok(!serialized.includes(value),value);
 assert.ok(Object.isFrozen(diagnostic));assert.ok(Object.isFrozen(diagnostic.counts));
 for(const counts of Object.values(diagnostic.counts))assert.ok(counts===null||Number.isSafeInteger(counts)&&counts>=0&&counts<=1_000_000);
});

test('untrusted getters, proxies, extra identifiers and arbitrary stages cannot reach a diagnostic sink',()=>{
 let accessed=0;const getter=Object.defineProperty({},'text',{enumerable:true,get(){accessed++;throw Error('PRIVATE');}}),proxy=new Proxy({},{getOwnPropertyDescriptor(){accessed++;throw Error('PRIVATE');}});
 const diagnostic=createProductValidationDiagnostic({attempt:1,stage:'writer_decode',output:getter,parsed:proxy,draft:proxy,sourceSlotsExpected:0,operationId:'PRIVATE_ID'}as never);
 assert.ok(diagnostic);assert.equal(diagnostic.counts.outputBytes,null);assert.equal(diagnostic.counts.bodyWords,null);assert.equal(accessed,0);assert.ok(!JSON.stringify(diagnostic).includes('PRIVATE_ID'));
 assert.equal(createProductValidationDiagnostic({attempt:3,stage:'writer_decode'}as never),null);assert.equal(createProductValidationDiagnostic({attempt:1,stage:'PRIVATE_ERROR_MESSAGE'}as never),null);
});

test('diagnostic logging is best effort and never propagates sink errors',async()=>{
 const input={attempt:1 as const,stage:'json_syntax' as const,output:{text:'PRIVATE'},sourceSlotsExpected:0};
 assert.doesNotThrow(()=>reportProductValidationFailure(input,()=>{throw Error('PRIVATE_ERROR');}));
 assert.doesNotThrow(()=>reportProductValidationFailure(input,async()=>{throw Error('PRIVATE_ERROR');}));await new Promise(resolve=>setImmediate(resolve));
});

test('diagnostic body and section counts ignore Unicode letter fillers and format controls',()=>{
 const invisible='\u115f \u1160 \u3164 \uffa0 \u200b \u0600';
 const diagnostic=createProductValidationDiagnostic({attempt:1,stage:'completeness',output:{text:''},sourceSlotsExpected:0,draft:{description:[
  {type:'heading',level:2,children:[{type:'text',text:invisible}]},
  {type:'paragraph',children:[{type:'text',text:'Erişte '+Array(180).fill(invisible).join(' ')}]},
  {type:'heading',level:2,children:[{type:'text',text:'Kullanım önerileri'}]},
 ]}});
 assert.ok(diagnostic);assert.equal(diagnostic.counts.bodyWords,1);assert.equal(diagnostic.counts.h2Count,1);
});
test('diagnostics preserve genuine Turkish and CJK word and heading counts',()=>{
 const diagnostic=createProductValidationDiagnostic({attempt:1,stage:'completeness',output:{text:''},sourceSlotsExpected:0,draft:{description:[
  {type:'heading',level:2,children:[{type:'text',text:'Ürünü tanıyın'}]},
  {type:'paragraph',children:[{type:'text',text:'Türkçe ürün açıklaması 商品 使用例'}]},
  {type:'heading',level:2,children:[{type:'text',text:'商品紹介'}]},
 ]}});
 assert.ok(diagnostic);assert.equal(diagnostic.counts.bodyWords,5);assert.equal(diagnostic.counts.h2Count,2);
});
