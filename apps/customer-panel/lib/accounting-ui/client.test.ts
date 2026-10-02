import assert from "node:assert/strict";
import test from "node:test";
const m=await import("./client.ts").catch(()=>({})) as typeof import("./client.ts");
const CUSTOMER="9e000000-0000-4000-8000-000000000001",OP="9e000000-0000-4000-8000-000000000002";
const body={customerId:CUSTOMER,orderId:null,amountCents:50000,currency:"TRY",paymentMethod:"cash" as const,accountId:null,expectedVersion:1,note:null};
test("uncertain collection keeps one immutable request and operation key for a manual retry",async()=>{
  assert.equal(typeof m.createAccountingUiClient,"function");const attempts:{key:string|null;body:string;path:string}[]=[];
  const client=m.createAccountingUiClient({fetch:async(input,init)=>{attempts.push({key:new Headers(init?.headers).get("idempotency-key"),body:String(init?.body),path:String(input)});throw new Error("network");}});
  for(let n=0;n<2;n++)await assert.rejects(client.mutate("collect",body,OP),(e:unknown)=>e instanceof m.AccountingUiError&&e.unknownResult);
  assert.equal(attempts.length,2);assert.equal(attempts[0].key,OP);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0].path,"/api/accounting/collections");
});
test("accounting rejects foreign authority and fractional cents before network",async()=>{
  assert.equal(typeof m.createAccountingUiClient,"function");let count=0;const client=m.createAccountingUiClient({fetch:async()=>{count++;throw new Error("unexpected");}});
  await assert.rejects(client.mutate("collect",{...body,storeId:CUSTOMER} as never,OP));await assert.rejects(client.mutate("collect",{...body,amountCents:1.5},OP));assert.equal(count,0);
});
test("filter dates and currencies stay explicit in overview requests",async()=>{
  assert.equal(typeof m.createAccountingUiClient,"function");let path="";const client=m.createAccountingUiClient({fetch:async(input)=>{path=String(input);return new Response(JSON.stringify({data:{currencies:[],accounts:[],recentEvents:[]}}),{headers:{"content-type":"application/json"}});}});
  await client.overview({dateFrom:"2026-09-01",dateTo:"2026-10-02",channel:"POS",currency:"TRY"});const query=new URL(path,"https://panel.test").searchParams;assert.equal(query.get("channel"),"POS");assert.equal(query.get("dateFrom"),"2026-09-01");
});

test("server collection preview carries order scope and current authoritative version",async()=>{
 let path="";const preview={customerId:CUSTOMER,currency:"TRY",version:4,dueCents:600000,allocations:[{receivableId:CUSTOMER,orderId:CUSTOMER,amountCents:200000}]};const client=m.createAccountingUiClient({fetch:async(input)=>{path=String(input);return new Response(JSON.stringify({data:preview}),{headers:{"content-type":"application/json"}});}});
 assert.equal(typeof client.collectionPreview,"function");assert.deepEqual(await client.collectionPreview({customerId:CUSTOMER,orderId:CUSTOMER,amountCents:200000,currency:"TRY"}),preview);const params=new URL(path,"https://panel.test").searchParams;assert.equal(params.get("amountCents"),"200000");assert.equal(params.get("orderId"),CUSTOMER);
});

test("collection account choices use the unfiltered masked endpoint and filter currency locally",async()=>{let path="";const accounts=[{id:CUSTOMER,name:"Kasa",type:"cash",currency:"TRY"},{id:OP,name:"EUR banka",type:"bank",currency:"EUR"}];const client=m.createAccountingUiClient({fetch:async(input)=>{path=String(input);return new Response(JSON.stringify({data:{accounts}}),{headers:{"content-type":"application/json"}});}});assert.deepEqual(await client.collectionAccounts("TRY"),{accounts:[accounts[0]]});assert.equal(path,"/api/accounting/collection-accounts");});
