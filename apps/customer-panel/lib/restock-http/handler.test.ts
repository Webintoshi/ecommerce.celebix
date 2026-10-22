import assert from 'node:assert/strict';
import test from 'node:test';
import {COMMERCIAL_PACKAGES,STORE_TOOL_OFFERS} from '@celebix/saas-contracts';
import type { ServerRestockRuntime } from '../server-restock/runtime.ts';
import { createRestockStatsHandler } from './handler.ts';
const NOW=new Date('2026-10-03T10:00:00Z'), REQ='78000000-0000-4000-8000-000000000001';
const plan=COMMERCIAL_PACKAGES[2];const context={store:{id:'20000000-0000-4000-8000-000000000001'},membership:{role:'admin'},entitlements:{schemaVersion:1,planId:plan.id,planCode:plan.code,version:plan.version,status:'active',features:plan.features,limits:plan.limits,validFrom:'2026-01-01T00:00:00.000Z'}};
function harness(access='authenticated', fails=false,tenantContext=context,readWorkspace?:()=>Promise<unknown>) {
 const calls:unknown[]=[];
 const runtime={access:{panelOrigin:'https://panel.saas-staging.celebix.site',resolveCredential:async()=>({kind:access,tenantContext})},...(readWorkspace?{storeTools:{read:readWorkspace}}:{}),restock:{getStats:async(v:unknown)=>{calls.push(v);if(fails)throw Error('secret');return {pendingConfirmed:2,awaitingConfirmation:0,sent:1,failed:0,recent:[]};}}} as unknown as ServerRestockRuntime;
 return {calls,handle:createRestockStatsHandler({resolveRuntime:async()=>runtime,now:()=>NOW,requestId:()=>REQ})};
}
function request(headers:HeadersInit={},query='') {
 const h=new Headers(headers);if(!h.has('cookie'))h.set('cookie',`__Host-celebix_panel=v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`);
 return new Request(`http://internal:3400/api/restock/stats${query}`,{headers:h});
}
test('stock statistics use session tenant and never accept explicit tenant override',async()=>{
 const {calls,handle}=harness();const response=await handle(request());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(calls,[{tenantContext:context,now:NOW}]);
 assert.equal((await handle(request({'x-store-id':'other'}))).status,400);assert.equal((await handle(request({},'?store=other'))).status,400);assert.equal(calls.length,1);
});
test('missing or forbidden sessions cannot read subscriptions and exceptions do not leak',async()=>{
 const empty=harness();assert.equal((await empty.handle(request({cookie:''}))).status,401);assert.equal(empty.calls.length,0);
 const denied=harness('unauthorized');assert.equal((await denied.handle(request())).status,403);assert.equal(denied.calls.length,0);
 const broken=harness('authenticated',true);const response=await broken.handle(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'unavailable'});
});

test('Starter cannot read growth-only restock statistics',async()=>{const p=COMMERCIAL_PACKAGES[1];const starter=harness('authenticated',false,{...context,entitlements:{...context.entitlements,planId:p.id,planCode:p.code,version:p.version,features:p.features,limits:p.limits}});assert.equal((await starter.handle(request())).status,403);assert.equal(starter.calls.length,0)});

test('a server-issued free-plan restock license opens only that tool and a fresh read observes revocation',async()=>{
 const p=COMMERCIAL_PACKAGES[0],free={...context,entitlements:{...context.entitlements,planId:p.id,planCode:p.code,version:p.version,features:p.features,limits:p.limits}};
 let enabled=true,reads=0;const value=harness('authenticated',false,free,async()=>{reads++;return{storeId:context.store.id,timezone:'Europe/Istanbul',offers:STORE_TOOL_OFFERS,licenses:enabled?[{toolKey:'restock',source:'purchase',grantedAt:NOW.toISOString()}]:[],purchases:[],canRequestPurchase:true};});
 assert.equal((await value.handle(request())).status,200);enabled=false;assert.equal((await value.handle(request())).status,403);assert.equal(value.calls.length,1);assert.equal(reads,2);
});
test('foreign or malformed license projections cannot authorize stock subscription reads',async()=>{
 for(const workspace of[{}, {storeId:REQ,timezone:'Europe/Istanbul',offers:STORE_TOOL_OFFERS,licenses:[{toolKey:'restock',source:'purchase',grantedAt:NOW.toISOString()}],purchases:[],canRequestPurchase:true}]){const value=harness('authenticated',false,context,async()=>workspace);assert.equal((await value.handle(request())).status,503);assert.equal(value.calls.length,0);}
});
