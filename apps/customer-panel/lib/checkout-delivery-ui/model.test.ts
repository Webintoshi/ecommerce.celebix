import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { buildCheckoutDeliveryConfig, parseCheckoutDeliveryForm, readCheckoutDeliverySettings, selectCheckoutDeliveryRecord } from "./model.ts";
const record=(status:MerchantAdminRecord["status"],updatedAt:string):MerchantAdminRecord=>({id:"71000000-0000-4000-8000-000000000001",kind:"shipping_setting",name:"Teslimat",config:{shippingPriceCents:1489},status,version:1,createdAt:updatedAt,updatedAt});
test("Turkish delivery prices preserve exact cents and require an explicit fee",()=>{
 assert.deepEqual(parseCheckoutDeliveryForm({price:"14,89",days:"1"}),{shippingPriceCents:1489,estimatedDays:1});
 assert.deepEqual(parseCheckoutDeliveryForm({price:"0",days:""}),{shippingPriceCents:0});
 assert.deepEqual(parseCheckoutDeliveryForm({price:"1.000.000,00",days:"365"}),{shippingPriceCents:100000000,estimatedDays:365});
 for(const price of ["","14.89","14,899","-1","1.000.000,01"," 14,89","1e2"]) assert.equal(parseCheckoutDeliveryForm({price,days:""}),null);
 for(const days of ["0","366","1,5","1.5","01"]) assert.equal(parseCheckoutDeliveryForm({price:"14,89",days}),null);
});
test("load differentiates missing fee from explicit free delivery and refuses malformed persisted values",()=>{
 assert.equal(readCheckoutDeliverySettings({estimatedDays:2}),null);
 assert.deepEqual(readCheckoutDeliverySettings({shippingPriceCents:0}),{shippingPriceCents:0});
 for(const config of [{shippingPriceCents:1.5},{shippingPriceCents:-1},{shippingPriceCents:100000001},{shippingPriceCents:1489,estimatedDays:0},{shippingPriceCents:1489,estimatedDays:366},{shippingPriceCents:1489,estimatedDays:1.5}]) assert.throws(()=>readCheckoutDeliverySettings(config));
});
test("save mapping retains existing legacy config and removes only cleared optional days",()=>{
 const existing={regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:500,estimatedDays:3};
 assert.deepEqual(buildCheckoutDeliveryConfig(existing,{shippingPriceCents:1489,estimatedDays:365}),{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:1489,estimatedDays:365});
 assert.deepEqual(buildCheckoutDeliveryConfig(existing,{shippingPriceCents:0}),{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:0});
 assert.throws(()=>buildCheckoutDeliveryConfig(existing,{} as never));
 assert.deepEqual(existing,{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:500,estimatedDays:3});
});
test("editor selects the latest editable setting without treating archived records as configured",()=>{
 const active=record("active","2026-09-26T00:00:00.000Z"),draft={...record("draft","2026-09-27T00:00:00.000Z"),id:"71000000-0000-4000-8000-000000000002"};
 assert.equal(selectCheckoutDeliveryRecord([draft,active,record("archived","2026-09-28T00:00:00.000Z")]),draft);
 assert.equal(selectCheckoutDeliveryRecord([]),null);
});
