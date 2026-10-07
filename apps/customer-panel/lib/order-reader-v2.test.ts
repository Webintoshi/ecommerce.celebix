import assert from "node:assert/strict";
import test from "node:test";
import { createOrderApiClient } from "./order-ui/client.ts";
const ID="11111111-1111-4111-8111-111111111111";
const row={id:ID,orderNumber:"POS-000001",source:"in_store",customerName:"Historic",customerEmail:"old@example.test",currency:"TRY",totalCents:1000,status:"delivered",paymentStatus:"completed",itemCount:0,createdAt:"2026-10-07T08:00:00.000Z",updatedAt:"2026-10-07T08:00:00.000Z",version:1,customerId:ID,currentCustomer:{id:ID,name:"Corrected",email:null,phone:null,archived:false},salesChannel:"manual",socialPlatform:null,socialReference:null,fulfillmentMethod:"pickup"};
test("explicit orders reader 2 sends the header and preserves cleared contact in browser list and detail",async()=>{
 const seen:RequestInit[]=[];
 const api=createOrderApiClient({ordersVersion:2,fetch:async(path,init)=>{seen.push(init!);return Response.json(String(path).includes("?")?{items:[row]}:{...row,subtotalCents:1000,shippingCents:0,discountCents:0,shippingAddress:null,billingAddress:null,items:[],events:[],notes:[]});}});
 assert.equal((await api.listOrders()).items[0]!.currentCustomer!.email,null);
 assert.equal((await api.getOrder(ID)).currentCustomer!.phone,null);
 assert.ok(seen.every(init=>new Headers(init.headers).get("X-Celebix-Orders-Version")==="2"));
});
