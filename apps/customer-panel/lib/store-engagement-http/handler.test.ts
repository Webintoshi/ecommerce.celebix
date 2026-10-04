import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultStoreEngagementConfig } from '@celebix/saas-contracts';
import { createStoreEngagementHandlers } from './handler.ts';
import type { ServerStoreEngagementRuntime } from '../server-store-engagement/runtime.ts';
const NOW=new Date('2026-10-04T12:00:00Z'), OP='78000000-0000-4000-8000-000000000001', ID='78000000-0000-4000-8000-000000000002';
const campaign={id:ID,kind:'popup',name:'Hoş geldiniz',enabled:true,version:1,config:createDefaultStoreEngagementConfig(),updatedAt:NOW.toISOString()};
function harness(role='store_owner') {
 const calls:unknown[]=[];const context={store:{id:ID,slug:'siora'},membership:{role}};
 const runtime={access:{panelOrigin:'https://panel.saas-staging.celebix.site',resolveCredential:async()=>({kind:'authenticated',tenantContext:context})},engagement:{list:async(x:unknown)=>{calls.push(x);return [campaign];},save:async(x:unknown)=>{calls.push(x);return campaign;}}} as unknown as ServerStoreEngagementRuntime;
 return {calls,context,handlers:createStoreEngagementHandlers({resolveRuntime:async()=>runtime,now:()=>NOW,requestId:()=>OP})};
}
function request(body?:unknown,headers:HeadersInit={}) {
 const h=new Headers({cookie:`__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`,origin:'https://panel.saas-staging.celebix.site','content-type':'application/json','idempotency-key':OP,...headers});
 return new Request('http://internal:3400/api/store-engagement/campaigns',{method:body===undefined?'GET':'POST',headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
const input={kind:'popup',name:'Hoş geldiniz',enabled:true,config:createDefaultStoreEngagementConfig()};
test('list and direct save use authenticated store and validated campaign',async()=>{const h=harness();assert.equal((await h.handlers.list(request())).status,200);const response=await h.handlers.save(request(input));assert.equal(response.status,200);assert.deepEqual(await response.json(),{campaign});assert.deepEqual(h.calls[1],{tenantContext:h.context,now:NOW,operationId:OP,...input});assert.equal(response.headers.get('cache-control'),'no-store');});
test('reject tenant spoofing, cross origin, no session and incomplete expected version before writes',async()=>{const h=harness();for(const body of [{...input,storeId:ID},{...input,campaignId:ID},{...input,expectedVersion:1},{...input,campaignId:ID,expectedVersion:0}])assert.equal((await h.handlers.save(request(body))).status,400);assert.equal((await h.handlers.save(request(input,{origin:'https://other.invalid'}))).status,403);assert.equal((await h.handlers.save(request(input,{cookie:''}))).status,401);assert.equal(h.calls.length,0);});
test('cashier cannot read or configure engagement and invalid campaign responses fail closed',async()=>{const h=harness('cashier');assert.equal((await h.handlers.list(request())).status,403);assert.equal((await h.handlers.save(request(input))).status,403);assert.equal(h.calls.length,0);});
