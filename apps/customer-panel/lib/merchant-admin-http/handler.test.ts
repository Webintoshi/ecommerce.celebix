import assert from"node:assert/strict";import test from"node:test";import type{TenantContext}from"@celebix/saas-contracts";import type{MerchantAdminRepository}from"@celebix/saas-data";import{createMerchantAdminHttpHandlers}from"./handler.ts";
const ORIGIN="https://panel.test",OP="74000000-0000-4000-8000-000000000001",REQ="78000000-0000-4000-8000-000000000001",RECORD="71000000-0000-4000-8000-000000000001",NOW=new Date("2026-07-22T19:00:00.000Z"),CREDENTIAL=`v1.panel.current.${Buffer.alloc(32,1).toString("base64url")}`;
const JOB="73000000-0000-4000-8000-000000000001";
function tenant():TenantContext{return{schemaVersion:1,requestId:REQ,principal:{id:"10000000-0000-4000-8000-000000000001",issuer:"https://id.test/oidc",subject:"x"},store:{id:"20000000-0000-4000-8000-000000000001",slug:"store",status:"active"},membership:{id:"30000000-0000-4000-8000-000000000001",role:"store_owner",status:"active"},entitlements:{schemaVersion:1,planId:"40000000-0000-4000-8000-000000000001",planCode:"growth",version:2,status:"active",features:["catalog"],limits:{products:100,staff:5,storageBytes:100},validFrom:"2026-01-01T00:00:00.000Z"},locale:"tr-TR"}as TenantContext}
function repo(overrides:Partial<MerchantAdminRepository>={}):MerchantAdminRepository{const reject=async()=>{throw new Error("unexpected")};return{list:reject,listEvents:reject,save:reject,archive:reject,...overrides}as MerchantAdminRepository}
function request(path:string,method="GET",value?:unknown,origin=ORIGIN,headers?:HeadersInit){const prepared=new Headers(headers);prepared.set("cookie",`__Host-celebix_panel=${CREDENTIAL}`);if(method==="POST"){prepared.set("origin",origin);prepared.set("content-type","application/json");prepared.set("idempotency-key",OP)}return new Request(`http://internal:3400${path}`,{method,headers:prepared,body:value===undefined?undefined:JSON.stringify(value)})}
function handlers(merchantAdmin:MerchantAdminRepository,profiles?:{list(input:unknown):Promise<readonly unknown[]>}){return createMerchantAdminHttpHandlers({async resolveRuntime(){return{merchantAdmin,access:{readiness:{mode:"approved_staging"},panelOrigin:ORIGIN,async resolveCredential(){return{kind:"authenticated",session:{},tenantContext:tenant()}},async rotateCredential(){return{kind:"unavailable"}},async revokeCredential(){return{kind:"unavailable"}}}}as never},async resolveProviderRuntime(){return profiles?{profiles,registry:{size:1}}as never:null},now:()=>new Date(NOW),requestId:()=>REQ})}
test("record detail GET binds exact kind and ID and rejects near paths and request authority",async()=>{
 const calls:unknown[]=[];
 const h=handlers(repo({async get(input){calls.push(input);return{id:RECORD,kind:"discount",name:"Yaz",config:{value:15},status:"active",version:1,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}}}));
 assert.equal((await h.record(request(`/api/merchant-admin/records/discount/${RECORD}`),"discount",RECORD)).status,200);
 assert.equal((await h.record(request(`/api/merchant-admin/records/discount/${RECORD}?x=1`),"discount",RECORD)).status,400);
 assert.equal((await h.record(request(`/api/merchant-admin/records/discount/${RECORD}`,"GET",undefined,ORIGIN,{"x-store-id":RECORD}),"discount",RECORD)).status,400);
 assert.equal((await h.record(request(`/api/merchant-admin/records/page/${RECORD}`),"discount",RECORD)).status,400);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{tenantContext:tenant(),now:NOW,kind:"discount",recordId:RECORD});
});
test("lists saves and archives with server TenantContext only",async()=>{const calls:unknown[]=[];const h=handlers(repo({async list(input){calls.push(input);return[{id:RECORD,kind:"discount",name:"Yaz",config:{value:15},status:"active",version:1,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]},async save(input){calls.push(input);return{id:RECORD,kind:"discount",status:"active",version:1,updatedAt:NOW.toISOString(),replayed:false}},async archive(input){calls.push(input);return{id:RECORD,kind:"discount",status:"archived",version:2,updatedAt:NOW.toISOString(),replayed:false}}}));assert.equal((await h.records(request("/api/merchant-admin/records/discount"),"discount")).status,200);assert.equal((await h.save(request("/api/merchant-admin/records/discount","POST",{name:"Yaz",config:{value:15},status:"active"}),"discount")).status,200);assert.equal((await h.archive(request(`/api/merchant-admin/records/discount/${RECORD}/archive`,"POST",{expectedVersion:1}),"discount",RECORD)).status,200);assert.equal(calls.length,3);assert.equal(JSON.stringify(calls).includes(CREDENTIAL),false)});
test("audit endpoint is read-only and exact path",async()=>{const h=handlers(repo({async listEvents(){return[{id:OP,recordId:RECORD,recordKind:"discount",eventKind:"saved",summary:{},occurredAt:NOW.toISOString()}]}}));assert.equal((await h.events(request("/api/merchant-admin/events/discount"),"discount")).status,200);assert.equal((await h.events(request("/api/merchant-admin/events/discount-child"),"discount")).status,400)});
test("wrong origin private authority and secret config fail closed",async()=>{let calls=0;const h=handlers(repo({async save(){calls++;throw new Error("unexpected")}}));assert.equal((await h.save(request("/api/merchant-admin/records/marketplace_connection","POST",{name:"Pazar",config:{apiSecret:"x"},status:"draft"}),"marketplace_connection")).status,400);assert.equal((await h.save(request("/api/merchant-admin/records/discount","POST",{name:"Yaz",config:{},status:"active"},"https://attacker.test"),"discount")).status,403);assert.equal((await h.records(request("/api/merchant-admin/records/discount","GET",undefined,ORIGIN,{"x-store-id":RECORD}),"discount")).status,400);assert.equal(calls,0)});

test("lists prepares and cancels provider work as preparation only",async()=>{
 const calls:unknown[]=[];
 const h=handlers(repo({
  async listProviderJobs(input){calls.push(input);return[{id:JOB,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"awaiting_provider_activation",profileId:null,providerCode:null,credentialVersion:null,attempt:0,safeProviderReference:null,outcomeCode:null,version:1,requestedAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]},
  async prepareProviderJob(input){calls.push(input);return{id:JOB,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"awaiting_provider_activation",profileId:null,providerCode:null,credentialVersion:null,attempt:0,safeProviderReference:null,outcomeCode:null,version:1,updatedAt:NOW.toISOString(),replayed:false}},
  async cancelProviderJob(input){calls.push(input);return{id:JOB,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"cancelled",profileId:null,providerCode:null,credentialVersion:null,attempt:0,safeProviderReference:null,outcomeCode:null,version:2,updatedAt:NOW.toISOString(),replayed:false}},
 }));
 const listed=await h.providerJobs(request("/api/merchant-admin/provider-jobs/marketplace_connection"),"marketplace_connection");
 const prepared=await h.prepareProviderJob(request("/api/merchant-admin/provider-jobs/marketplace_connection","POST",{recordId:RECORD,expectedRecordVersion:1}),"marketplace_connection");
 const cancelled=await h.cancelProviderJob(request(`/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/cancel`,"POST",{expectedVersion:1}),"marketplace_connection",JOB);
 assert.deepEqual([listed.status,prepared.status,cancelled.status],[200,200,200]);
 assert.equal((await prepared.json()).status,"awaiting_provider_activation");
 assert.equal(JSON.stringify(calls).includes(CREDENTIAL),false);
});

test("provider endpoints reject non-provider kinds and private request authority before repository access",async()=>{
 let calls=0;const h=handlers(repo({async listProviderJobs(){calls++;return[]}}));
 assert.equal((await h.providerJobs(request("/api/merchant-admin/provider-jobs/discount"),"discount")).status,400);
 assert.equal((await h.prepareProviderJob(request("/api/merchant-admin/provider-jobs/marketplace_connection","POST",{recordId:RECORD,expectedRecordVersion:1},ORIGIN,{"x-store-id":RECORD}),"marketplace_connection")).status,400);
 assert.equal(calls,0);
});

test("queue binds one active exact-capability profile before the app mutation",async()=>{
 const PROFILE="74000000-0000-4000-8000-000000000001",calls:Array<{kind:string;input:unknown}>=[];
 const h=handlers(repo({async queueProviderJob(input){calls.push({kind:"queue",input});return{id:JOB,recordId:RECORD,recordKind:"marketplace_connection",action:"synchronization",status:"queued",profileId:PROFILE,providerCode:"fixture_provider",credentialVersion:2,attempt:0,safeProviderReference:null,outcomeCode:null,version:2,updatedAt:NOW.toISOString(),replayed:false}}}),{async list(input){calls.push({kind:"profiles",input});return[{id:PROFILE,providerCode:"fixture_provider",capability:"marketplace_sync",publicConfig:{},maskedAccountReference:"••••nt-42",status:"active",credentialVersion:2,version:3,lastValidatedAt:NOW.toISOString(),createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]}});
 const response=await h.queueProviderJob(request(`/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/queue`,"POST",{expectedJobVersion:1,profileId:PROFILE,expectedProfileVersion:3}),"marketplace_connection",JOB);
 assert.equal(response.status,200);assert.deepEqual(calls.map((entry)=>entry.kind),["profiles","queue"]);
 assert.equal(JSON.stringify(calls).includes(CREDENTIAL),false);
});

test("queue rejects pending disabled and wrong-capability profiles before repository mutation",async()=>{
 const PROFILE="74000000-0000-4000-8000-000000000001";
 for(const selected of [
  {status:"pending_validation",capability:"marketplace_sync",expected:409},
  {status:"disabled",capability:"marketplace_sync",expected:409},
  {status:"active",capability:"email_delivery",expected:409},
 ]as const){
  let queueCalls=0;
  const h=handlers(repo({async queueProviderJob(){queueCalls+=1;throw new Error("unexpected")}}),{async list(){return[{id:PROFILE,providerCode:"fixture_provider",capability:selected.capability,publicConfig:{},maskedAccountReference:"••••nt-42",status:selected.status,credentialVersion:2,version:3,lastValidatedAt:null,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]}});
  const response=await h.queueProviderJob(request(`/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/queue`,"POST",{expectedJobVersion:1,profileId:PROFILE,expectedProfileVersion:3}),"marketplace_connection",JOB);
  assert.equal(response.status,selected.expected);
  assert.equal(queueCalls,0);
 }
});
