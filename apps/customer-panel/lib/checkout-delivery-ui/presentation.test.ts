import assert from "node:assert/strict";
import test from "node:test";
import { checkoutDeliveryPresentation, deliveryPriceInput } from "./presentation.ts";
const record={id:"71000000-0000-4000-8000-000000000001",kind:"shipping_setting" as const,name:"Teslimat",config:{shippingPriceCents:1489},status:"active" as const,version:1,createdAt:"2026-09-27T00:00:00.000Z",updatedAt:"2026-09-27T00:00:00.000Z"};
test("delivery status keeps missing fee draft and explicit free delivery distinct",()=>{
 assert.equal(checkoutDeliveryPresentation({record:null,settings:null}).label,"Tanımlanmadı");
 assert.equal(checkoutDeliveryPresentation({record,settings:null}).label,"Ücret tanımlanmadı");
 assert.equal(checkoutDeliveryPresentation({record,settings:null}).detail,"Teslimat ücretini açıkça tanımlayın.");
 assert.equal(checkoutDeliveryPresentation({record:{...record,status:"draft"},settings:{shippingPriceCents:1489}}).label,"Taslak");
 assert.equal(checkoutDeliveryPresentation({record,settings:{shippingPriceCents:0}}).fee,"Ücretsiz teslimat");
 assert.equal(checkoutDeliveryPresentation({record,settings:{shippingPriceCents:1489}}).fee,"14,89 TL");
 assert.equal(deliveryPriceInput(100000000),"1000000,00");
});
