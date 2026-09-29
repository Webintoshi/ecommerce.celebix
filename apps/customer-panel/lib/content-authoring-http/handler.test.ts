import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentAuthoringHttpHandlers } from './handler.ts';
const ID='72000000-0000-4000-8000-000000000001',NOW=new Date('2026-09-29T00:00:00.000Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
const body={draftId:ID,productId:null,productVersion:null,profileVersion:null,currentDraft:{title:'Draft'},action:'create',fields:['description'],locale:'tr',tone:'neutral',length:'short',note:'',selection:null};
const generation={id:ID,draftId:ID,productId:null,status:'pending',draft:null,sourceFingerprint:'a'.repeat(64),usage:null,safeCode:null,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString(),finishedAt:null,secret:'never-public',provider:'deepseek'};
function fixture(enabled=true,error?:unknown,requestBudgetMs?:number){let calls=0;const h=createContentAuthoringHttpHandlers({resolveRuntime:async()=>({access:{panelOrigin:'https://panel.saas-staging.celebix.site',resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:ID,slug:'fixture',status:'active'},membership:{status:'active',role:'editor'}}})},enabled:()=>enabled,service:{generateContent:async()=>{calls++;if(error)throw error;return generation;},getGeneration:async()=>{calls++;if(error)throw error;return generation;}}}as any),now:()=>NOW,requestId:()=>ID,requestBudgetMs}as any);return {h,count:()=>calls};}
function req(value:unknown=body,headers:HeadersInit={},get=false){return new Request('http://customer-panel:3400/api/content-ai/generations'+(get?'/'+ID:''),{method:get?'GET':'POST',headers:{cookie:`__Host-celebix_panel=${COOKIE}`,origin:'https://fixture.admin.saas-staging.celebix.site','content-type':'application/json','idempotency-key':ID,...Object.fromEntries(new Headers(headers))},...(get?{}:{body:JSON.stringify(value)})});}
test('generation responses expose only strict view and are not cached',async()=>{const f=fixture();const r=await f.h.post(req());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const v=await r.json();assert.equal(v.generation.provider,undefined);assert.equal(v.generation.secret,undefined);assert.equal(v.generation.id,ID);});
test('client store provider secrets and oversized body fail before service',async()=>{for(const extra of [{storeId:ID},{provider:'openai'},{secret:'secret'},{history:[]}]){const f=fixture();assert.equal((await f.h.post(req({...body,...extra}))).status,400);assert.equal(f.count(),0);}const f=fixture();assert.equal((await f.h.post(req({...body,note:'x'.repeat(50000)}))).status,400);assert.equal(f.count(),0);});
test('rollout disabled blocks both methods before repository or provider calls',async()=>{const f=fixture(false);for(const r of [await f.h.post(req()),await f.h.get(req(body,{},true),{params:Promise.resolve({id:ID})})]){assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'feature_unavailable'});}assert.equal(f.count(),0);});
test('foreign product or generation authority error returns denied',async()=>{const f=fixture(true,Object.assign(Error('SECRET'),{code:'membership_denied'}));assert.equal((await f.h.post(req({...body,productId:ID,productVersion:1,profileVersion:1}))).status,403);assert.equal((await f.h.get(req(body,{},true),{params:Promise.resolve({id:ID})})).status,403);});
test('operation missing and busy produce actionable safe HTTP outcomes',async()=>{for(const [code,status] of [['operation_not_found',404],['operation_busy',409],['invalid_output',502]] as const){const f=fixture(true,Object.assign(Error('SECRET'),{code}));const r=await f.h.post(req());assert.equal(r.status,status);assert.deepEqual(await r.json(),{code});}});
test('cross origin and forged authority headers are denied before service',async()=>{for(const [headers,status] of [[{origin:'https://evil.test'},403],[{'x-store-id':ID},400],[{cookie:''},401]] as const){const f=fixture();assert.equal((await f.h.post(req(body,headers))).status,status);assert.equal(f.count(),0);}});

test('unfinished request body reaches endpoint deadline without authoring',async()=>{
 let cancelled=false;const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('{"draftId":'));setTimeout(()=>{try{c.close();}catch{}},100);},cancel(){cancelled=true;}});
 const r=new Request('http://customer-panel:3400/api/content-ai/generations',{method:'POST',headers:req().headers,body:stream,duplex:'half'}as RequestInit);
 const f=fixture(true,undefined,30);const start=performance.now();const response=await f.h.post(r);
 assert.equal(response.status,504);assert.deepEqual(await response.json(),{code:'provider_timeout'});assert.equal(f.count(),0);assert.equal(cancelled,true);assert.ok(performance.now()-start<300);
});
test('client abort cancels unfinished body without authoring',async()=>{
 let cancelled=false;const controller=new AbortController();const stream=new ReadableStream<Uint8Array>({start(c){setTimeout(()=>{try{c.close();}catch{}},100);},cancel(){cancelled=true;}});
 const r=new Request('http://customer-panel:3400/api/content-ai/generations',{method:'POST',headers:req().headers,body:stream,duplex:'half',signal:controller.signal}as RequestInit);
 const f=fixture();const pending=f.h.post(r);setTimeout(()=>controller.abort(),15);const response=await pending;
 assert.equal(response.status,499);assert.deepEqual(await response.json(),{code:'cancelled'});assert.equal(f.count(),0);assert.equal(cancelled,true);
});
test('unresponsive initial runtime authority is bounded before authoring',async()=>{
 const h=createContentAuthoringHttpHandlers({resolveRuntime:()=>new Promise(resolve=>setTimeout(()=>resolve(null),100)),now:()=>NOW,requestId:()=>ID,requestBudgetMs:30}as any);
 const start=performance.now();const r=await h.post(req());assert.equal(r.status,504);assert.ok(performance.now()-start<300);
});
test('slow input reduces remaining server generation budget',async()=>{
 let received:any;const h=createContentAuthoringHttpHandlers({resolveRuntime:async()=>{await new Promise(r=>setTimeout(r,15));return {access:{panelOrigin:'https://panel.saas-staging.celebix.site',resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:ID,slug:'fixture',status:'active'},membership:{status:'active',role:'editor'}}})},enabled:()=>true,service:{generateContent:async(input:any)=>{received=input;return generation;}}}as any;},now:()=>NOW,requestId:()=>ID,requestBudgetMs:100}as any);
 const r=await h.post(req());assert.equal(r.status,200);assert.ok(received.deadlineAt-performance.now()<90);assert.ok(received.deadlineAt-performance.now()>0);
});

test('protected existing source is an actionable conflict without exposing source text',async()=>{
 const f=fixture(true,Object.assign(Error('private product text'),{code:'source_preservation_required'}));const response=await f.h.post(req());
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{code:'source_preservation_required'});
});
