import assert from"node:assert/strict";import test from"node:test";import{createMerchantAdminApi}from"./client.ts";const NOW="2026-07-22T19:00:00.000Z",ID="71000000-0000-4000-8000-000000000001",OP="72000000-0000-4000-8000-000000000001";
function providerKindTypeBoundary(api:ReturnType<typeof createMerchantAdminApi>){if(false){
 // @ts-expect-error non-provider records must not compile at the browser provider list boundary
 void api.providerJobs("discount");
 // @ts-expect-error non-provider records must not compile at the browser provider prepare boundary
 void api.prepareProviderJob("discount",ID,1);
 // @ts-expect-error non-provider records must not compile at the browser provider cancel boundary
 void api.cancelProviderJob("discount",ID,1);
}}
void providerKindTypeBoundary;
function response(value:unknown,status=200){return Response.json(value,{status})}
test("loads records and events from finite kind endpoints",async()=>{const paths:string[]=[];const api=createMerchantAdminApi((async(input)=>{paths.push(String(input));return paths.length===1?response({items:[{id:ID,kind:"discount",name:"Yaz",config:{value:15},status:"active",version:1,createdAt:NOW,updatedAt:NOW}]}):response({items:[{id:OP,recordId:ID,recordKind:"discount",eventKind:"saved",summary:{},occurredAt:NOW}]})})as typeof fetch,()=>OP);assert.equal((await api.records("discount"))[0]?.name,"Yaz");assert.equal((await api.events("discount"))[0]?.eventKind,"saved");assert.deepEqual(paths,["/api/merchant-admin/records/discount","/api/merchant-admin/events/discount"])});
test("saves and archives with same-origin credentials",async()=>{const calls:Array<{path:string;init?:RequestInit}>=[];const api=createMerchantAdminApi((async(input,init)=>{calls.push({path:String(input),init});return response({id:ID,kind:"discount",status:calls.length===1?"active":"archived",version:calls.length,updatedAt:NOW,replayed:false})})as typeof fetch,()=>OP);await api.save("discount",{name:"Yaz",config:{value:15},status:"active"});await api.archive("discount",ID,1);assert.equal(calls[0]?.init?.credentials,"same-origin");assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"),OP);assert.equal(calls[1]?.path,`/api/merchant-admin/records/discount/${ID}/archive`)});

test("provider client exposes only list prepare and cancel preparation commands",async()=>{
 const JOB="73000000-0000-4000-8000-000000000001",calls:Array<{path:string;init?:RequestInit}>=[];
 const api=createMerchantAdminApi((async(input,init)=>{calls.push({path:String(input),init});if(calls.length===1)return response({items:[{id:JOB,recordId:ID,recordKind:"marketplace_connection",action:"synchronization",status:"awaiting_provider_activation",version:1,requestedAt:NOW,updatedAt:NOW}]});return response({id:JOB,recordId:ID,recordKind:"marketplace_connection",action:"synchronization",status:calls.length===2?"awaiting_provider_activation":"cancelled",version:calls.length===2?1:2,updatedAt:NOW,replayed:false})})as typeof fetch,()=>OP);
 assert.equal((await api.providerJobs("marketplace_connection"))[0]?.status,"awaiting_provider_activation");
 assert.equal((await api.prepareProviderJob("marketplace_connection",ID,1)).status,"awaiting_provider_activation");
 assert.equal((await api.cancelProviderJob("marketplace_connection",JOB,1)).status,"cancelled");
 assert.deepEqual(calls.map(({path})=>path),[
  "/api/merchant-admin/provider-jobs/marketplace_connection",
  "/api/merchant-admin/provider-jobs/marketplace_connection",
  `/api/merchant-admin/provider-jobs/marketplace_connection/${JOB}/cancel`,
 ]);
 assert.equal(JSON.stringify(calls).match(/send|success|complete/i),null);
});
