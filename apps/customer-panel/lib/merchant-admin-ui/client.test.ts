import assert from"node:assert/strict";import test from"node:test";import{MERCHANT_ADMIN_PROVIDER_RECORD_KINDS,MERCHANT_ADMIN_RECORD_KINDS,type MerchantAdminProviderRecordKind}from"@celebix/saas-contracts";import{createMerchantAdminApi}from"./client.ts";const NOW="2026-07-22T19:00:00.000Z",ID="71000000-0000-4000-8000-000000000001",OP="72000000-0000-4000-8000-000000000001";
function providerKindTypeBoundary(api:ReturnType<typeof createMerchantAdminApi>){if(false){
 // @ts-expect-error non-provider records must not compile at the browser provider list boundary
 void api.providerJobs("discount");
 // @ts-expect-error non-provider records must not compile at the browser provider prepare boundary
 void api.prepareProviderJob("discount",ID,1);
 // @ts-expect-error non-provider records must not compile at the browser provider queue boundary
 void api.queueProviderJob("discount",ID,1,ID,1);
 // @ts-expect-error non-provider records must not compile at the browser provider cancel boundary
 void api.cancelProviderJob("discount",ID,1);
}}
void providerKindTypeBoundary;
function response(value:unknown,status=200){return Response.json(value,{status})}
test("gets one fixed-kind record by exact ID",async()=>{const calls:Array<{path:string;init?:RequestInit}>=[];const api=createMerchantAdminApi((async(input,init)=>{calls.push({path:String(input),init});return response({id:ID,kind:"discount",name:"Yaz",config:{value:15},status:"active",version:1,createdAt:NOW,updatedAt:NOW})})as typeof fetch,()=>OP);assert.equal((await api.record("discount",ID)).id,ID);assert.equal(calls[0]?.path,`/api/merchant-admin/records/discount/${ID}`);assert.equal(calls[0]?.init?.credentials,"same-origin");assert.equal(calls[0]?.init?.cache,"no-store");await assert.rejects(()=>api.record("discount","../private"),TypeError)});
test("loads records and events from finite kind endpoints",async()=>{const paths:string[]=[];const api=createMerchantAdminApi((async(input)=>{paths.push(String(input));return paths.length===1?response({items:[{id:ID,kind:"discount",name:"Yaz",config:{value:15},status:"active",version:1,createdAt:NOW,updatedAt:NOW}]}):response({items:[{id:OP,recordId:ID,recordKind:"discount",eventKind:"saved",summary:{},occurredAt:NOW}]})})as typeof fetch,()=>OP);assert.equal((await api.records("discount"))[0]?.name,"Yaz");assert.equal((await api.events("discount"))[0]?.eventKind,"saved");assert.deepEqual(paths,["/api/merchant-admin/records/discount","/api/merchant-admin/events/discount"])});
test("saves and archives with same-origin credentials",async()=>{const calls:Array<{path:string;init?:RequestInit}>=[];const api=createMerchantAdminApi((async(input,init)=>{calls.push({path:String(input),init});return response({id:ID,kind:"discount",status:calls.length===1?"active":"archived",version:calls.length,updatedAt:NOW,replayed:false})})as typeof fetch,()=>OP);await api.save("discount",{name:"Yaz",config:{value:15},status:"active"});await api.archive("discount",ID,1);assert.equal(calls[0]?.init?.credentials,"same-origin");assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"),OP);assert.equal(calls[1]?.path,`/api/merchant-admin/records/discount/${ID}/archive`)});

test("provider client exposes exact list prepare queue and cancel commands",async()=>{
 const JOB="73000000-0000-4000-8000-000000000001",calls:Array<{path:string;init?:RequestInit}>=[];
 const api=createMerchantAdminApi((async(input,init)=>{calls.push({path:String(input),init});if(calls.length===1)return response({items:[{id:JOB,recordId:ID,recordKind:"marketplace_connection",action:"synchronization",status:"awaiting_provider_activation",version:1,requestedAt:NOW,updatedAt:NOW}]});const status=calls.length===2?"awaiting_provider_activation":calls.length===3?"queued":"cancelled";return response({id:JOB,recordId:ID,recordKind:"marketplace_connection",action:"synchronization",status,...(status==="queued"?{profileId:ID,providerCode:"fixture_provider",credentialVersion:1,attempt:0,safeProviderReference:null,outcomeCode:null}:{}),version:calls.length===2?1:2,updatedAt:NOW,replayed:false})})as typeof fetch,()=>OP);
 assert.equal((await api.providerJobs("marketplace_connection"))[0]?.status,"awaiting_provider_activation");
 assert.equal((await api.prepareProviderJob("marketplace_connection",ID,1)).status,"awaiting_provider_activation");
 assert.equal((await api.queueProviderJob("marketplace_connection",JOB,1,ID,1)).status,"queued");
 assert.equal((await api.cancelProviderJob("marketplace_connection",JOB,1)).status,"cancelled");
 assert.deepEqual(calls.map(({path})=>path),[
  "/api/merchant-admin/provider-jobs/marketplace_connection",
  "/api/merchant-admin/provider-jobs/marketplace_connection",
  `/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/queue`,
  `/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/cancel`,
 ]);
 assert.equal(JSON.stringify(calls).match(/send|success|complete/i),null);
});

test("merchant family client executes exact CRUD for every finite kind and every provider preparation kind", async () => {
 const JOB="73000000-0000-4000-8000-000000000002";
 const calls:Array<{path:string;init?:RequestInit}>=[];
 const api=createMerchantAdminApi((async(input,init)=>{
  const path=String(input);
  calls.push({path,init});
  const providerMatch=/^\/api\/merchant-admin\/provider-jobs\/([^/]+)(?:\/([^/]+)\/(cancel|queue))?$/.exec(path);
  if(providerMatch){
   const recordKind=providerMatch[1]as MerchantAdminProviderRecordKind;
   const action=recordKind==="marketplace_connection"?"synchronization":recordKind==="invoice_integration"?"reconciliation":recordKind==="indexing_request"?"indexing":"delivery";
   if(init?.method!=="POST")return response({items:[{id:JOB,recordId:ID,recordKind,action,status:"awaiting_provider_activation",version:1,requestedAt:NOW,updatedAt:NOW}]});
   const command=providerMatch[3];
   const status=command==="queue"?"queued":command==="cancel"?"cancelled":"awaiting_provider_activation";
   return response({id:JOB,recordId:ID,recordKind,action,status,...(status==="queued"?{profileId:ID,providerCode:"fixture_provider",credentialVersion:1,attempt:0,safeProviderReference:null,outcomeCode:null}:{}),version:command?2:1,updatedAt:NOW,replayed:false});
  }
  const recordMatch=/^\/api\/merchant-admin\/records\/([^/]+)(?:\/([^/]+))?(?:\/archive)?$/.exec(path);
  assert.ok(recordMatch,path);
  const recordKind=recordMatch[1]!;
  if(init?.method!=="POST"){
   const value={id:ID,kind:recordKind,name:`${recordKind} fixture`,config:{},status:"active",version:1,createdAt:NOW,updatedAt:NOW};
   return response(recordMatch[2]?value:{items:[value]});
  }
  if(path.endsWith("/archive"))return response({id:ID,kind:recordKind,status:"archived",version:3,updatedAt:NOW,replayed:false});
  const body=JSON.parse(String(init?.body))as{recordId?:string};
  return response({id:ID,kind:recordKind,status:"active",version:body.recordId?2:1,updatedAt:NOW,replayed:false});
 })as typeof fetch,()=>OP);

 for(const recordKind of MERCHANT_ADMIN_RECORD_KINDS){
  assert.equal((await api.records(recordKind))[0]?.kind,recordKind);
  assert.equal((await api.record(recordKind,ID)).kind,recordKind);
  assert.equal((await api.save(recordKind,{name:`${recordKind} create`,config:{},status:"active"})).version,1);
  assert.equal((await api.save(recordKind,{recordId:ID,expectedVersion:1,name:`${recordKind} update`,config:{},status:"active"})).version,2);
  assert.equal((await api.archive(recordKind,ID,2)).status,"archived");
 }
 for(const recordKind of MERCHANT_ADMIN_PROVIDER_RECORD_KINDS){
  assert.equal((await api.providerJobs(recordKind))[0]?.recordKind,recordKind);
  assert.equal((await api.prepareProviderJob(recordKind,ID,1)).status,"awaiting_provider_activation");
  assert.equal((await api.queueProviderJob(recordKind,JOB,1,ID,1)).status,"queued");
  assert.equal((await api.cancelProviderJob(recordKind,JOB,1)).status,"cancelled");
 }
 assert.equal(calls.length,MERCHANT_ADMIN_RECORD_KINDS.length*5+MERCHANT_ADMIN_PROVIDER_RECORD_KINDS.length*4);
 for(const recordKind of MERCHANT_ADMIN_RECORD_KINDS){
  assert.equal(calls.some(({path})=>path===`/api/merchant-admin/records/${recordKind}/${ID}`),true,recordKind);
  assert.equal(calls.some(({path})=>path===`/api/merchant-admin/records/${recordKind}/${ID}/archive`),true,recordKind);
 }
 for(const recordKind of MERCHANT_ADMIN_PROVIDER_RECORD_KINDS){
  assert.equal(calls.some(({path})=>path===`/api/merchant-admin/provider-jobs/${recordKind}/${JOB}/queue`),true,recordKind);
  assert.equal(calls.some(({path})=>path===`/api/merchant-admin/provider-jobs/${recordKind}/${JOB}/cancel`),true,recordKind);
 }
 assert.equal(calls.every(({init})=>init?.credentials==="same-origin"&&init.cache==="no-store"),true);
});
