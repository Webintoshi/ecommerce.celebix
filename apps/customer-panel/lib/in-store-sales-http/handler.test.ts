import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext} from '@celebix/saas-contracts';
import type {ServerInStoreSalesRuntime} from '../server-in-store-sales/runtime.ts';
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
