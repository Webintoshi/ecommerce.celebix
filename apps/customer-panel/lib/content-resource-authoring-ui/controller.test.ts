import assert from'node:assert/strict';
import test from'node:test';
import type{ContentResourceAuthoringRequest,ContentResourceGenerationView,MerchantContentOrigins,MerchantContentValues}from'@celebix/saas-contracts';
import{captureContentResourceApplyContext,applyContentResourceDraft,manualContentFieldEdit}from'./controller.ts';
const id='11111111-1111-4111-8111-111111111111';
const values:MerchantContentValues={name:'Bakım',slug:'bakim',locale:'tr',body:'<p>Eski metin.</p>',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft'};
const request:ContentResourceAuthoringRequest={target:{kind:'page',draftId:id,recordId:null,recordVersion:null},currentDraft:values,locale:'tr',tone:'neutral',length:'short',note:'',researchOperationId:null,stage:'draft',action:'improve',fields:['body','seoTitle'],reviewedOutline:null,outlineGenerationId:null,selection:null};
const generation:ContentResourceGenerationView={id,target:request.target,stage:'draft',status:'completed',outline:null,draft:{sourceFingerprint:'a'.repeat(64),values:{body:'<p>Yeni metin.</p>',seoTitle:'Yeni başlık'},citations:[],suggestions:[]},sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',finishedAt:'2026-09-29T00:00:01.000Z'};
test('Apply changes only reviewed selected fields and records matching AI origin',()=>{
 const context=captureContentResourceApplyContext(request);
 const result=applyContentResourceDraft({context,currentRequest:request,currentValues:values,origins:{},generation,selectedFields:['seoTitle']});
 assert.equal(result.values.body,values.body);assert.equal(result.values.seoTitle,'Yeni başlık');
 assert.deepEqual(result.origins,{seoTitle:{generationId:id,state:'ai'}});
});
test('pending form, locale, target, outline or research edits make Apply stale',()=>{
 const context=captureContentResourceApplyContext(request);
 for(const change of [{currentDraft:{...values,body:'<p>Başka</p>'}},{locale:'en'},{target:{...request.target,draftId:'22222222-2222-4222-8222-222222222222'}},{note:'Yeni talimat'},{researchOperationId:'22222222-2222-4222-8222-222222222222'}])assert.throws(()=>applyContentResourceDraft({context,currentRequest:{...request,...change}as ContentResourceAuthoringRequest,currentValues:values,origins:{},generation,selectedFields:['body']}));
});
test('manual edit marks AI text edited and undo restores matching in-session AI classification',()=>{
 const origins:MerchantContentOrigins={body:{generationId:id,state:'ai'}};
 assert.deepEqual(manualContentFieldEdit(origins,'body','<p>Farklı</p>','<p>Yeni metin.</p>'),{body:{generationId:id,state:'edited_ai'}});
 assert.deepEqual(manualContentFieldEdit({body:{generationId:id,state:'edited_ai'}},'body','<p>Yeni metin.</p>','<p>Yeni metin.</p>'),origins);
});
