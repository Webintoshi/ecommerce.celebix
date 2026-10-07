import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleMarketingHttpHandlers } from './handler.ts';

const ORIGIN = 'https://panel.saas-staging.celebix.site';
const ID = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-08T12:00:00Z');
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString('base64url')}`;
const tenant = (role = 'store_owner') => ({schemaVersion:1,requestId:ID,principal:{id:ID,issuer:'https://id.test/oidc',subject:'x'},store:{id:ID,slug:'store',status:'active'},membership:{id:ID,role,status:'active'},entitlements:{schemaVersion:1,planId:ID,planCode:'growth',version:2,status:'active',features:['catalog'],limits:{products:100,staff:5,storageBytes:100},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr-TR'});
function request(path: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}) {
  return new Request(`http://internal:3400${path}`, {method, headers:{host:'panel.saas-staging.celebix.site',cookie:`__Host-celebix_panel=${COOKIE}`,...(method==='GET'?{}:{origin:ORIGIN,'content-type':'application/json','idempotency-key':OP}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
}
function setup(google: Record<string,unknown>, role='store_owner') {
  return createGoogleMarketingHttpHandlers({resolveRuntime:async()=>({google,access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:tenant(role)})}} as never),now:()=>NOW,requestId:()=>ID});
}
test('connect binds store, actor, session hash and approved origin; never accepts caller authority', async()=>{
  const calls:any[]=[]; const h=setup({begin:async(input:unknown)=>{calls.push(input);return {authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=opaque'};}});
  assert.equal((await h.post(request('/api/marketing/google/connect','POST',{service:'gtm'}),'connect')).status,200);
  assert.equal(calls[0].tenantContext.store.id,ID); assert.equal(calls[0].returnOrigin,ORIGIN); assert.equal(calls[0].operationId,OP);
  assert.match(calls[0].sessionBinding,/^[a-f0-9]{64}$/); assert.notEqual(calls[0].sessionBinding,COOKIE);
  for(const body of [{service:'gtm',storeId:ID},{service:'unknown'}]) assert.equal((await h.post(request('/api/marketing/google/connect','POST',body),'connect')).status,400);
  assert.equal((await h.post(request('/api/marketing/google/connect','POST',{service:'gtm'},{'x-store-id':ID}),'connect')).status,400);
  assert.equal(calls.length,1);
});
test('writes reject foreign origin, missing session, viewer, oversized body and malformed replay key',async()=>{
  let calls=0;const h=setup({disconnect:async()=>{calls++;}});const input={service:'ads',expectedVersion:1};
  assert.equal((await h.post(request('/api/marketing/google/disconnect','POST',input,{origin:'https://evil.test'}),'disconnect')).status,403);
  assert.equal((await h.post(request('/api/marketing/google/disconnect','POST',input,{cookie:''}),'disconnect')).status,401);
  assert.equal((await setup({disconnect:async()=>{calls++;}},'analyst').post(request('/api/marketing/google/disconnect','POST',input),'disconnect')).status,403);
  assert.equal((await h.post(request('/api/marketing/google/disconnect','POST',input,{'idempotency-key':'invalid'}),'disconnect')).status,400);
  assert.equal((await h.post(request('/api/marketing/google/disconnect','POST',{...input,extra:'a'.repeat(20_000)}),'disconnect')).status,400);
  assert.equal(calls,0);
});
test('resources are lazy bounded reads, unknown/duplicate query is rejected',async()=>{
  const calls:any[]=[];const h=setup({resources:async(input:unknown)=>{calls.push(input);return {accounts:[],resources:[]};}});
  assert.equal((await h.get(request('/api/marketing/google/resources?service=ads&accountId=123'),'resources')).status,200);
  assert.equal(calls[0].accountId,'123');
  for(const q of ['service=ads&service=gtm','service=ads&storeId='+ID,'service=ads&accountId='+ 'a'.repeat(161)]) assert.equal((await h.get(request('/api/marketing/google/resources?'+q),'resources')).status,400);
  assert.equal(calls.length,1);
});
test('callback only resolves opaque stored state and redirects code in fragment without session reliance',async()=>{
  const calls:any[]=[];const state='s'.repeat(43),code='google-code';const h=setup({resolveOAuthReturn:async(input:unknown)=>{calls.push(input);return {returnOrigin:'https://admin.store.test'};}});
  const result=await h.callback(request('/api/marketing/google/callback?state='+state+'&code='+code,'GET',undefined,{cookie:''}));
  assert.equal(result.status,303);assert.equal(result.headers.get('location'),`https://admin.store.test/api/marketing/google/callback#state=${state}&code=${code}`);
  assert.equal(result.headers.get('referrer-policy'),'no-referrer');assert.equal(calls.length,1);
  assert.equal((await h.callback(request('/api/marketing/google/callback?state='+state+'&code='+code+'&code=x'))).status,400);
  assert.equal((await setup({resolveOAuthReturn:async()=>null}).callback(request('/api/marketing/google/callback?state='+state+'&code='+code))).status,400);
});
test('fragment completion bridge cleans URL, posts same-origin, is nonce guarded and never embeds external return data',async()=>{
  const h=setup({});const response=await h.callback(request('/api/marketing/google/callback'));
  const html=await response.text();assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy')!,/script-src 'nonce-/);assert.match(html,/history.replaceState/);assert.match(html,/credentials: 'same-origin'/);assert.match(html,/\/api\/marketing\/google\/complete/);assert.doesNotMatch(html,/unsafe-inline|access_token|refresh_token/);
});
test('complete requires current session even after successful Google login; error messages are redacted',async()=>{
  const calls:any[]=[];const h=setup({complete:async(input:unknown)=>{calls.push(input);return {returnOrigin:ORIGIN};}});
  const input={state:'s'.repeat(43),code:'google-code'};
  assert.equal((await h.post(request('/api/marketing/google/complete','POST',input),'complete')).status,200);
  assert.equal(calls[0].tenantContext.principal.id,ID);
  assert.equal((await h.post(request('/api/marketing/google/complete','POST',input,{cookie:''}),'complete')).status,401);
  const failed=await setup({overview:async()=>{throw Error('secret-token');}}).get(request('/api/marketing/google'),'overview');
  assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{code:'unavailable'});
});
