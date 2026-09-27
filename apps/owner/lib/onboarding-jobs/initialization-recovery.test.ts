import assert from 'node:assert/strict';
import test from 'node:test';
async function factories(){try{return [await import('../../../customer-panel/lib/server-admin-domains/initialization.ts'),await import('../../../storefront-shared/lib/runtime-initialization.ts')];}catch{assert.fail('bounded initialization recovery missing');}}
test('panel health and storefront initialization recover from transient null with coalesced bounded retry',async()=>{
 for(const {createRetryingInitialization} of await factories()){
 let calls=0,now=0;const ready={ready:true};const resolve=createRetryingInitialization(async()=>{calls++;return calls===1?null:ready;},()=>now);
 assert.deepEqual(await Promise.all([resolve(),resolve()]),[null,null]);assert.equal(calls,1);
 now=999;assert.equal(await resolve(),null);assert.equal(calls,1);
 now=1000;assert.equal(await resolve(),ready);assert.equal(calls,2);assert.equal(await resolve(),ready);assert.equal(calls,2);
 }
});
