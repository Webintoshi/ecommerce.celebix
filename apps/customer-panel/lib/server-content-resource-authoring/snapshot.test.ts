import assert from 'node:assert/strict';
import test from 'node:test';
import{createHash}from'node:crypto';
import type {ContentResourceAuthoringRequest, MerchantContentDocument} from '@celebix/saas-contracts';
import {buildContentResourceSnapshot} from './snapshot.ts';

const id='11111111-1111-4111-8111-111111111111';
const values={name:'Rehber',slug:'rehber',locale:'tr',body:'<p>14 ayar altın 2,28 gram.</p>',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft' as const};
const request:ContentResourceAuthoringRequest={target:{kind:'blog_post',draftId:id,recordId:null,recordVersion:null},currentDraft:values,locale:'tr',tone:'neutral',length:'medium',note:'',researchOperationId:null,stage:'outline',topic:'Bakım',purpose:'Bilgilendirme'};
const sourceText='Altın bakımında su kullanımı.';
const source={id,originalUrl:'https://example.org/research',finalUrl:'https://example.org/research',title:'Kaynak',fetchedAt:'2026-09-29T00:00:00.000Z',contentSha256:createHash('sha256').update(sourceText).digest('hex'),extractedText:sourceText,byteCount:40};
test('snapshot fingerprints unsaved form, reviewed outline and exact retained research evidence',()=>{
 const first=buildContentResourceSnapshot(request,null,[]);
 assert.match(first.sourceFingerprint,/^[0-9a-f]{64}$/);
 assert.equal(first.sourceFingerprint,buildContentResourceSnapshot(request,null,[]).sourceFingerprint);
 assert.notEqual(first.sourceFingerprint,buildContentResourceSnapshot({...request,note:'Yeni not'},null,[]).sourceFingerprint);
 assert.notEqual(first.sourceFingerprint,buildContentResourceSnapshot({...request,currentDraft:{...values,body:'<p>Farklı</p>'}},null,[]).sourceFingerprint);
 assert.notEqual(first.sourceFingerprint,buildContentResourceSnapshot({...request,researchOperationId:id},null,[source]).sourceFingerprint);
 assert.equal((first.input as any).currentDraft.body,values.body);
 assert.throws(()=>buildContentResourceSnapshot({...request,researchOperationId:id},null,[{...source,extractedText:'Değiştirilen kaynak.'}]));
});
test('snapshot rejects mismatched saved document and locale instead of substituting stored text',()=>{
 const saved={...values,id,kind:'blog_post' as const,version:2,publishedAt:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',bodyFormat:'normalized_html' as const,bodyDigest:'sha256:'+'a'.repeat(64),origins:{}} satisfies MerchantContentDocument;
 const edit={...request,target:{...request.target,recordId:id,recordVersion:2}};
 assert.equal((buildContentResourceSnapshot(edit,saved,[]).input as any).currentDraft.body,values.body);
 assert.throws(()=>buildContentResourceSnapshot({...edit,target:{...edit.target,recordVersion:1}},saved,[]));
 assert.throws(()=>buildContentResourceSnapshot({...edit,locale:'en'},saved,[]));
 assert.throws(()=>buildContentResourceSnapshot(edit,null,[]));
 assert.throws(()=>buildContentResourceSnapshot(request,saved,[]));
});
