import assert from 'node:assert/strict';
import test from 'node:test';
import {COMMERCIAL_PACKAGES} from '@celebix/saas-contracts';
import {createPlatformCheckoutHttpHandler} from './handler.ts';
import {PlatformCommerceRepositoryError} from '../server-platform-commerce/repository.ts';
const ID='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222',ORIGIN='https://panel.saas-staging.celebix.site',NOW=new Date('2026-10-26T12:00:00Z');
const COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`,INTENT={kind:'tool',offerId:'restock',term:'once',operationId:OP};
function req(body:unknown=INTENT,extra:Record<string,string>={},url='http://internal:3400/api/platform-checkout'){return new Request(url,{method:'POST',headers:{host:new URL(ORIGIN).host,origin:ORIGIN,cookie:`__Host-celebix_panel=${COOKIE}`,'content-type':'application/json','idempotency-key':OP,...extra},body:JSON.stringify(body)});}
function setup(role='store_owner',support=false,enabled=true){const calls:any[]=[];const runtime={access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:ID,slug:'test'},principal:{id:ID},membership:{role}},...(support?{support:{operator:'support'}}:{})})},commerce:{createCheckout:async(input:unknown)=>{calls.push(input);return{orderId:ID,handoff:'A'.repeat(43),checkoutUrl:'https://celebix.net/api/platform-checkout/handoff'};}}};return{calls,handler:createPlatformCheckoutHttpHandler({resolveRuntime:async()=>runtime as never,now:()=>NOW,requestId:()=>OP,enabled:()=>enabled})};}
test('panel derives checkout actor from session and accepts only canonical catalog intent',async()=>{const s=setup();const response=await s.handler(req());assert.equal(response.status,200);assert.equal(s.calls[0].tenantContext.store.id,ID);assert.deepEqual(s.calls[0].intent,INTENT);assert.equal(response.headers.get('cache-control'),'no-store');});
test('test-credit hint cannot supply authority or money and reaches checkout only with authenticated owner or admin',async()=>{
 const intent={kind:'toshi_credit',offerId:'toshi-test-1',term:'once',operationId:OP};
 for(const role of ['store_owner','admin']){const s=setup(role);assert.equal((await s.handler(req(intent))).status,200);assert.deepEqual(s.calls[0].intent,intent);}
 const s=setup();for(const body of [{...intent,totalCents:100},{...intent,netCents:83},{...intent,credits:1000}])assert.equal((await s.handler(req(body))).status,400);
 assert.equal((await s.handler(req(intent,{},'http://internal:3400/api/platform-checkout?purchase=toshi-test-1'))).status,400);
 for(const role of ['editor','cashier','analyst'])assert.equal((await setup(role).handler(req(intent))).status,403);
 assert.equal(s.calls.length,0);
});
test('origin, forged authority, extra money, support sessions and mismatched operation are rejected',async()=>{const s=setup();for(const extra of [{origin:'https://evil.test'},{'x-store-id':ID},{'x-celebix-actor':ID},{authorization:'Bearer foreign'}]as Record<string,string>[])assert.ok((await s.handler(req(INTENT,extra))).status>=400);for(const body of [{...INTENT,totalCents:1},{...INTENT,storeId:ID},{...INTENT,operationId:ID},{...INTENT,term:'annual'}])assert.equal((await s.handler(req(body))).status,400);assert.equal((await s.handler(req(INTENT,{},'http://internal:3400/api/platform-checkout?storeId='+ID))).status,400);assert.equal((await setup('store_owner',true).handler(req())).status,403);assert.equal(s.calls.length,0);});
test('tools permit owner and admin; packages permit only owner and flag is exact',async()=>{const p={kind:'package',offerId:COMMERCIAL_PACKAGES[1]!.id,term:'annual',operationId:OP};assert.equal((await setup('admin').handler(req())).status,200);assert.equal((await setup('admin').handler(req(p))).status,403);for(const role of ['editor','cashier','analyst'])assert.equal((await setup(role).handler(req())).status,403);assert.equal((await setup('store_owner',false,false).handler(req())).status,503);});
test('confirmed native expiry is an explicit safe 409 without exposing an old handoff',async()=>{
 const runtime={access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:{store:{id:ID,slug:'test'},principal:{id:ID},membership:{role:'store_owner'}}})},commerce:{createCheckout:async()=>{throw new PlatformCommerceRepositoryError('checkout_expired');}}};
 const handler=createPlatformCheckoutHttpHandler({resolveRuntime:async()=>runtime as never,now:()=>NOW,requestId:()=>OP,enabled:()=>true});
 const response=await handler(req());assert.equal(response.status,409);assert.deepEqual(await response.json(),{code:'checkout_expired'});assert.equal(response.headers.get('cache-control'),'no-store');
});
