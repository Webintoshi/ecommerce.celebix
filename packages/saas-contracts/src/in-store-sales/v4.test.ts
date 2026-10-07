import assert from 'node:assert/strict';
import test from 'node:test';
import {parseInStoreSaleIntent,parseInStoreSale} from './index.ts';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const intent={locationId:id,items:[{variantId:other,quantity:1,unitPriceOverrideCents:null}],discount:null,customerName:null,note:null,customerId:null,dueDate:null,salesChannel:'manual',socialPlatform:null,socialReference:null,fulfillmentMethod:'pickup',shippingAddress:null,billingAddress:null,shippingCents:0,paymentParts:[{partId:id,paymentMethod:'cash',amountCents:60000},{partId:other,paymentMethod:'card',amountCents:40000}]};
test('v4 payment intent accepts independent and repeated tenders with shipping metadata, old ABI rejects it',()=>{
 assert.equal(parseInStoreSaleIntent(intent,4).paymentParts?.length,2);
 assert.equal(parseInStoreSaleIntent({...intent,paymentParts:intent.paymentParts.map(p=>({...p,paymentMethod:'cash'}))},4).paymentParts?.length,2);
 for(const version of [1,2,3] as const)assert.throws(()=>parseInStoreSaleIntent(intent,version));
 for(const paymentParts of [[{...intent.paymentParts[0],amountCents:0}], [intent.paymentParts[0],intent.paymentParts[0]]])assert.throws(()=>parseInStoreSaleIntent({...intent,paymentParts},4));
 assert.throws(()=>parseInStoreSaleIntent({...intent,salesChannel:'social',socialPlatform:null},4));
 assert.throws(()=>parseInStoreSaleIntent({...intent,fulfillmentMethod:'shipping'},4));
});
test('v4 sale retains partial physical receipts without claiming the aggregate is received',()=>{
 const t='2026-10-07T09:00:00.000Z';const line={productId:id,variantId:other,productName:'Ürün',variantName:'',sku:null,barcode:null,imageUrl:null,unitPriceCents:100000,catalogUnitPriceCents:100000,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null,quantity:1,discountEligible:true,lineSubtotalCents:100000,allocatedDiscountCents:0,lineNetCents:100000};
 const sale={id,saleNumber:'POS-1',status:'payment_pending',version:3,contractVersion:4,locationId:id,locationName:'Mağaza',ownerMembershipId:id,ownerLabel:'Yetkili',customerName:null,customerId:null,customer:null,initialCollectionCents:100000,dueDate:null,finance:null,paymentMethod:null,note:null,discount:null,items:[line],totals:{subtotalCents:100000,eligibleSubtotalCents:100000,discountCents:0,shippingCents:0,totalCents:100000},createdAt:t,updatedAt:t,paymentReceivedAt:null,completedAt:null,orderId:null,orderNumber:null,salesChannel:'manual',socialPlatform:null,socialReference:null,fulfillmentMethod:'pickup',shippingAddress:null,billingAddress:null,shippingCents:0,prepareOperationId:id,abortRequested:false,paymentParts:intent.paymentParts.map((p,i)=>({...p,receiptId:i===0?id:null,receivedAt:i===0?t:null,actorMembershipId:i===0?id:null,refundEventId:null,returnedAt:null}))};
 assert.equal(parseInStoreSale(sale,4).paymentParts?.[0]?.amountCents,60000);
 assert.throws(()=>parseInStoreSale({...sale,status:'payment_received',paymentReceivedAt:t},4));
 assert.throws(()=>parseInStoreSale({...sale,initialCollectionCents:99999},4));
});

test('linked V4 CRM name retains201 characters and rejects202 while anonymous stays200',()=>{assert.equal(parseInStoreSaleIntent({...intent,customerId:id,customerName:'a'.repeat(100)+' '+'b'.repeat(100)},4).customerName?.length,201);assert.throws(()=>parseInStoreSaleIntent({...intent,customerId:id,customerName:'a'.repeat(202)},4));assert.throws(()=>parseInStoreSaleIntent({...intent,customerName:'a'.repeat(201)},4));});
