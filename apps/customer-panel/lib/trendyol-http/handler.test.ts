import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_TRENDYOL_PRICING} from '@celebix/saas-contracts';
import {TrendyolRepositoryError} from '../../../../packages/saas-data/src/trendyol/repository.ts';
import {sealTrendyolCredential} from '../../../../packages/saas-data/src/trendyol/credential.ts';
import {createTrendyolHttpHandlers} from './handler.ts';
const ID='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222';
const ORIGIN='https://panel.saas-staging.celebix.site',ROOT='/api/marketplaces/trendyol',COOKIE=`v1.panel.current.${Buffer.alloc(32,1).toString('base64url')}`;
function setup({role='store_owner',paid=true}={}){
 const calls:unknown[]=[],providerCalls:unknown[]=[];
 const tenant={schemaVersion:1,store:{id:ID,slug:'store',status:'active'},membership:{id:ID,role,status:'active'},principal:{id:ID},entitlements:{planId:paid?'00000000-0000-4000-8000-000000000008':'00000000-0000-4000-8000-000000000007',planCode:paid?'starter':'free_starter',version:paid?2:3,status:'active',features:paid?['integrations','marketplaces']:['integrations']}};
 const workflow={webhook:async(_storeId:string,_hash:string)=>{calls.push('webhook');}};
 const repository={orderIssues:async()=>({items:[]}),overview:async()=>({connection:{connected:false,sellerId:null,status:'disconnected',version:0,settingsVersion:0,lastOrdersAt:null,lastErrorCode:null},pricing:DEFAULT_TRENDYOL_PRICING,counts:{mapped:0,pending:0,failed:0},webhookUrl:null}),products:async(input:unknown)=>{calls.push(input);return{items:[],nextCursor:null};},receipt:async():Promise<any>=>null,command:async(input:unknown)=>{calls.push(input);return{saved:true,replayed:false};}};
 const keyring={activeKeyId:'test',keys:[{keyId:'test',key:new Uint8Array(32).fill(4)}]},provider={testConnection:async(input:unknown)=>providerCalls.push(input),product:async()=>({approved:true,archived:false}),getProductTax:async()=>20};
 Object.assign(repository,{credential:async()=>({credentialVersion:1,credential:sealTrendyolCredential({storeId:ID,version:1,credential:{sellerId:'123',apiKey:'key',apiSecret:'secret',webhookSecret:'a'.repeat(64)},keyring})})});
 const h=createTrendyolHttpHandlers({resolveRuntime:async()=>({repository,workflow,provider,keyring,access:{readiness:{mode:'approved_staging'},panelOrigin:ORIGIN,resolveCredential:async()=>({kind:'authenticated',tenantContext:tenant})}} as any),now:()=>new Date('2026-10-23T10:00:00Z'),requestId:()=>ID});
 return{h,calls,providerCalls,repository,workflow,provider};
}
function request(path=ROOT,method='GET',body?:unknown,headers:Record<string,string>={}){return new Request('http://internal:3400'+path,{method,headers:{host:'panel.saas-staging.celebix.site',cookie:'__Host-celebix_panel='+COOKIE,origin:ORIGIN,'content-type':'application/json','idempotency-key':OP,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
test('free plan is blocked before persistence or provider contact; paid users retain bounded product reads',async()=>{
 const free=setup({paid:false});assert.equal((await free.h.get(request(),'overview')).status,403);assert.equal(free.calls.length,0);assert.equal(free.providerCalls.length,0);
 const paid=setup();assert.equal((await paid.h.get(request(ROOT+'/products?limit=25'),'products')).status,200);
 for(const query of['limit=51','limit=2&limit=3','storeId='+ID,'cursor=bad'])assert.equal((await paid.h.get(request(ROOT+'/products?'+query),'products')).status,400);
 assert.equal(paid.calls.length,1);
});
test('tax=1 selects the canonical products action while legacy reads remain unchanged',async()=>{
 const f=setup();let taxReads=0;(f.repository as any).productsTax=async()=>{taxReads++;return{items:[],nextCursor:null};};assert.equal((await f.h.get(request(ROOT+'/products?tax=1'),'products')).status,200);assert.equal(taxReads,1);assert.equal(f.calls.length,0);
 for(const query of['tax=0','tax=1&tax=1','tax=20'])assert.equal((await f.h.get(request(ROOT+'/products?'+query),'products')).status,400);
});
test('existing mapping checks actual remote VAT before enqueue and preserves disabling when tax cannot be read',async()=>{
 const f=setup(),body={variantId:ID,barcode:'BAR-1',categoryId:null,brandId:null,vatRate:20,dimensionalWeight:1,cargoProviderCode:null,attributes:[],enabled:true,mode:'existing'};
 f.provider.getProductTax=async()=>10;const conflict=await f.h.post(request(ROOT+'/products','POST',body),'products');assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{code:'tax_conflict'});assert.equal(f.calls.length,0);
 f.provider.getProductTax=async()=>20;assert.equal((await f.h.post(request(ROOT+'/products','POST',body),'products')).status,200);assert.equal(f.calls.length,1);
 f.provider.getProductTax=async()=>{throw Error('disable must not read remote VAT');};assert.equal((await f.h.post(request(ROOT+'/products','POST',{...body,enabled:false}),'products')).status,200);assert.equal(f.calls.length,2);
});
test('mutations require session, manager role, approved origin, idempotency and no forged tenant identity',async()=>{
 const {h,calls}=setup();
 assert.equal((await h.post(request(ROOT+'/sync','POST',{}, {cookie:''}),'sync')).status,401);
 assert.equal((await h.post(request(ROOT+'/sync','POST',{}, {origin:'https://evil.test'}),'sync')).status,403);
 assert.equal((await setup({role:'analyst'}).h.post(request(ROOT+'/sync','POST',{}),'sync')).status,403);
 assert.equal((await h.post(request(ROOT+'/sync','POST',{}, {'x-store-id':ID}),'sync')).status,400);
 assert.equal((await h.post(request(ROOT+'/sync','POST',{}, {'idempotency-key':'bad'}),'sync')).status,400);
 assert.equal(calls.length,0);
});
test('pricing saves use trusted store authority; malformed fields never execute',async()=>{
 const {h,calls}=setup();const body={expectedVersion:1,pricing:{...DEFAULT_TRENDYOL_PRICING,commissionBps:1700,averageShippingCents:9000}};
 assert.equal((await h.post(request(ROOT+'/settings','POST',body),'settings')).status,200);
 const c=calls[0] as any;assert.equal(c.tenantContext.store.id,ID);assert.equal(c.payload.operationId,OP);assert.match(c.payload.fingerprint,/^[a-f0-9]{64}$/);assert.equal(c.payload.pricing.averageShippingCents,9000);
 for(const invalid of[{...body,storeId:ID},{...body,pricing:{...body.pricing,apiSecret:'forged'}},{...body,pricing:{...body.pricing,commissionBps:10000}}])assert.equal((await h.post(request(ROOT+'/settings','POST',invalid),'settings')).status,400);
 assert.equal(calls.length,1);
});

test('committed connect retries reconcile the receipt before needing the provider again',async()=>{
 const f=setup();f.repository.receipt=async()=>({saved:true,replayed:true});
 const response=await f.h.post(request(ROOT+'/connect','POST',{expectedVersion:0,sellerId:'123',apiKey:'fixture-key',apiSecret:'fixture-secret',pricing:DEFAULT_TRENDYOL_PRICING}),'connect');assert.equal(response.status,200);assert.deepEqual(await response.json(),{saved:true,replayed:true});assert.equal(f.providerCalls.length,0);assert.equal(f.calls.length,0);
});

test('retained order issue reads share package authority and reject hidden filters',async()=>{
 const f=setup();assert.equal((await f.h.get(request(ROOT+'/order-issues'),'order-issues')).status,200);assert.equal((await f.h.get(request(ROOT+'/order-issues?storeId='+ID),'order-issues')).status,400);assert.equal((await setup({paid:false}).h.get(request(ROOT+'/order-issues'),'order-issues')).status,403);
});
test('webhook permits bounded JSON charset/chunked payloads but acknowledges only a durable authorized wake',async()=>{
 const f=setup(),path='/api/hooks/marketplace/'+ID;const hook=(token='a'.repeat(64),body='{}')=>new Request('https://panel.saas-staging.celebix.site'+path,{method:'POST',headers:{'x-api-key':token,'content-type':'application/json; charset=utf-8','transfer-encoding':'chunked'},body});
 assert.equal((await f.h.webhook(hook(),ID)).status,202);assert.deepEqual(f.calls,['webhook']);assert.equal((await f.h.webhook(hook('bad'),ID)).status,401);assert.equal((await f.h.webhook(hook('a'.repeat(64),' '.repeat(262145)),ID)).status,400);
 f.workflow.webhook=async()=>{throw new TrendyolRepositoryError('membership_denied');};assert.equal((await f.h.webhook(hook(),ID)).status,401);
});
