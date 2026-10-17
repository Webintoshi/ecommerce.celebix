import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';

async function implementation() {
  assert.ok(existsSync(new URL('./client.ts', import.meta.url)), 'Native marketing HTTP client must exist');
  return import('./client.ts');
}
const ID='25200000-0000-4000-8000-000000000001';
const campaign={id:ID,name:'Yeni ürünler',templateId:'new_products',status:'queued',scheduledAt:'2026-10-18T12:00:00Z',recipientCount:3,sentCount:0,failedCount:0,version:1,isTest:false};
test('native send uses the fixed local route and preserves the exact operation across an uncertain retry',async()=>{
  const {createNativeMarketingApi}=await implementation();const calls:{url:string;init:RequestInit}[]=[];
  const api=createNativeMarketingApi(async(url,init)=>{calls.push({url:String(url),init:init!});if(calls.length===1)throw Error('network');return new Response(JSON.stringify(campaign),{status:200});});
  const command={kind:'send' as const,operationId:ID,body:{name:'Yeni ürünler',templateId:'new_products',productIds:[ID]}};
  await assert.rejects(api.execute(command),(error:any)=>error.code==='outcome_unknown');
  assert.deepEqual(await api.execute(command),campaign);
  assert.equal(calls[0].url,'/api/marketing/native-email/campaigns/send');assert.equal(calls[0].init.body,calls[1].init.body);
  assert.equal((calls[0].init.headers as Record<string,string>)['idempotency-key'],ID);
  assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].init.redirect,'error');
});
test('preview is read-only and rejects a malformed server render without treating it as a send',async()=>{
  const {createNativeMarketingApi}=await implementation();let request:RequestInit|undefined;
  const api=createNativeMarketingApi(async(_url,init)=>{request=init;return new Response(JSON.stringify({html:'<p>Preview</p>'}),{status:200});});
  await assert.rejects(api.preview({templateId:'offer',productIds:[]}),(error:any)=>error.code==='invalid_response');
  assert.equal((request!.headers as Record<string,string>)['idempotency-key'],undefined);
});
test('malformed gateway responses remain uncertain while a structured prerequisite error stays actionable',async()=>{const {createNativeMarketingApi}=await implementation();const command={kind:'send' as const,operationId:ID,body:{name:'Duyuru',templateId:'offer'}};const unknown=createNativeMarketingApi(async()=>new Response('<html>Gateway</html>',{status:502}));await assert.rejects(unknown.execute(command),(error:any)=>error.code==='outcome_unknown');const prerequisite=createNativeMarketingApi(async()=>new Response(JSON.stringify({code:'address_required'}),{status:409}));await assert.rejects(prerequisite.execute(command),(error:any)=>error.code==='address_required');});
test('cancellation sends only expectedVersion to the UUID-specific local route',async()=>{const {createNativeMarketingApi}=await implementation();let url='',init:RequestInit|undefined;const api=createNativeMarketingApi(async(target,request)=>{url=String(target);init=request;return new Response(JSON.stringify({...campaign,status:'cancelled'}));});await api.execute({kind:'cancel',operationId:ID,campaignId:ID,body:{expectedVersion:3}});assert.equal(url,`/api/marketing/native-email/campaigns/${ID}/cancel`);assert.equal(init?.body,JSON.stringify({expectedVersion:3}));assert.equal((init?.headers as Record<string,string>)['idempotency-key'],ID);});
