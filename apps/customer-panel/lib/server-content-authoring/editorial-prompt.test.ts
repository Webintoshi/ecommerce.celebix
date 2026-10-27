import assert from 'node:assert/strict';
import test from 'node:test';
import {validateProductDraftOutput}from'../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import type{ProductFactPacket}from'../../../../packages/saas-contracts/src/content-authoring/types.ts';
import {toshiProductCorrectionFeedback}from'./editorial-prompt.ts';

const packet:ProductFactPacket={title:'Erişte',sourceFingerprint:'a'.repeat(64),facts:[{ref:'product:title:0',field:'title',value:'Erişte',source:'current_draft',scope:'product'}]};
function rejected(field:'description'|'seoTitle',value:string):unknown{
 try{validateProductDraftOutput({[field]:field==='description'?[{type:'paragraph',children:[{type:'text',text:value}]}]:value,suggestions:[],claims:[],sourceFingerprint:packet.sourceFingerprint},packet,[field]);}catch(error){return error;}
 throw Error('fixture must be rejected');
}
test('description grounding correction includes only the actual trusted issue and selected fields',()=>{
 const feedback=JSON.parse(toshiProductCorrectionFeedback('contract_or_grounding',['description'],rejected('description','Organik ürün.')));
 assert.deepEqual(feedback.selectedFields,['description']);assert.deepEqual(feedback.issue,{reason:'critical_term',field:'description',blockIndex:0,tokens:['organik']});assert.equal(feedback.fieldNote,undefined);
 assert.equal(Object.hasOwn(feedback,'stack'),false);assert.equal(Object.hasOwn(feedback,'message'),false);
});
test('the SEO-specific hint is emitted only for an actual selected SEO grounding issue',()=>{
 const error=rejected('seoTitle','Organik Erişte');
 const feedback=JSON.parse(toshiProductCorrectionFeedback('contract_or_grounding',['seoTitle'],error));
 assert.equal(feedback.fieldNote,'seo_product_scope_only');assert.deepEqual(feedback.issue,{reason:'critical_term',field:'seoTitle',blockIndex:null,tokens:['organik']});
 const unrelated=JSON.parse(toshiProductCorrectionFeedback('contract_or_grounding',['description'],error));assert.equal(unrelated.fieldNote,undefined);assert.equal(unrelated.issue,undefined);
});
test('arbitrary error properties and copied issue data cannot become correction instructions',()=>{
 const forged=Object.assign(new TypeError('PRIVATE_PROVIDER_TEXT'),{field:'seoTitle',reason:'critical_term',tokens:['PRIVATE_SECRET'],blockIndex:null,issue:{field:'description',tokens:['PRIVATE_TITLE']}});
 const feedback=JSON.parse(toshiProductCorrectionFeedback('contract_or_grounding',['description'],forged));
 assert.equal(feedback.issue,undefined);assert.equal(feedback.fieldNote,undefined);assert.deepEqual(feedback.selectedFields,['description']);assert.ok(!JSON.stringify(feedback).includes('PRIVATE_'));
 const syntax=JSON.parse(toshiProductCorrectionFeedback('json_syntax',['description','seoDescription']));assert.deepEqual(syntax.selectedFields,['description','seoDescription']);assert.equal(syntax.issue,undefined);
});
