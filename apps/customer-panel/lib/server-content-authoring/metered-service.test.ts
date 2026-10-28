import assert from 'node:assert/strict';
import test from 'node:test';
import {fingerprintContentAuthoringRequest} from './facts.ts';
import {createMeteredContentAuthoringService} from './metered-service.ts';
const id='11111111-1111-4111-8111-111111111111',at='2026-10-27T00:00:00.000Z';
function fixture(fields:readonly string[]=['description']){
 const request={draftId:id,productId:null,productVersion:null,profileVersion:null,currentDraft:{title:'Ürün'},action:'auto',fields,locale:'tr-TR',tone:'neutral',length:'medium',note:'',selection:null}as any;
 const fingerprint=fingerprintContentAuthoringRequest(request),draft={suggestions:[],claims:[],sourceFingerprint:'a'.repeat(64),...Object.fromEntries(fields.map(f=>[f,f==='description'?[{type:'paragraph',children:[{type:'text',text:'Ürün.'}]}]:'Ürün']))};
 const generation={id,draftId:id,productId:null,status:'completed',requestFingerprint:fingerprint,sourceFingerprint:'a'.repeat(64),configId:id,provider:'deepseek',model:'deepseek-flash',credentialVersion:1,promptVersion:'toshi-product-v7',version:3,dispatchState:'dispatched',claimToken:null,leaseExpiresAt:null,usage:null,draft,safeCode:null,createdAt:at,updatedAt:at,finishedAt:at}as any;
 let calls=0,balance=20,reserved=0,row:any=null,throwGenerate=false;
 const credits:any={getWallet:async()=>({balance,reserved,available:balance-reserved}),reserve:async(input:any)=>{
  if(row){assert.equal(input.fingerprint,row.fingerprint);return {kind:row.status==='reserved'?'pending':'replayed',status:row.status,result:row.result,chargedCredits:row.chargedCredits??0};}
  if(balance<input.cost)throw Object.assign(Error(),{code:'insufficient_credits'});
  reserved=input.cost;row={...input,status:'reserved',result:null};return {kind:'created',status:'reserved',result:null,chargedCredits:0};
 },complete:async(input:any)=>{assert.equal(input.fingerprint,row.fingerprint);if(!['reserved','completed'].includes(row.status))throw Object.assign(Error(),{code:'operation_failed'});if(row.status!=='completed'){balance-=input.chargedCredits;reserved=0;row={...row,status:'completed',result:input.result,chargedCredits:input.chargedCredits};}return {balance,reserved,available:balance};},fail:async()=>{if(row.status==='reserved'){reserved=0;row.status='failed';}return {balance,reserved,available:balance};}};
 const raw:any={generateContent:async()=>{calls++;if(throwGenerate)throw Object.assign(Error(),{code:'invalid_output'});return generation;},getGeneration:async()=>generation};
 const service=createMeteredContentAuthoringService(raw,credits),input={tenantContext:{store:{id},membership:{id}}as any,operationId:id,request,signal:new AbortController().signal};
 return {service,input,state:()=>({calls,balance,reserved}),fail:()=>{throwGenerate=true;},raw,credits};
}
test('description7 charged once; operation replay returns usable result without generating again',async()=>{const f=fixture();await f.service.generateContent(f.input);await f.service.generateContent(f.input);assert.deepEqual(f.state(),{calls:1,balance:13,reserved:0});});
test('SEO-only3 never incurs description cost',async()=>{const f=fixture(['seoTitle','seoDescription']);await f.service.generateContent(f.input);assert.deepEqual(f.state(),{calls:1,balance:17,reserved:0});});
test('all selected text10 costs same once when result is observed through GET',async()=>{const f=fixture(['description','seoTitle','seoDescription']);await f.service.generateContent(f.input);await f.service.getGeneration({tenantContext:f.input.tenantContext,operationId:id});assert.deepEqual(f.state(),{calls:1,balance:10,reserved:0});});
test('failed generation releases reservation without a customer debit',async()=>{const f=fixture();f.fail();await assert.rejects(f.service.generateContent(f.input));assert.deepEqual(f.state(),{calls:1,balance:20,reserved:0});});
test('in-flight same operation only dispatches once',async()=>{
 const f=fixture();let finish!:(v:any)=>void;const pending=new Promise(resolve=>{finish=resolve;});let calls=0;
 const original=f.raw.generateContent;f.raw.generateContent=async()=>{calls++;await pending;return original();};
 const first=f.service.generateContent(f.input);await new Promise(resolve=>setImmediate(resolve));
 await f.service.generateContent(f.input);finish(null);await first;assert.equal(calls,1);assert.equal(f.state().balance,13);
});

function nativeFreshness(input:{now:Date}){if(Math.abs(Date.now()-input.now.valueOf())>60000)throw Object.assign(Error(),{code:'invalid_input'});}
test('a65-second usable generation settles with a fresh wallet timestamp and still charges once',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(at)});const f=fixture(),generate=f.raw.generateContent,complete=f.credits.complete;
 f.raw.generateContent=async()=>{const g=await generate();t.mock.timers.tick(65000);return g;};
 f.credits.complete=async(input:any)=>{nativeFreshness(input);return complete(input);};
 assert.equal((await f.service.generateContent(f.input)).status,'completed');await f.service.generateContent(f.input);
 assert.deepEqual(f.state(),{calls:1,balance:13,reserved:0});
});
for(const returned of [false,true])test(`a65-second ${returned?'returned':'thrown'} generation failure releases with a fresh wallet timestamp`,async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(at)});const f=fixture(),generate=f.raw.generateContent,release=f.credits.fail;
 if(!returned)f.fail();
 f.raw.generateContent=async()=>{t.mock.timers.tick(65000);const g=await generate();return {...g,status:'failed',draft:null,safeCode:'invalid_output'};};
 f.credits.fail=async(input:any)=>{nativeFreshness(input);return release(input);};
 if(returned)assert.equal((await f.service.generateContent(f.input)).status,'failed');else await assert.rejects(f.service.generateContent(f.input),(e:any)=>e.code==='invalid_output');
 assert.deepEqual(f.state(),{calls:1,balance:20,reserved:0});
});
test('GET settlement refreshes wallet authority after a slow durable status read',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:Date.parse(at)});const f=fixture(),get=f.raw.getGeneration,complete=f.credits.complete;
 await f.service.generateContent(f.input);const started=new Date();
 f.raw.getGeneration=async()=>{t.mock.timers.tick(65000);return get();};
 f.credits.complete=async(input:any)=>{nativeFreshness(input);return complete(input);};
 assert.equal((await f.service.getGeneration({tenantContext:f.input.tenantContext,operationId:id,now:started})).status,'completed');
 assert.deepEqual(f.state(),{calls:1,balance:13,reserved:0});
});
test('a transient wallet completion failure retains the hold and recovers through GET without redispatch',async()=>{
 const f=fixture(),complete=f.credits.complete,release=f.credits.fail;let attempts=0,releases=0;
 f.credits.complete=async(input:any)=>{if(++attempts===1)throw Object.assign(Error(),{code:'unavailable'});return complete(input);};
 f.credits.fail=async(input:any)=>{releases++;return release(input);};
 await assert.rejects(f.service.generateContent(f.input),(e:any)=>e.code==='unavailable');
 assert.deepEqual(f.state(),{calls:1,balance:20,reserved:7});assert.equal(releases,0);
 assert.equal((await f.service.getGeneration({tenantContext:f.input.tenantContext,operationId:id})).status,'completed');
 await f.service.generateContent(f.input);await f.service.getGeneration({tenantContext:f.input.tenantContext,operationId:id});
 assert.deepEqual(f.state(),{calls:1,balance:13,reserved:0});assert.equal(releases,0);
});
test('an ambiguous committed wallet completion recovers its existing charge without release or redispatch',async()=>{
 const f=fixture(),complete=f.credits.complete,release=f.credits.fail;let first=true,releases=0;
 f.credits.complete=async(input:any)=>{const wallet=await complete(input);if(first){first=false;throw Object.assign(Error(),{code:'commit_unknown'});}return wallet;};
 f.credits.fail=async(input:any)=>{releases++;return release(input);};
 await assert.rejects(f.service.generateContent(f.input),(e:any)=>e.code==='commit_unknown');
 await f.service.generateContent(f.input);await f.service.getGeneration({tenantContext:f.input.tenantContext,operationId:id});
 assert.deepEqual(f.state(),{calls:1,balance:13,reserved:0});assert.equal(releases,0);
});
