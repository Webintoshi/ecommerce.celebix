import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext} from '@celebix/saas-contracts';
import type {ServerInStoreSalesRuntime} from '../server-in-store-sales/runtime.ts';
import {InStoreSalesRepositoryError} from '@celebix/saas-data';
import {createInStoreSalesHttpHandlers} from './handler.ts';
const id='11111111-1111-4111-8111-111111111111';
const origin='https://panel.saas-staging.celebix.net';
const host='butik-siora.admin.saas-staging.celebix.net';
const now=new Date('2026-09-26T09:00:00.000Z');
const tenantContext={schemaVersion:1,requestId:id,principal:{id,issuer:'https://identity.example',subject:'cashier'},store:{id,slug:'butik-siora',status:'active'},membership:{id,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:id,planCode:'free_starter',version:1,status:'active',features:['orders'],limits:{products:100,staff:5,storageBytes:1024,monthlyOrders:100},validFrom:'2026-01-01T00:00:00.000Z',validUntil:'2027-01-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const credential=`v1.panel.current.${Buffer.alloc(32,0x31).toString('base64url')}`;
function req(path:string,body?:unknown,headers:Record<string,string>={}){return new Request(`https://${host}/api/orders/in-store/${path}`,{method:body===undefined?'GET':'POST',headers:{host,cookie:`__Host-celebix_panel=${credential}`,origin:`https://${host}`,'content-type':'application/json','idempotency-key':id,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const sale={id,saleNumber:'MS-1',status:'draft',version:1,locationId:id,locationName:'Mağaza',ownerMembershipId:id,ownerLabel:'Kasiyer',customerName:null,note:null,discount:null,items:[],totals:{subtotalCents:0,eligibleSubtotalCents:0,discountCents:0,totalCents:0},createdAt:now.toISOString(),updatedAt:now.toISOString(),paymentReceivedAt:null,completedAt:null,orderId:null,orderNumber:null};
function harness(result:unknown={sale,replayed:false,priceChanged:false}) {
  const calls:unknown[]=[];
  const runtime={access:{readiness:{mode:'approved_staging'},panelOrigin:origin,resolveCredential:async(input:unknown)=>{calls.push({auth:input});return {kind:'authenticated',tenantContext};}},sales:{createSale:async(input:unknown)=>{calls.push({sale:input});return result;},getOperation:async(input:unknown)=>{calls.push({lookup:input});return null;}}} as unknown as ServerInStoreSalesRuntime;
  const handlers=createInStoreSalesHttpHandlers({resolveRuntime:async()=>runtime,now:()=>now,requestId:()=>id});return {handlers,calls};
}
test('create forwards only server tenant authority and stable IDs on the requested tenant host',async()=>{
  const {handlers,calls}=harness();const intent={locationId:id,items:[],discount:null,customerName:null,note:null};
  const response=await handlers.createSale(req('sales',{saleId:id,intent}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{data:{sale,replayed:false,priceChanged:false}});
  assert.deepEqual(calls[1],{sale:{tenantContext,now,saleId:id,operationId:id,intent}});
});
test('cross-origin, foreign store, caller authority and missing session never mutate',async()=>{
  const {handlers,calls}=harness();const body={saleId:id,intent:{locationId:id,items:[],discount:null,customerName:null,note:null}};
  for(const [headers,status] of [[{origin:'https://foreign.example'},403],[{origin:'https://other-store.admin.saas-staging.celebix.net'},403],[{'x-store-id':id},400],[{cookie:''},401]] as const)assert.equal((await handlers.createSale(req('sales',body,headers))).status,status);
  assert.equal(calls.filter(value=>(value as {sale?:unknown}).sale).length,0);
});
test('operation lookup supports unknown commit recovery and rejects result secret extensions',async()=>{
  const {handlers}=harness();const response=await handlers.getOperation(req(`operations/${id}`),id);assert.deepEqual(await response.json(),{data:null});
  const unsafe=harness({sale,replayed:false,priceChanged:false,databasePassword:'secret'});
  const result=await unsafe.handlers.createSale(req('sales',{saleId:id,intent:{locationId:id,items:[],discount:null,customerName:null,note:null}}));
  assert.equal(result.status,503);assert.deepEqual(await result.json(),{code:'unavailable'});
});

test('v2 request forwards negotiated authority and rejects unsupported versions',async()=>{
  const result={sale:{...sale,paymentMethod:null},replayed:false,priceChanged:false};const {handlers,calls}=harness(result);
  const intent={locationId:id,items:[],discount:null,customerName:null,note:null,paymentMethod:null};
  const response=await handlers.createSale(req('sales',{saleId:id,intent},{'x-celebix-in-store-version':'2'}));
  assert.equal(response.status,200);assert.equal((calls[1] as {sale:{contractVersion:number}}).sale.contractVersion,2);
  const count=calls.length;
  assert.equal((await handlers.createSale(req('sales',{saleId:id,intent},{'x-celebix-in-store-version':'4'}))).status,400);
  assert.equal(calls.length,count);
});

test('v3 creates only POS customer contact and rejects caller customer authority and foreign origins',async()=>{
 const customer={id,name:'Ali Veli',firstName:'Ali',lastName:'Veli',phone:'+905551234567',email:null,archived:false};const calls:unknown[]=[];
 const runtime={access:{readiness:{mode:'approved_staging'},panelOrigin:origin,resolveCredential:async()=>({kind:'authenticated',tenantContext:{...tenantContext,membership:{...tenantContext.membership,role:'cashier'}}})},sales:{createCustomer:async(input:unknown)=>{calls.push(input);return {customer,replayed:false};},searchCustomers:async()=>({customers:[customer]})}} as unknown as ServerInStoreSalesRuntime;
 const h=createInStoreSalesHttpHandlers({resolveRuntime:async()=>runtime,now:()=>now,requestId:()=>id});const body={firstName:'Ali',lastName:'Veli',phone:customer.phone,email:null};
 assert.equal((await h.createCustomer(req('customers',body,{'x-celebix-in-store-version':'3'}))).status,200);
 assert.equal((calls[0] as {intent:unknown}).intent&&calls.length,1);
 assert.equal((await h.createCustomer(req('customers',{...body,storeId:id}))).status,400);
 assert.equal((await h.createCustomer(req('customers',body,{origin:'https://foreign.example'}))).status,403);
 assert.equal((await h.searchCustomers(req('customers?query=Ali&limit=20'))).status,200);
});

test('invalid collection remains a useful client error instead of an unknown service failure',async()=>{
  const runtime={access:{panelOrigin:origin,resolveCredential:async()=>({kind:'authenticated',tenantContext})},sales:{prepareSale:async()=>{throw new InStoreSalesRepositoryError('collection_invalid');}}} as unknown as ServerInStoreSalesRuntime;
  const h=createInStoreSalesHttpHandlers({resolveRuntime:async()=>runtime,now:()=>now,requestId:()=>id});
  const response=await h.prepareSale(req(`sales/${id}/prepare`,{expectedVersion:1,expectedTotalCents:1100000},{'x-celebix-in-store-version':'3'}),id);
  assert.equal(response.status,400);assert.deepEqual(await response.json(),{code:'collection_invalid'});
  assert.equal(response.headers.get('cache-control'),'no-store');
});
