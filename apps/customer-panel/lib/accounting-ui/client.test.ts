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
test('schedule reads carry only allowed due filters and strict responses',async()=>{let path='';const client=m.createAccountingUiClient({fetch:async(input)=>{path=String(input);return Response.json({data:{schedules:[],today:'2026-10-15',hasMore:false}});}});await client.schedules({dueStatus:'overdue',currency:'TRY'});assert.equal(new URL(path,'https://test').searchParams.get('dueStatus'),'overdue');assert.throws(()=>client.schedules({dueStatus:'invalid'} as never));});
test('unknown plan save preserves one key/body and uses its own operation recovery',async()=>{const attempts:{path:string;key:string|null;body:unknown}[]=[];const client=m.createAccountingUiClient({fetch:async(input,init)=>{attempts.push({path:String(input),key:new Headers(init?.headers).get('idempotency-key'),body:init?.body});if(init?.method==='GET')return Response.json({data:null});throw Error('network');}});const intent={receivableId:CUSTOMER,expectedVersion:1,installments:[{dueDate:'2026-10-20',amountCents:50000}]};for(let i=0;i<2;i++)await assert.rejects(()=>client.saveSchedule(intent,OP),e=>e instanceof m.AccountingUiError&&e.unknownResult);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0].path,'/api/accounting/schedules');assert.equal(await client.scheduleOperation(OP),null);assert.equal(attempts[2].path,`/api/accounting/schedule-operations/${OP}`);});
