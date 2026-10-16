import assert from 'node:assert/strict';
import test from 'node:test';
import {createCommercialPlanHttpHandlers} from './handler.ts';
const ID='11111111-1111-4111-8111-111111111111',PLAN='00000000-0000-4000-8000-000000000006',ORIGIN='https://panel.saas-staging.celebix.site',NOW=new Date('2026-10-17T12:00:00.000Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
function req(method='GET',body?:unknown,headers:Record<string,string>={}){return new Request('http://internal:3400/api/plan',{method,headers:{cookie:`__Host-celebix_panel=${COOKIE}`,host:'panel.saas-staging.celebix.site',...(method==='POST'?{origin:ORIGIN,'content-type':'application/json','idempotency-key':ID}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});}
function setup(role='store_owner'){
 const calls:unknown[]=[];const plans={read:async(input:unknown)=>{calls.push(input);return{};},request:async(input:unknown)=>{calls.push(input);return{requestId:ID};}};
 const runtime={plans,access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:ID,slug:'test'},membership:{role}}})}};
 return {calls,h:createCommercialPlanHttpHandlers({resolveRuntime:async()=>runtime as never,now:()=>NOW,requestId:()=>ID})};
}
test('plan requests use resolved host tenant and matching operation key',async()=>{const {h,calls}=setup();const response=await h.POST(req('POST',{planId:PLAN,operationId:ID}));assert.equal(response.status,200);assert.equal((calls[0]as any).tenantContext.store.id,ID);assert.equal((calls[0]as any).intent.operationId,ID);assert.equal(response.headers.get('cache-control'),'no-store');});
test('owner, exact body, operation and origin checked before package writes',async()=>{for(const role of ['admin','editor','cashier','analyst']){const {h,calls}=setup(role);assert.equal((await h.POST(req('POST',{planId:PLAN,operationId:ID}))).status,403);assert.equal(calls.length,0);}const {h,calls}=setup();for(const body of [{planId:PLAN,operationId:PLAN},{planId:PLAN,operationId:ID,storeId:ID}])assert.equal((await h.POST(req('POST',body))).status,400);assert.equal((await h.POST(req('POST',{planId:PLAN,operationId:ID},{origin:'https://evil.test'}))).status,403);assert.equal(calls.length,0);});
test('plan read rejects caller authority and query parameters',async()=>{const {h,calls}=setup();assert.equal((await h.GET(req())).status,200);assert.equal((await h.GET(req('GET',undefined,{'x-store-id':ID}))).status,400);assert.equal((await h.GET(new Request('http://internal:3400/api/plan?storeId='+ID))).status,400);assert.equal(calls.length,1);});
