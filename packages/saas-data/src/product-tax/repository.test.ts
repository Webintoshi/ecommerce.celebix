import assert from 'node:assert/strict';
import test from 'node:test';
import {CatalogRepositoryError} from '../catalog/errors.ts';
const api=await import('./repository.ts').catch(()=>null);
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',now=new Date('2026-10-23T10:00:00Z');
const tenant:any={schemaVersion:1,principal:{id:ID},store:{id:ID,slug:'test',status:'active'},membership:{id:ID,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:ID,planCode:'growth',version:2,status:'active',features:['catalog'],limits:{products:100},validFrom:'2026-01-01T00:00:00.000Z'}};
const projection={productId:ID,productVersion:2,tax:null,variants:[{variantId:OTHER,variantVersion:3,tax:null,effectiveTax:null,taxSource:'unknown'}]};
function fixture(outcome='found',payload:unknown=projection){
 assert.ok(api,'product tax repository must exist');const calls:{text:string;values:unknown[]}[]=[],releases:unknown[]=[],client={query:async(text:string,values:unknown[]=[])=>{calls.push({text,values});const rows=text.includes('saas.catalog_tax_read')?[{outcome,result_payload:payload}]:[];return{rows,rowCount:rows.length};},release:(destroy?:unknown)=>releases.push(destroy)};
 const repository=api.createPostgresProductTaxRepository({pool:{connect:async()=>client}as any});return{repository,calls,releases};
}
test('product tax read uses only seven trusted authority fields plus product ID and a read-only app-role transaction',async()=>{
 const f=fixture(),result=await f.repository.read({tenantContext:tenant,now,productId:ID});assert.deepEqual(result,projection);
 assert.equal(f.calls[0].text,'BEGIN READ ONLY');assert.ok(f.calls.some(call=>call.text==='SET LOCAL ROLE celebix_saas_app'));
 assert.deepEqual(f.calls.find(call=>call.text.includes('saas.catalog_tax_read'))?.values,[ID,ID,ID,ID,'growth',2,now,ID]);assert.equal(f.calls.at(-1)?.text,'COMMIT');assert.deepEqual(f.releases,[undefined]);
});
test('unknown products, cross-product projections and malformed native tax never become a successful read',async()=>{
 for(const outcome of['not_found','product_not_found']){const missing=fixture(outcome,null);await assert.rejects(missing.repository.read({tenantContext:tenant,now,productId:ID}),(error:unknown)=>error instanceof CatalogRepositoryError&&error.code==='product_not_found');}
 for(const result of[{...projection,productId:OTHER},{...projection,tax:{treatment:'taxable',rateBps:'2000'}}]){const f=fixture('found',result);await assert.rejects(f.repository.read({tenantContext:tenant,now,productId:ID}),/unavailable/);assert.equal(f.calls.at(-1)?.text,'ROLLBACK');}
});
test('tax read rejects forged input keys and inactive authority before database access',async()=>{
 const f=fixture();await assert.rejects(f.repository.read({tenantContext:tenant,now,productId:ID,storeId:OTHER}as any),/invalid_input/);assert.equal(f.calls.length,0);
 await assert.rejects(f.repository.read({tenantContext:{...tenant,store:{...tenant.store,status:'suspended'}},now,productId:ID}),/store_inactive/);assert.equal(f.calls.length,0);
});
