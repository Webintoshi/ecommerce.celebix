import assert from "node:assert/strict";
import test from "node:test";
import { createInStoreSalesUiClient, InStoreSalesUiError } from "./client.ts";
const SALE_ID="9e000000-0000-4000-8000-000000000001", OP="9e000000-0000-4000-8000-000000000002", LOCATION="9e000000-0000-4000-8000-000000000003";
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
test("barcode lookup preserves leading zeros and uses exact barcode parameter",async()=>{
  let url="";const client=createInStoreSalesUiClient({fetch:async(input)=>{url=String(input);return reply({data:{products:[]}});}});
  assert.deepEqual(await client.searchProducts({locationId:LOCATION,barcode:"0001234567890"}),[]);
  const query=new URL(url,"https://example.test").searchParams;
  assert.equal(query.get("barcode"),"0001234567890");assert.equal(query.has("query"),false);assert.equal(query.get("locationId"),LOCATION);
});
test("mutation sends caller supplied operation ID unchanged on retry",async()=>{
  const keys:string[]=[];const bodies:string[]=[];
  const client=createInStoreSalesUiClient({fetch:async(_url,init)=>{keys.push(new Headers(init?.headers).get("idempotency-key")!);bodies.push(String(init?.body));return reply({code:"unavailable"},503);}});
  for(let i=0;i<2;i++) await assert.rejects(client.confirmPayment(SALE_ID,{expectedVersion:3,slipReference:null},OP),InStoreSalesUiError);
  assert.deepEqual(keys,[OP,OP]);assert.equal(bodies[0],bodies[1]);assert.deepEqual(JSON.parse(bodies[0]),{expectedVersion:3,slipReference:null});
});
test("malformed success envelope is an unknown mutation result",async()=>{
  const client=createInStoreSalesUiClient({fetch:async()=>reply({data:{sale:{},replayed:false,priceChanged:false},authority:"forged"})});
  await assert.rejects(client.prepareSale(SALE_ID,{expectedVersion:2,expectedTotalCents:180000},OP),(error:unknown)=>error instanceof InStoreSalesUiError&&error.unknownResult);
});
test("network failure on payment has unknown outcome and never retries automatically",async()=>{
  let calls=0;const client=createInStoreSalesUiClient({fetch:async()=>{calls++;throw new Error("network");}});
  await assert.rejects(client.confirmPayment(SALE_ID,{expectedVersion:3,slipReference:null},OP),(error:unknown)=>error instanceof InStoreSalesUiError&&error.unknownResult);
  assert.equal(calls,1);
});
test("known validation response is safe to display without pretending payment was saved",async()=>{
  const client=createInStoreSalesUiClient({fetch:async()=>reply({code:"discount_denied"},403)});
  await assert.rejects(client.prepareSale(SALE_ID,{expectedVersion:3,expectedTotalCents:1},OP),(error:unknown)=>error instanceof InStoreSalesUiError&&error.code==="discount_denied"&&!error.unknownResult);
});
test("operation recovery allows null and does not infer unpaid from a missing result",async()=>{
  const client=createInStoreSalesUiClient({fetch:async()=>reply({data:null})});
  assert.equal(await client.getOperation(OP),null);
});
test("foreign authority fields and ambiguous barcode/query are rejected before network",async()=>{
  let calls=0;const client=createInStoreSalesUiClient({fetch:async()=>{calls++;return reply({data:{products:[]}});}});
  await assert.rejects(client.searchProducts({locationId:LOCATION,barcode:"123",query:"shirt"} as never));
  await assert.rejects(client.prepareSale(SALE_ID,{expectedVersion:3,expectedTotalCents:10,storeId:LOCATION} as never,OP));
  assert.equal(calls,0);
});
test("first staff grant accepts version zero and preserves exact authorized membership body",async()=>{
  let submitted:unknown;
  const grant={membershipId:SALE_ID,label:"Kasiyer",role:"cashier",enabled:true,locationIds:[LOCATION],discountLimitBps:1000,version:1};
  const client=createInStoreSalesUiClient({fetch:async(_url,init)=>{submitted=JSON.parse(String(init?.body));return reply({data:grant});}});
  assert.deepEqual(await client.setStaffGrant(SALE_ID,{expectedVersion:0,enabled:true,locationIds:[LOCATION],discountLimitBps:1000},OP),grant);
  assert.deepEqual(submitted,{expectedVersion:0,enabled:true,locationIds:[LOCATION],discountLimitBps:1000});
});
test("a manual slip reference beyond the database limit is rejected before network",async()=>{
  let calls=0;const client=createInStoreSalesUiClient({fetch:async()=>{calls++;return reply({data:null});}});
  await assert.rejects(client.confirmPayment(SALE_ID,{expectedVersion:1,slipReference:"a".repeat(101)},OP));assert.equal(calls,0);
});
test("registered barcode boundary accepts 128 characters and rejects 129 before fetch",async()=>{
  let calls=0;const client=createInStoreSalesUiClient({fetch:async()=>{calls++;return reply({data:{products:[]}});}});
  await client.searchProducts({locationId:LOCATION,barcode:"A".repeat(128)});await assert.rejects(client.searchProducts({locationId:LOCATION,barcode:"A".repeat(129)}));assert.equal(calls,1);
});
