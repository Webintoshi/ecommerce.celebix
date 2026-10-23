import assert from 'node:assert/strict';
import test from 'node:test';
import {CatalogRepositoryError} from '../../../../packages/saas-data/src/catalog/errors.ts';
const api=await import('./handler.ts').catch(()=>null);
const ID='11111111-1111-4111-8111-111111111111',ORIGIN='https://panel.saas-staging.celebix.net',PATH='/api/catalog/products/'+ID+'/tax',COOKIE='v1.panel.current.'+Buffer.alloc(32,1).toString('base64url');
const value={productId:ID,productVersion:1,tax:null,variants:[]};
function fixture(){assert.ok(api,'product tax HTTP read must exist');const calls:any[]=[],runtime:any={access:{panelOrigin:ORIGIN,readiness:{mode:'approved_staging'},resolveCredential:async()=>({kind:'authenticated',tenantContext:{membership:{role:'store_owner'},store:{id:ID}}})},repository:{read:async(input:unknown)=>{calls.push(input);return value;}}};const handlers=api.createProductTaxHttpHandlers({resolveRuntime:async()=>runtime,now:()=>new Date('2026-10-23T10:00:00Z'),requestId:()=>ID});return{handlers,calls,runtime};}
function request(suffix='',headers:Record<string,string>={}){return new Request('http://internal:3400'+PATH+suffix,{headers:{host:'panel.saas-staging.celebix.net',cookie:'__Host-celebix_panel='+COOKIE,...headers}});}
test('dedicated tax GET resolves cookie authority and returns only the dedicated no-store tax projection',async()=>{
 const f=fixture(),response=await f.handlers.get(request(),ID);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),value);assert.equal(f.calls.length,1);assert.equal(f.calls[0].productId,ID);assert.equal(f.calls[0].tenantContext.store.id,ID);
});
test('tax GET denies missing cookie, forged tenant identity, query overrides and unauthenticated authority',async()=>{
 const f=fixture();assert.equal((await f.handlers.get(request('',{cookie:''}),ID)).status,401);assert.equal((await f.handlers.get(request('',{'x-store-id':ID}),ID)).status,400);assert.equal((await f.handlers.get(request('?storeId='+ID),ID)).status,400);assert.equal(f.calls.length,0);
 f.runtime.access.resolveCredential=async()=>({kind:'unauthenticated'});assert.equal((await f.handlers.get(request(),ID)).status,401);
});
test('tax GET maps not-found safely and rejects malformed cross-product projections',async()=>{
 const f=fixture();f.runtime.repository.read=async()=>{throw new CatalogRepositoryError('product_not_found');};assert.equal((await f.handlers.get(request(),ID)).status,404);
 f.runtime.repository.read=async()=>({...value,productId:'22222222-2222-4222-8222-222222222222'});assert.equal((await f.handlers.get(request(),ID)).status,503);
});
