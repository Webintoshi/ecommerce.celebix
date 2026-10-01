import assert from "node:assert/strict";
import test from "node:test";
import { createVatanSmsWhatsAppDelivery } from "./whatsapp-delivery.ts";
const message={phone:"+904526060552",code:"000001",storeName:"Alpler Spor",idempotencyKey:"10000000-0000-4000-8000-000000000001"};
const good={code:200,status:"OK",reports:[{reportId:"10000000-0000-4000-8000-000000000002",phone:"904526060552"}]};
test("VatanSMS sends one immediate store-branded OTP via the documented endpoint and accepts a matching report",async()=>{
  let actual:Request|undefined; const delivery=createVatanSmsWhatsAppDelivery({apiKey:"a".repeat(24),regId:"2620466171",timeoutMs:1000,fetch:async request=>{actual=request;return Response.json(good);}});
  await delivery(message); assert.equal(actual?.url,"https://api.toplusms.app/bulk/wp/nton");assert.equal(actual?.redirect,"error");assert.equal(actual?.headers.get("X-Api-Key"),"a".repeat(24));
  const body=await actual!.json();assert.equal(body.messages.length,1);assert.equal(body.messages[0].target,"904526060552");assert.equal(body.messages[0].reg_id,"2620466171");assert.match(body.messages[0].message,/Alpler Spor.*000001/u);
});
test("HTTP200 does not turn errors, missing reports or a different recipient into sent OTP",async()=>{
  for(const response of [Response.json({error:{code:403,message:"secret"}}),Response.json({code:200,status:"OK",reports:[]}),Response.json({...good,reports:[{...good.reports[0],phone:"905551112233"}]}),Response.json(good,{status:401}),new Response("x".repeat(33000))]){
    const delivery=createVatanSmsWhatsAppDelivery({apiKey:"a".repeat(24),regId:"2620466171",timeoutMs:1000,fetch:async()=>response});await assert.rejects(delivery(message),/storefront_whatsapp_delivery_unavailable/u);
  }
});
test("provider timeout sends once, does not retry ambiguously and does not disclose the key or code",async()=>{
  let calls=0;const delivery=createVatanSmsWhatsAppDelivery({apiKey:"a".repeat(24),regId:"2620466171",timeoutMs:1000,fetch:async()=>{calls++;throw new Error("private provider payload");}});
  await assert.rejects(delivery(message),/storefront_whatsapp_delivery_unavailable/u);assert.equal(calls,1);
});
