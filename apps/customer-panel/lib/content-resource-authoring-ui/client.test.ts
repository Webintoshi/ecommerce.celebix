import assert from'node:assert/strict';
import test from'node:test';
import{createContentResourceAuthoringClient}from'./client.ts';
const id='11111111-1111-4111-8111-111111111111';
const request={target:{kind:'page',draftId:id,recordId:null,recordVersion:null},currentDraft:{name:'Page',slug:'page',locale:'tr',body:'',excerpt:null,seoTitle:null,seoDescription:null,published:false,status:'draft'},locale:'tr',tone:'neutral',length:'short',note:'',researchOperationId:null,stage:'outline',topic:'Konu',purpose:'Özet'}as const;
const generation={id,target:request.target,stage:'outline',status:'completed',outline:{title:'Konu',sections:[{heading:'Giriş',points:[]}]},draft:null,sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z',finishedAt:'2026-09-29T00:00:01.000Z'};
test('resource client sends explicit idempotency key and parses only safe view',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const client=createContentResourceAuthoringClient((async(url,init)=>{calls.push({url:String(url),init:init??{}});return Response.json({generation});}) as typeof fetch);
 assert.deepEqual(await client.generate(request,id),generation);
 assert.deepEqual(await client.get(id),generation);
 assert.equal(calls[0]?.url,'/api/content-resource-authoring');assert.equal(calls[0]?.init.method,'POST');
 assert.equal(new Headers(calls[0]?.init.headers).get('idempotency-key'),id);
 assert.equal(calls[1]?.url,`/api/content-resource-authoring/${id}`);
});
test('resource client does not reinterpret a failed response as a usable draft',async()=>{
 const client=createContentResourceAuthoringClient((async()=>Response.json({code:'feature_not_enabled'},{status:503})) as typeof fetch);
 await assert.rejects(client.generate(request,id),{code:'feature_not_enabled'});
});
