import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminApi, MerchantAdminApiError } from "../merchant-admin-ui/client.ts";
import { createCheckoutDeliveryClient } from "./client.ts";
import { checkoutDeliveryPresentation } from "./presentation.ts";
const ID="71000000-0000-4000-8000-000000000001",OP="72000000-0000-4000-8000-000000000001",DATE="2026-09-27T00:00:00.000Z";
const record={id:ID,kind:"shipping_setting" as const,name:"Teslimat",config:{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:1000,estimatedDays:2},status:"active" as const,version:7,createdAt:DATE,updatedAt:DATE};
test("delivery save carries preserved config exact version and retry operation through the authenticated transport",async()=>{
 const calls:{path:string;init?:RequestInit}[]=[];
 const api=createCheckoutDeliveryClient(createMerchantAdminApi(async(path,init)=>{
  calls.push({path:String(path),init});
  return Response.json(init?.method==="POST"?{id:ID,kind:"shipping_setting",status:"active",version:8,updatedAt:DATE,replayed:false}:{items:[record]});
 }));
 const workspace=await api.current();
 assert.equal(workspace.record?.version,7);assert.deepEqual(workspace.settings,{shippingPriceCents:1000,estimatedDays:2});
 await api.save({record:workspace.record,settings:{shippingPriceCents:1489},status:"active",operationId:OP});
 await api.save({record:workspace.record,settings:{shippingPriceCents:1489},status:"active",operationId:OP});
 const first=calls[1];assert.equal(first.path,"/api/merchant-admin/records/shipping_setting");
 assert.equal(first.init?.credentials,"same-origin");assert.equal(new Headers(first.init?.headers).get("idempotency-key"),OP);
 assert.deepEqual(JSON.parse(String(first.init?.body)),{recordId:ID,expectedVersion:7,name:"Teslimat",config:{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:1489},status:"active"});
 assert.equal(first.init?.body,calls[2].init?.body);
});
test("missing new fee never mutates and a stale save exposes its conflict without retrying",async()=>{
 let writes=0;
 const api=createCheckoutDeliveryClient(createMerchantAdminApi(async(_path,init)=>{if(init?.method==="POST")writes++;return Response.json({code:"version_conflict"},{status:409});}));
 await assert.rejects(()=>api.save({record:null,settings:{} as never,status:"draft",operationId:OP}));assert.equal(writes,0);
 await assert.rejects(()=>api.save({record,settings:{shippingPriceCents:0,estimatedDays:1},status:"active",operationId:OP}),error=>error instanceof MerchantAdminApiError&&error.code==="version_conflict"&&error.status===409);assert.equal(writes,1);
});
test("load failures and wrong-kind responses remain unavailable rather than appearing unconfigured",async()=>{
 for(const response of [Response.json({code:"unavailable"},{status:503}),Response.json({items:[{...record,kind:"discount"}]})]){
  const api=createCheckoutDeliveryClient(createMerchantAdminApi(async()=>response));
  await assert.rejects(()=>api.current());
 }
});
test("a full window of newer drafts cannot prove that checkout has no older active fee",async()=>{
 const drafts=Array.from({length:200},(_,index)=>({...record,id:`71000000-0000-4000-8000-${String(index+2).padStart(12,"0")}`,status:"draft" as const}));
 const api=createCheckoutDeliveryClient(createMerchantAdminApi(async()=>Response.json({items:drafts})));
 const view=checkoutDeliveryPresentation(await api.current());
 assert.equal(view.label,"Taslak");
 assert.equal(view.checkoutDetail,"Ödeme adımındaki etkin teslimat ayarı şu anda doğrulanamıyor.");
 const knownEmpty=createCheckoutDeliveryClient(createMerchantAdminApi(async()=>Response.json({items:drafts.slice(1)})));
 assert.equal(checkoutDeliveryPresentation(await knownEmpty.current()).checkoutDetail,"Ödeme adımında etkin teslimat ayarı yok.");
 const active=createCheckoutDeliveryClient(createMerchantAdminApi(async()=>Response.json({items:[...drafts.slice(1),record]})));
 assert.equal(checkoutDeliveryPresentation(await active.current()).checkoutDetail,"Ödeme adımında 10,00 TL kullanılıyor.");
});
