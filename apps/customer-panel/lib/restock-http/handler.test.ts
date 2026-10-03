import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerRestockRuntime } from '../server-restock/runtime.ts';
import { createRestockStatsHandler } from './handler.ts';
const NOW=new Date('2026-10-03T10:00:00Z'), REQ='78000000-0000-4000-8000-000000000001';
const context={store:{id:'20000000-0000-4000-8000-000000000001'}};
function harness(access='authenticated', fails=false) {
 const calls:unknown[]=[];
 const runtime={access:{panelOrigin:'https://panel.saas-staging.celebix.site',resolveCredential:async()=>({kind:access,tenantContext:context})},restock:{getStats:async(v:unknown)=>{calls.push(v);if(fails)throw Error('secret');return {pendingConfirmed:2,awaitingConfirmation:0,sent:1,failed:0,recent:[]};}}} as unknown as ServerRestockRuntime;
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
