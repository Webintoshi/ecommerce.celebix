import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInStoreTotals, parseInStoreSaleIntent, parseInStoreSale, parseInStoreStaffGrant } from './index.ts';

const locationId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const lines = [{ unitPriceCents: 100000, quantity: 2, discountEligible: true }];
test('percentage and fixed discounts subtract integer cents exactly once', () => {
  assert.deepEqual(calculateInStoreTotals(lines, {kind:'percentage', percentageBps:1000}), {
    subtotalCents:200000, eligibleSubtotalCents:200000, discountCents:20000, totalCents:180000,
  });
  assert.equal(calculateInStoreTotals(lines, {kind:'fixed_amount',amountCents:15000}).totalCents,185000);
});
test('protected gold lines cannot enter the manual discount base', () => {
  const result = calculateInStoreTotals([...lines, {unitPriceCents:300000,quantity:1,discountEligible:false}], {kind:'percentage',percentageBps:1000});
  assert.deepEqual(result,{subtotalCents:500000,eligibleSubtotalCents:200000,discountCents:20000,totalCents:480000});
});
test('rounding floors cents, empty drafts work, and unsafe or zero-payment discounts fail', () => {
  assert.equal(calculateInStoreTotals([{unitPriceCents:199,quantity:1,discountEligible:true}],{kind:'percentage',percentageBps:3333}).discountCents,66);
  assert.equal(calculateInStoreTotals([],null).totalCents,0);
  for (const discount of [{kind:'percentage',percentageBps:10000},{kind:'percentage',percentageBps:-1},{kind:'fixed_amount',amountCents:200000},{kind:'fixed_amount',amountCents:0}]) {
    assert.throws(()=>calculateInStoreTotals(lines,discount as never));
  }
  assert.throws(()=>calculateInStoreTotals([{unitPriceCents:Number.MAX_SAFE_INTEGER,quantity:2,discountEligible:true}],null));
});
test('sale intents reject caller prices, unknown fields, and duplicate variants', () => {
  const value = {locationId,items:[{variantId,quantity:1}],discount:null,customerName:null,note:null};
  const parsed = parseInStoreSaleIntent(value);
  assert.ok(Object.isFrozen(parsed.items[0]));
  assert.throws(()=>parseInStoreSaleIntent({...value,storeId:locationId}));
  assert.throws(()=>parseInStoreSaleIntent({...value,items:[{variantId,quantity:1,unitPriceCents:1}]}));
  assert.throws(()=>parseInStoreSaleIntent({...value,items:[...value.items,...value.items]}));
});
test('sale projections reject inconsistent totals and payment lifecycle', () => {
  const sale = {id:locationId,saleNumber:'MS-1',status:'draft',version:1,locationId,locationName:'Mağaza',ownerMembershipId:variantId,ownerLabel:'Cemo',customerName:null,note:null,discount:null,items:[],totals:{subtotalCents:0,eligibleSubtotalCents:0,discountCents:0,totalCents:0},createdAt:'2026-09-26T09:00:00.000Z',updatedAt:'2026-09-26T09:00:00.000Z',paymentReceivedAt:null,completedAt:null,orderId:null,orderNumber:null};
  assert.equal(parseInStoreSale(sale).status,'draft');
  assert.throws(()=>parseInStoreSale({...sale,status:'payment_received'}));
  assert.throws(()=>parseInStoreSale({...sale,totals:{...sale.totals,totalCents:1}}));
});
test('staff grant projections accept 100 unique locations and reject 101', () => {
  const locationIds=Array.from({length:101},(_,index)=>`11111111-1111-4111-8111-${String(index).padStart(12,'0')}`);
  const grant={membershipId:variantId,label:'Cashier',role:'cashier',enabled:true,locationIds:locationIds.slice(0,100),discountLimitBps:1000,version:1};
  assert.deepEqual(parseInStoreStaffGrant(grant).locationIds,grant.locationIds);
  assert.throws(()=>parseInStoreStaffGrant({...grant,locationIds}),/in_store_contract_invalid/);
});
test('payment-stage projections require a positive total while free drafts remain editable', () => {
  const timestamp='2026-09-26T09:00:00.000Z';
  const line={productId:locationId,variantId,productName:'Product',variantName:'',sku:null,barcode:null,imageUrl:null,unitPriceCents:0,quantity:1,discountEligible:true,lineSubtotalCents:0,allocatedDiscountCents:0,lineNetCents:0};
  const sale={id:locationId,saleNumber:'MS-1',status:'draft',version:1,locationId,locationName:'Mağaza',ownerMembershipId:variantId,ownerLabel:'Cemo',customerName:null,note:null,discount:null,items:[line],totals:{subtotalCents:0,eligibleSubtotalCents:0,discountCents:0,totalCents:0},createdAt:timestamp,updatedAt:timestamp,paymentReceivedAt:null,completedAt:null,orderId:null,orderNumber:null};
  assert.equal(parseInStoreSale(sale).status,'draft');
  for(const status of ['payment_pending','payment_received','completed']) {
    const paymentSale={...sale,status,paymentReceivedAt:status==='payment_pending'?null:timestamp,completedAt:status==='completed'?timestamp:null,orderId:status==='completed'?variantId:null,orderNumber:status==='completed'?'ORD-1':null};
    assert.throws(()=>parseInStoreSale(paymentSale),/in_store_contract_invalid/,`${status} must reject a nonempty zero-total sale`);
    assert.equal(parseInStoreSale({...paymentSale,items:[{...line,unitPriceCents:1,lineSubtotalCents:1,lineNetCents:1}],totals:{subtotalCents:1,eligibleSubtotalCents:1,discountCents:0,totalCents:1}}).status,status);
  }
});

test('v2 draft intent persists explicit payment and validates positive override while v1 rejects additions', () => {
 const value={locationId,items:[{variantId,quantity:2,unitPriceOverrideCents:9000}],discount:null,customerName:null,note:null,paymentMethod:'cash'};
 assert.equal(parseInStoreSaleIntent(value,2).items[0]?.unitPriceOverrideCents,9000);
 assert.equal(parseInStoreSaleIntent(value,2).paymentMethod,'cash');
 assert.throws(()=>parseInStoreSaleIntent(value));
 for(const unitPriceOverrideCents of [0,-1,1.2,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>parseInStoreSaleIntent({...value,items:[{variantId,quantity:1,unitPriceOverrideCents}]},2));
 assert.throws(()=>parseInStoreSaleIntent({...value,paymentMethod:'transfer'},2));
});

test('v3 credit intent locks customer, zero/partial collection and calendar due date while preserving old parsers',()=>{
 const credit={locationId,items:[{variantId,quantity:1,unitPriceOverrideCents:null}],discount:null,customerName:null,note:null,paymentMethod:null,customerId:variantId,initialCollectionCents:0,dueDate:'2026-10-31'};
 assert.equal(parseInStoreSaleIntent(credit,3).initialCollectionCents,0);
 assert.equal(parseInStoreSaleIntent({...credit,paymentMethod:'bank_transfer',initialCollectionCents:500},3).paymentMethod,'bank_transfer');
 for(const dueDate of ['2026-02-30','2026-13-01','26-10-01'])assert.throws(()=>parseInStoreSaleIntent({...credit,dueDate},3));
 for(const initialCollectionCents of [-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>parseInStoreSaleIntent({...credit,initialCollectionCents},3));
 assert.throws(()=>parseInStoreSaleIntent(credit,2));
});
test('v3 zero collection completion is delivered without invented payment evidence',()=>{
 const timestamp='2026-10-02T09:00:00.000Z';
 const line={productId:locationId,variantId,productName:'Product',variantName:'',sku:null,barcode:null,imageUrl:null,unitPriceCents:10000,catalogUnitPriceCents:10000,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null,quantity:1,discountEligible:true,lineSubtotalCents:10000,allocatedDiscountCents:0,lineNetCents:10000};
 const customer={id:variantId,name:'Ali Veli',firstName:'Ali',lastName:'Veli',phone:'+905551234567',email:null,archived:false};
 const sale={id:locationId,saleNumber:'POS-1',status:'completed',version:3,contractVersion:3,locationId,locationName:'Mağaza',ownerMembershipId:variantId,ownerLabel:'Cemo',customerName:customer.name,customerId:customer.id,customer,initialCollectionCents:0,dueDate:null,finance:{status:'unpaid',collectedCents:0,dueCents:10000,refundDueCents:0,version:1,receipts:[]},paymentMethod:null,note:null,discount:null,items:[line],totals:{subtotalCents:10000,eligibleSubtotalCents:10000,discountCents:0,totalCents:10000},createdAt:timestamp,updatedAt:timestamp,paymentReceivedAt:null,completedAt:timestamp,orderId:variantId,orderNumber:'POS-1'};
 assert.equal(parseInStoreSale(sale,3).paymentReceivedAt,null);
 assert.throws(()=>parseInStoreSale({...sale,paymentReceivedAt:timestamp},3));
 assert.throws(()=>parseInStoreSale({...sale,initialCollectionCents:10001},3));
 assert.throws(()=>parseInStoreSale({...sale,customer:{...customer,phone:null}},3));
});

test('v3 named customer snapshots preserve maximum database names and historical email length',async()=>{
 const {parseInStorePosCustomer}=await import('./index.ts');const firstName='A'.repeat(100),lastName='B'.repeat(100),email='a'.repeat(300)+'@example.test';
 assert.equal(parseInStorePosCustomer({id:variantId,name:firstName+' '+lastName,firstName,lastName,phone:null,email,archived:true}).email,email);
});
