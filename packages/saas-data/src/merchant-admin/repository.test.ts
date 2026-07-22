import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { MerchantAdminRepositoryError, PostgresMerchantAdminRepository } from "./index.ts";

const STORE="33333333-3333-4333-8333-333333333333", PRINCIPAL="44444444-4444-4444-8444-444444444444", MEMBERSHIP="55555555-5555-4555-8555-555555555555", PLAN="66666666-6666-4666-8666-666666666666", RECORD="71000000-0000-4000-8000-000000000001", OP="72000000-0000-4000-8000-000000000001", NOW=new Date("2026-07-22T19:00:00.000Z");
function tenant(): TenantContext { return { schemaVersion:1, requestId:"private", principal:{id:PRINCIPAL,issuer:"https://id.test/oidc",subject:"private"}, store:{id:STORE,slug:"store",status:"active"}, membership:{id:MEMBERSHIP,role:"store_owner",status:"active"}, entitlements:{schemaVersion:1,planId:PLAN,planCode:"growth",version:2,status:"active",features:["catalog"],limits:{products:100,staff:5,storageBytes:1024},validFrom:"2026-01-01T00:00:00.000Z"}, locale:"tr-TR" } as TenantContext }
type Row=Record<string,unknown>; type Responder=(text:string,values:unknown[])=>Row[]|Promise<Row[]>;
class Client { readonly calls:Array<{text:string;values:unknown[]}>=[]; readonly releases:unknown[]=[]; readonly responder:Responder; constructor(responder:Responder=()=>[]){this.responder=responder} async query(text:string,values:unknown[]=[]){this.calls.push({text,values});const rows=await this.responder(text,values);return{rows,rowCount:rows.length,command:"",oid:0,fields:[]}} release(value?:unknown){this.releases.push(value)} }
class Pool { private index=0; readonly clients:Client[]; constructor(clients:Client[]){this.clients=clients} async connect(){const client=this.clients[this.index++];if(!client)throw new Error("checkout");return client} }
function repository(pool:Pool,audit:string[]=[]){return new PostgresMerchantAdminRepository({pool,role:"celebix_saas_app",timeouts:{poolCheckoutMs:100,statementMs:500,lockMs:300,idleTransactionMs:700},uuid:()=>RECORD,audit:(event)=>{audit.push(event.type)}})}
function call(client:Client,name:string){const found=client.calls.find((entry)=>entry.text.includes(`saas.${name}`));assert.ok(found);return found}
function mutation(status="active"){return{id:RECORD,kind:"discount",status,version:1,updatedAt:NOW.toISOString()}}

test("lists durable tenant records and immutable audit events",async()=>{
 const reader=new Client((text)=>text.includes("merchant_admin_list_events")?[{outcome:"listed",result_payload:{items:[{id:OP,recordId:RECORD,recordKind:"discount",eventKind:"coupon_used",summary:{orderReference:"safe"},occurredAt:NOW.toISOString()}]}}]:text.includes("merchant_admin_list")?[{outcome:"listed",result_payload:{items:[{id:RECORD,kind:"discount",name:"Yaz Indirimi",config:{discountType:"percent",value:15},status:"active",version:1,createdAt:NOW.toISOString(),updatedAt:NOW.toISOString()}]}}]:[]);
 const repo=repository(new Pool([reader,new Client(reader.responder)]));
 assert.equal((await repo.list({tenantContext:tenant(),now:NOW,kind:"discount"}))[0]?.name,"Yaz Indirimi");
 assert.equal((await repo.listEvents({tenantContext:tenant(),now:NOW,kind:"discount"}))[0]?.eventKind,"coupon_used");
 assert.deepEqual(call(reader,"merchant_admin_list").values,[STORE,PRINCIPAL,MEMBERSHIP,PLAN,"growth",2,NOW,"discount"]);
});

test("saves and archives with exact versioned authority",async()=>{
 const writer=new Client((text)=>text.includes("merchant_admin_save")?[{outcome:"saved",result_payload:mutation()}]:[]);
 const saved=await repository(new Pool([writer])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz Indirimi",config:{discountType:"percent",value:15},status:"active"});
 assert.equal(saved.id,RECORD); assert.equal(call(writer,"merchant_admin_save").values[11],"discount");
 const archive=new Client((text)=>text.includes("merchant_admin_archive")?[{outcome:"archived",result_payload:{...mutation("archived"),version:2}}]:[]);
 assert.equal((await repository(new Pool([archive])).archive({tenantContext:tenant(),now:NOW,operationId:OP,recordId:RECORD,expectedVersion:1})).status,"archived");
});

test("rejects secret-bearing config before SQL",async()=>{
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"marketplace_connection",name:"Pazar",config:{apiSecret:"never"},status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
 await assert.rejects(()=>repository(new Pool([])).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz",config:{unexpectedField:"never"},status:"draft"}),(error:unknown)=>error instanceof MerchantAdminRepositoryError&&error.code==="invalid_input");
});

test("unknown commit destroys writer and performs one read-only recovery",async()=>{
 let commits=0;const writer=new Client((text)=>{if(text.includes("merchant_admin_save"))return[{outcome:"saved",result_payload:mutation()}];if(text==="COMMIT"&&commits++===0)throw new Error("wire");return[]});
 const recovery=new Client((text)=>text.includes("merchant_admin_recover_operation")?[{outcome:"operation_replayed",result_payload:mutation()}]:[]),audit:string[]=[];
 const result=await repository(new Pool([writer,recovery]),audit).save({tenantContext:tenant(),now:NOW,operationId:OP,kind:"discount",name:"Yaz",config:{value:15},status:"active"});
 assert.equal(result.replayed,true);assert.deepEqual(writer.releases,[true]);assert.equal(recovery.calls[0]?.text,"BEGIN READ ONLY");assert.deepEqual(audit,["merchant_admin_commit_unknown"]);
});
