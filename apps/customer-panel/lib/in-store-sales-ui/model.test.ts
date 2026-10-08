import assert from "node:assert/strict";
import test from "node:test";
import { parseMinorUnits, previewTotals, createSerialQueue, readRecoveryMarker, writeRecoveryMarker } from "./model.ts";

test("decimal entry preserves exact cents and accepts Turkish decimal separator", () => {
  assert.equal(parseMinorUnits("10,50"), 1050);
  assert.equal(parseMinorUnits("10.50"), 1050);
  assert.equal(parseMinorUnits("0,01"), 1);
  assert.equal(parseMinorUnits("10"), 1000);
});
test("empty, negative, grouped and excessive decimals cannot become a discount", () => {
  for (const input of ["", "-1", "1.000,00", "1.000", "1,234", "NaN", "1e3", "99999999999999999999"]) assert.equal(parseMinorUnits(input), null);
});
test("percentage excludes protected lines and fixed amount is deducted exactly once", () => {
  const lines = [{ unitPriceCents: 200000, quantity: 1, discountEligible: true }, { unitPriceCents: 500000, quantity: 1, discountEligible: false }];
  assert.deepEqual(previewTotals(lines, {kind:"percentage",percentageBps:1000}), { subtotalCents:700000, eligibleSubtotalCents:200000, discountCents:20000, totalCents:680000 });
  assert.equal(previewTotals(lines, {kind:"fixed_amount",amountCents:15000}).totalCents, 685000);
});
test("quantity changes recompute percent while fixed amount stays fixed", () => {
  const lines = [{ unitPriceCents:200000, quantity:2, discountEligible:true }];
  assert.equal(previewTotals(lines, {kind:"percentage",percentageBps:1000}).discountCents,40000);
  assert.equal(previewTotals(lines, {kind:"fixed_amount",amountCents:15000}).discountCents,15000);
});
test("fixed discount beyond eligible base and zero-payment discounts fail", () => {
  const lines=[{unitPriceCents:100,quantity:1,discountEligible:true}];
  assert.throws(()=>previewTotals(lines,{kind:"fixed_amount",amountCents:101}),{name:"TypeError",message:"in_store_discount_invalid"});
  assert.throws(()=>previewTotals(lines,{kind:"percentage",percentageBps:10000}),{name:"TypeError",message:"in_store_discount_invalid"});
});
test("sequential scan/save jobs cannot overtake a delayed first scan",async()=>{
  const queue=createSerialQueue(); const events:string[]=[]; let resolve!:()=>void;
  const gate=new Promise<void>(r=>{resolve=r;});
  const first=queue.run(async()=>{events.push("first:start");await gate;events.push("first:end");});
  const second=queue.run(async()=>{events.push("second");});
  await Promise.resolve(); assert.deepEqual(events,["first:start"]); resolve(); await Promise.all([first,second]);
  assert.deepEqual(events,["first:start","first:end","second"]);
});
test("failed job does not poison queue or silently re-run an earlier intent",async()=>{
  const queue=createSerialQueue();let attempts=0;
  await assert.rejects(queue.run(async()=>{attempts++;throw new Error("unavailable");}));
  assert.equal(await queue.run(async()=>42),42);assert.equal(attempts,1);
});
test("recovery marker is actor-scoped metadata without product or customer authority",()=>{
  const values=new Map<string,string>(); const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const marker={scopeKey:"opaque-owner-scope",kind:"payment" as const,saleId:"9e000000-0000-4000-8000-000000000001",operationId:"9e000000-0000-4000-8000-000000000002",expectedVersion:3,expectedTotalCents:180000};
  writeRecoveryMarker(storage,marker);
  assert.deepEqual(readRecoveryMarker(storage,"opaque-owner-scope"),marker);
  assert.equal(readRecoveryMarker(storage,"other-user-scope"),null);
  assert.equal([...values.values()].join("").includes("items"),false);
  assert.equal([...values.values()].join("").includes("customer"),false);
});
test("malformed marker cannot inject an authority or version",()=>{
  const storage={getItem:()=>JSON.stringify({scopeKey:"scope",kind:"payment",saleId:"bad",operationId:"bad",expectedVersion:-1,expectedTotalCents:1}),setItem:()=>{},removeItem:()=>{}};
  assert.equal(readRecoveryMarker(storage,"scope"),null);
});

import { InStoreRegisterController } from "./model.ts";
import { createInStoreSalesUiClient, InStoreSalesUiError, type InStoreSalesUiClient, type UiPaymentPart } from "./client.ts";
import type { InStoreBootstrap, InStoreProduct, InStoreSale, InStoreSaleIntent, InStoreSaleResult } from "@celebix/saas-contracts";
const LOCATION="9e000000-0000-4000-8000-000000000003";
type MutableClient={-readonly[K in keyof InStoreSalesUiClient]:InStoreSalesUiClient[K]};
function fixture(barcode="000123",v2=false){
  let sequence=10,server:InStoreSale|null=null,completeFailures=0,price=200000;
  const calls:{kind:string;key:string;version?:number;total?:number}[]=[],operations=new Map<string,InStoreSaleResult>();
  const p:InStoreProduct={productId:"9e000000-0000-4000-8000-000000000004",variantId:"9e000000-0000-4000-8000-000000000005",productName:"Ürün",variantName:"Siyah M",sku:null,barcode,imageUrl:null,unitPriceCents:200000,pricingUnavailable:false,availableQuantity:10,stockTracking:true,discountEligible:true};
  const date="2026-09-26T00:00:00.000Z";
  function sale(intent:InStoreSaleIntent,version:number,status:InStoreSale["status"],id=server?.id??"9e000000-0000-4000-8000-000000000001"):InStoreSale{
    const totals=previewTotals(intent.items.map(x=>({unitPriceCents:v2?(x.unitPriceOverrideCents??price):price,quantity:x.quantity,discountEligible:true})),intent.discount);
    return {id,saleNumber:"MS-101",status,version,locationId:intent.locationId,locationName:"Mağaza",ownerMembershipId:LOCATION,ownerLabel:"Kasiyer",customerName:intent.customerName,note:intent.note,discount:intent.discount,
      items:intent.items.map(x=>({...p,unitPriceCents:v2?(x.unitPriceOverrideCents??price):price,...(v2?{catalogUnitPriceCents:price,unitPriceOverrideCents:x.unitPriceOverrideCents??null,priceOverrideActorMembershipId:x.unitPriceOverrideCents==null?null:LOCATION}:{}),quantity:x.quantity,lineSubtotalCents:(v2?(x.unitPriceOverrideCents??price):price)*x.quantity,allocatedDiscountCents:totals.discountCents,lineNetCents:(v2?(x.unitPriceOverrideCents??price):price)*x.quantity-totals.discountCents})),...(v2?{paymentMethod:intent.paymentMethod??null}:{}),totals,createdAt:date,updatedAt:date,paymentReceivedAt:["payment_received","completed"].includes(status)?date:null,completedAt:status==="completed"?date:null,orderId:status==="completed"?LOCATION:null,orderNumber:status==="completed"?"S-101":null};
  }
  const intent=()=>({locationId:LOCATION,items:server?.items.map(x=>({variantId:x.variantId,quantity:x.quantity,...(v2?{unitPriceOverrideCents:x.unitPriceOverrideCents??null}:{})}))??[],discount:server?.discount??null,customerName:server?.customerName??null,note:server?.note??null,...(v2?{paymentMethod:server?.paymentMethod??null}:{})});
  function result(key:string){const r={sale:server!,replayed:false,priceChanged:false};operations.set(key,r);return r;}
  const bootstrap=():InStoreBootstrap=>({scopeKey:"fixture-actor",locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],permissions:{canSell:true,canDiscount:true,discountLimitBps:9999,canResolve:true,canManageStaff:false,...(v2?{canEditPrice:true}:{})},activeDraft:server?.status==="draft"?server:null,heldSales:server?.status==="held"?[server]:[],pendingSales:server&&["payment_pending","payment_received"].includes(server.status)?[server]:[],recentSales:server?.status==="completed"?[server]:[],summary:{completedCount:0,grossCents:0,discountCents:0,netCents:0,pendingPaymentCount:0}});
  const api={contractVersion:v2?2:1,newId:()=>`9e000000-0000-4000-8000-${String(sequence++).padStart(12,"0")}`,bootstrap:async()=>bootstrap(),searchProducts:async()=>[p],getSale:async()=>{if(!server)throw new InStoreSalesUiError("not_found",404,false);return server;},getOperation:async(key:string)=>operations.get(key)??null,
    createSale:async(input:{saleId:string;intent:InStoreSaleIntent},key:string)=>{calls.push({kind:"create",key});server=sale(input.intent,1,"draft",input.saleId);return result(key);},
    updateSale:async(_id:string,input:{expectedVersion:number;intent:InStoreSaleIntent},key:string)=>{assert.equal(input.expectedVersion,server!.version);calls.push({kind:"update",key,version:input.expectedVersion});server=sale(input.intent,input.expectedVersion+1,"draft");return result(key);},
    holdSale:async(_id:string,input:{expectedVersion:number;held:boolean},key:string)=>{calls.push({kind:"hold",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,input.held?"held":"draft");return result(key);},
    prepareSale:async(_id:string,input:{expectedVersion:number;expectedTotalCents:number},key:string)=>{if(input.expectedVersion!==server!.version)throw new InStoreSalesUiError("version_conflict",409,false);calls.push({kind:"prepare",key,total:input.expectedTotalCents});const changed=input.expectedTotalCents!==server!.totals.totalCents;server=sale(intent(),input.expectedVersion+1,changed?"draft":"payment_pending");const r={...result(key),priceChanged:changed};operations.set(key,r);return r;},
    confirmPayment:async(_id:string,input:{expectedVersion:number;slipReference:null;paymentMethod?:"card"|"cash"|null},key:string)=>{assert.equal(input.slipReference,null);calls.push({kind:"payment",key,version:input.expectedVersion});server=sale({...intent(),...(v2?{paymentMethod:server?.paymentMethod??input.paymentMethod??null}:{})},input.expectedVersion+1,"payment_received");return result(key);},
    cancelSale:async(_id:string,input:{expectedVersion:number;confirmUnpaid:true},key:string)=>{calls.push({kind:"cancel",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,"draft");return result(key);},
    discardSale:async(id:string,input:{expectedVersion:number;confirmUnpaid:true},key:string)=>{
      const replay=operations.get(key);if(replay)return {...replay,replayed:true};
      assert.equal(id,server!.id);assert.equal(input.confirmUnpaid,true);assert.equal(input.expectedVersion,server!.version);
      if(!["draft","held","payment_pending"].includes(server!.status))throw new InStoreSalesUiError("invalid_transition",409,false);
      calls.push({kind:"discard",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,"cancelled");return result(key);
    },
    takeoverSale:async(_id:string,input:{expectedVersion:number},key:string)=>{calls.push({kind:"takeover",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,server!.status);return result(key);},
    completeSale:async(_id:string,input:{expectedVersion:number},key:string)=>{calls.push({kind:"complete",key,version:input.expectedVersion});if(completeFailures-->0)throw new InStoreSalesUiError("unavailable",503,true);server=sale(intent(),input.expectedVersion+1,"completed");return result(key);},
  } as unknown as MutableClient;
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  return {api,p,calls,storage,getServer:()=>server,failCompletion:()=>{completeFailures=1;},changePrice:(newPrice:number)=>{price=newPrice;},controller:()=>new InStoreRegisterController(api,()=>storage)};
}

test("catalog photo survives immutable draft mutation snapshots without adding image authority to intent",async()=>{
  const f=fixture("000123",true),photo="https://cdn.example.test/ring.webp",api=f.api as MutableClient;
  const product={...f.p,imageUrl:photo};api.searchProducts=async()=>[product];
  const update=api.updateSale;api.updateSale=async(id,input,key)=>{assert.equal(JSON.stringify(input).includes("imageUrl"),false);return update(id,input,key);};
  const controller=f.controller();await controller.initialize();await controller.scan("000123");
  assert.equal(f.getServer()?.items[0].imageUrl,null);
  assert.equal(controller.getSnapshot().cart[0].imageUrl,photo);
  controller.setQuantity(product.variantId,2);await controller.flush();
  assert.equal(controller.getSnapshot().cart[0].imageUrl,photo);
  controller.setUnitPrice(product.variantId,200001);controller.setPaymentMethod("cash");await controller.flush();
  assert.equal(controller.getSnapshot().cart[0].imageUrl,photo);
  assert.equal(controller.getSnapshot().cart[0].unitPriceOverrideCents,200001);
  assert.equal(controller.getSnapshot().paymentMethod,"cash");
});

test("reopened held sale keeps the read photo when unhold returns its original null-image snapshot",async()=>{
  const f=fixture("000123",true),photo="https://cdn.example.test/held-ring.webp",api=f.api as MutableClient;
  const controller=f.controller();await controller.initialize();await controller.addProduct(f.p);const id=f.getServer()!.id;await controller.hold();
  const get=api.getSale;api.getSale=async(saleId)=>{const value=await get(saleId);return {...value,items:value.items.map(item=>({...item,imageUrl:photo}))};};
  const reopened=f.controller();await reopened.initialize();await reopened.openSale(id);
  assert.equal(reopened.getSnapshot().cart[0].imageUrl,photo);
  assert.equal(f.getServer()?.items[0].imageUrl,null);
});

test("authoritative reopening clears a photo removed from the current catalog",async()=>{
  const f=fixture("000123",true),photo="https://cdn.example.test/archived-ring.webp";
  const controller=f.controller();await controller.initialize();await controller.addProduct({...f.p,imageUrl:photo});
  assert.equal(controller.getSnapshot().cart[0].imageUrl,photo);
  await controller.openSale(f.getServer()!.id);
  assert.equal(controller.getSnapshot().cart[0].imageUrl,null);
});

test("two real scans save two units with monotonically advancing draft version",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await Promise.all([controller.scan("000123"),controller.scan("000123")]);
  assert.equal(controller.getSnapshot().cart[0].quantity,2);assert.equal(f.getServer()?.items[0].quantity,2);
  assert.deepEqual(f.calls.map(x=>x.kind),["create","update"]);assert.equal(f.calls[1].version,1);controller.dispose();
});

test("attestation is durable before finalization, double click cannot duplicate payment",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);await controller.prepare();
  await Promise.all([controller.finish(),controller.finish()]);
  assert.deepEqual(f.calls.map(x=>x.kind),["create","prepare","payment","complete"]);assert.equal(controller.getSnapshot().sale?.status,"completed");controller.dispose();
});

test("failed finalization and reload retain the original completion key without another payment",async()=>{
  const f=fixture(),first=f.controller();await first.initialize();await first.addProduct(f.p);await first.prepare();f.failCompletion();await first.finish();
  const marker=first.getSnapshot().recovery!;assert.equal(first.getSnapshot().sale?.status,"payment_received");assert.equal(marker.kind,"complete");first.dispose();
  const second=f.controller();await second.initialize();assert.equal(second.getSnapshot().sale?.status,"payment_received");await second.recover(true);
  assert.equal(second.getSnapshot().sale?.status,"completed");assert.equal(f.calls.filter(x=>x.kind==="payment").length,1);
  assert.deepEqual(f.calls.filter(x=>x.kind==="complete").map(x=>x.key),[marker.operationId,marker.operationId]);second.dispose();
});

test("saving refreshed price cannot silently charge a total the cashier has not approved",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);controller.setQuantity(f.p.variantId,2);f.changePrice(250000);await controller.prepare();
  assert.equal(f.calls.find(x=>x.kind==="prepare")?.total,400000);
  assert.equal(controller.getSnapshot().sale?.status,"draft");assert.equal(controller.getSnapshot().priceChanged,true);controller.dispose();
});

test("payment prepared cart cannot change its price, discount or quantity",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);await controller.prepare();
  controller.setQuantity(f.p.variantId,3);controller.setDiscount({kind:"percentage",percentageBps:1000});await controller.scan("000123");
  assert.equal(controller.getSnapshot().cart[0].quantity,1);assert.equal(controller.getSnapshot().discount,null);assert.equal(controller.getSnapshot().sale?.totals.totalCents,200000);controller.dispose();
});

test("an accepted payment with a lost response recovers current state without another payment",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);await controller.prepare();
  const payment=f.api.confirmPayment;f.api.confirmPayment=async(...args:Parameters<InStoreSalesUiClient["confirmPayment"]>)=>{await payment(...args);throw new InStoreSalesUiError("unavailable",503,true);};
  await controller.finish();assert.equal(controller.getSnapshot().recovery?.kind,"payment");await controller.recover(true);
  assert.equal(controller.getSnapshot().sale?.status,"payment_received");await controller.finish();assert.equal(f.calls.filter(x=>x.kind==="payment").length,1);controller.dispose();
});
test("local edits arriving during a delayed save survive and use the returned server version",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();let started!:()=>void,release!:()=>void;
  const start=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});const create=f.api.createSale;
  f.api.createSale=async(...args:Parameters<InStoreSalesUiClient["createSale"]>)=>{started();await gate;return create(...args);};
  const adding=controller.addProduct(f.p);await start;controller.setQuantity(f.p.variantId,2);release();await adding;
  assert.equal(controller.getSnapshot().cart[0].quantity,2);assert.equal(f.getServer()?.items[0].quantity,2);assert.equal(f.calls.at(-1)?.version,1);controller.dispose();
});
test("opening another basket records the active basket as held even when target fetch fails",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);
  f.api.getSale=async()=>{throw new InStoreSalesUiError("unavailable",503,false);};await controller.openSale("9e000000-0000-4000-8000-000000000099");
  assert.equal(f.getServer()?.status,"held");assert.equal(controller.getSnapshot().sale?.status,"held");assert.equal(controller.isEditable(),false);controller.dispose();
});
test("duplicate initialization cannot issue two bootstrap requests",async()=>{
  const f=fixture(),controller=f.controller();let count=0;const bootstrap=f.api.bootstrap;f.api.bootstrap=async()=>{count++;await Promise.resolve();return bootstrap();};
  await Promise.all([controller.initialize(),controller.initialize()]);assert.equal(count,1);controller.dispose();
});
test("a version conflict preserves local intent and requires explicit current basket acceptance",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);const current=f.getServer()!;
  await f.api.updateSale(current.id,{expectedVersion:current.version,intent:{locationId:LOCATION,items:[{variantId:f.p.variantId,quantity:3}],discount:null,customerName:null,note:null}},f.api.newId());
  f.api.updateSale=async()=>{throw new InStoreSalesUiError("version_conflict",409,false);};controller.setQuantity(f.p.variantId,2);await assert.rejects(controller.flush());
  assert.equal(controller.getSnapshot().cart[0].quantity,2);assert.equal(controller.getSnapshot().conflict?.items[0].quantity,3);assert.equal(controller.isEditable(),false);
  controller.acceptCurrentSale();assert.equal(controller.getSnapshot().cart[0].quantity,3);assert.equal(controller.isEditable(),true);controller.dispose();
});
test("recovering a lost draft response preserves edits made while its save was in flight",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();let started!:()=>void,release!:()=>void;
  const start=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});const create=f.api.createSale;
  f.api.createSale=async(...args:Parameters<InStoreSalesUiClient["createSale"]>)=>{started();await gate;await create(...args);throw new InStoreSalesUiError("unavailable",503,true);};
  const adding=controller.addProduct(f.p);await start;controller.setQuantity(f.p.variantId,2);release();await adding;
  assert.equal(controller.getSnapshot().recovery?.kind,"create");await controller.recover(true);
  assert.equal(controller.getSnapshot().cart[0].quantity,2);assert.equal(f.getServer()?.items[0].quantity,2);controller.dispose();
});
test("a missing create that never reached server retries the retained exact command",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();const create=f.api.createSale;let first=true;const attempts:string[]=[];
  f.api.createSale=async(...args:Parameters<InStoreSalesUiClient["createSale"]>)=>{attempts.push(args[1]);if(first){first=false;throw new InStoreSalesUiError("unavailable",503,true);}return create(...args);};
  await controller.addProduct(f.p);const original=controller.getSnapshot().recovery!;await controller.recover(true);
  assert.equal(controller.getSnapshot().sale?.status,"draft");assert.deepEqual(attempts,[original.operationId,original.operationId]);assert.equal(f.getServer()?.id,original.saleId);controller.dispose();
});
for(const kind of ["prepare","cancel","takeover","hold"] as const){
  test(`reload reconstructs missing-journal ${kind} with the original operation and version`,async()=>{
    const f=fixture(),first=f.controller();await first.initialize();await first.addProduct(f.p);if(kind==="cancel")await first.prepare();
    const attempts:{key:string;body:unknown}[]=[];let fail=true;
    if(kind==="prepare"){const original=f.api.prepareSale;f.api.prepareSale=async(id,input,key)=>{attempts.push({key,body:input});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,input,key);};await first.prepare();}
    if(kind==="cancel"){const original=f.api.cancelSale;f.api.cancelSale=async(id,input,key)=>{attempts.push({key,body:input});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,input,key);};await first.cancelUnpaid();}
    if(kind==="takeover"){const original=f.api.takeoverSale;f.api.takeoverSale=async(id,input,key)=>{attempts.push({key,body:input});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,input,key);};await first.takeover();}
    if(kind==="hold"){const original=f.api.holdSale;f.api.holdSale=async(id,input,key)=>{attempts.push({key,body:input});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,input,key);};await first.hold();}
    const marker=first.getSnapshot().recovery!;assert.equal(marker.kind,kind);first.dispose();const second=f.controller();await second.initialize();await second.recover(true);
    assert.equal(second.getSnapshot().recovery,null);assert.equal(attempts.length,2);assert.deepEqual(attempts[1],attempts[0]);assert.equal(attempts[1].key,marker.operationId);second.dispose();
  });
}
test("a reloaded lost create provides explicit product reentry using its original sale UUID",async()=>{
  const f=fixture(),first=f.controller();await first.initialize();const create=f.api.createSale;let fail=true;
  f.api.createSale=async(...args:Parameters<InStoreSalesUiClient["createSale"]>)=>{if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return create(...args);};
  await first.addProduct(f.p);const marker=first.getSnapshot().recovery!;first.dispose();const second=f.controller();await second.initialize();
  assert.equal(second.getSnapshot().canReenterDraft,true);await second.reenterDraft();await second.addProduct(f.p);
  assert.equal(f.getServer()?.id,marker.saleId);assert.equal(second.getSnapshot().recovery,null);second.dispose();
});
test("an old draft marker never offers reset when the authoritative sale has reached payment",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);const sale=f.getServer()!;
  writeRecoveryMarker(f.storage,{scopeKey:"fixture-actor",kind:"update",saleId:sale.id,operationId:f.api.newId(),expectedVersion:sale.version,expectedTotalCents:0});await controller.prepare();
  // prepare replaces storage; restore a historical update marker with no journal.
  writeRecoveryMarker(f.storage,{scopeKey:"fixture-actor",kind:"update",saleId:sale.id,operationId:f.api.newId(),expectedVersion:sale.version,expectedTotalCents:0});controller.dispose();const second=f.controller();await second.initialize();
  assert.equal(second.getSnapshot().canReenterDraft,false);await second.reenterDraft();assert.equal(second.getSnapshot().sale?.status,"payment_pending");assert.ok(second.getSnapshot().recovery);second.dispose();
});
test("alphanumeric scanner input uses exact barcode lookup before any text search",async()=>{
  const f=fixture("ABC-123"),controller=f.controller();await controller.initialize();const calls:unknown[]=[];
  f.api.searchProducts=async input=>{calls.push(input);return input.barcode==="ABC-123"?[{...f.p,barcode:"ABC-123"}]:[];};
  const result=await controller.lookup("ABC-123");assert.equal(result.matched,true);assert.equal(controller.getSnapshot().cart[0].barcode,"ABC-123");assert.equal(calls.length,1);controller.dispose();
});
test("text fallback is searched fresh and cannot auto-add an older single suggestion",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();const calls:string[]=[];
  f.api.searchProducts=async input=>{calls.push(input.barcode?`barcode:${input.barcode}`:`query:${input.query}`);return input.query?[f.p]:[];};
  const result=await controller.lookup("Yeni ürün");assert.equal(result.matched,false);assert.equal(result.products.length,1);assert.deepEqual(calls,["barcode:Yeni ürün","query:Yeni ürün"]);assert.equal(controller.getSnapshot().cart.length,0);controller.dispose();
});
test("late original create after explicit reentry cannot allocate a second sale identity",async()=>{
  const f=fixture(),first=f.controller();await first.initialize();const create=f.api.createSale;let fail=true;
  f.api.createSale=async(...args:Parameters<InStoreSalesUiClient["createSale"]>)=>{if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}if(f.getServer())throw new InStoreSalesUiError("invalid_input",400,false);return create(...args);};
  await first.addProduct(f.p);const marker=first.getSnapshot().recovery!;first.dispose();const second=f.controller();await second.initialize();await second.reenterDraft();
  assert.equal(readRecoveryMarker(f.storage,"fixture-actor")?.saleId,marker.saleId);
  await create({saleId:marker.saleId,intent:{locationId:LOCATION,items:[{variantId:f.p.variantId,quantity:1}],discount:null,customerName:null,note:null}},marker.operationId);
  await second.addProduct(f.p);assert.equal(f.getServer()?.id,marker.saleId);assert.equal(second.getSnapshot().conflict?.id,marker.saleId);assert.equal(f.calls.filter(call=>call.kind==="create").length,1);second.dispose();
});
test("reloading an unhold keeps held false in the exact recovery command",async()=>{
  const f=fixture(),first=f.controller();await first.initialize();await first.addProduct(f.p);await first.hold();const original=f.api.holdSale;let fail=true;const attempts:{key:string;body:unknown}[]=[];
  f.api.holdSale=async(id,input,key)=>{attempts.push({key,body:input});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,input,key);};
  await first.openSale(f.getServer()!.id);const marker=first.getSnapshot().recovery!;assert.equal(marker.held,false);first.dispose();const second=f.controller();await second.initialize();await second.recover(true);
  assert.deepEqual(attempts[1],attempts[0]);assert.equal(second.getSnapshot().sale?.status,"draft");assert.equal(second.getSnapshot().recovery,null);second.dispose();
});
test("an uncommitted prepare with an advanced draft version offers explicit safe current acceptance",async()=>{
  const f=fixture(),first=f.controller();await first.initialize();await first.addProduct(f.p);const prepare=f.api.prepareSale;let fail=true;
  f.api.prepareSale=async(...args:Parameters<InStoreSalesUiClient["prepareSale"]>)=>{if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return prepare(...args);};await first.prepare();
  const current=f.getServer()!;await f.api.updateSale(current.id,{expectedVersion:current.version,intent:{locationId:LOCATION,items:[{variantId:f.p.variantId,quantity:3}],discount:null,customerName:null,note:null}},f.api.newId());first.dispose();
  const second=f.controller();await second.initialize();await second.recover(true);assert.equal(second.getSnapshot().canAcceptRecovery,true);assert.ok(second.getSnapshot().recovery);
  await second.acceptRecoveryCurrentSale();assert.equal(second.getSnapshot().recovery,null);assert.equal(second.getSnapshot().cart[0].quantity,3);assert.equal(second.isEditable(),true);second.dispose();
});

test("v2 price survives scan, quantities, hold/reopen and reload; removing resets it",async()=>{
  const f=fixture("000123",true),c=f.controller();await c.initialize();await c.addProduct(f.p);
  c.setUnitPrice(f.p.variantId,1489);c.setPaymentMethod("cash");await c.flush();await c.scan("000123");c.setQuantity(f.p.variantId,3);await c.flush();
  assert.equal(c.getSnapshot().cart[0].unitPriceCents,1489);assert.equal(f.getServer()?.items[0].unitPriceOverrideCents,1489);assert.equal(f.getServer()?.totals.totalCents,4467);
  const id=f.getServer()!.id;await c.hold();await c.openSale(id);assert.equal(c.getSnapshot().paymentMethod,"cash");c.dispose();
  const next=f.controller();await next.initialize();assert.equal(next.getSnapshot().cart[0].unitPriceOverrideCents,1489);
  next.setUnitPrice(f.p.variantId,null);await next.flush();assert.equal(next.getSnapshot().cart[0].unitPriceCents,200000);
  next.setUnitPrice(f.p.variantId,1489);next.setQuantity(f.p.variantId,0);await next.flush();await next.addProduct(f.p);
  assert.equal(next.getSnapshot().cart[0].unitPriceOverrideCents,null);assert.equal(next.getSnapshot().cart[0].unitPriceCents,200000);next.dispose();
});
test("v2 requires a method, then fixes price and method during payment",async()=>{
  const f=fixture("000123",true),c=f.controller();await c.initialize();await c.addProduct(f.p);await c.prepare();
  assert.equal(f.calls.some(x=>x.kind==="prepare"),false);assert.match(c.getSnapshot().error??"",/Kart|Nakit|ödeme/i);
  c.setPaymentMethod("card");await c.prepare();assert.equal(c.getSnapshot().sale?.status,"payment_pending");
  c.setPaymentMethod("cash");c.setUnitPrice(f.p.variantId,1);assert.equal(c.getSnapshot().paymentMethod,"card");assert.equal(c.getSnapshot().cart[0].unitPriceCents,200000);c.dispose();
});

test("legacy pending cash selection and unknown-result reload retain the exact v2 method",async()=>{
  const f=fixture("000123",true),c=f.controller();await c.initialize();await c.addProduct(f.p);
  const draft=f.getServer()!;await f.api.prepareSale(draft.id,{expectedVersion:draft.version,expectedTotalCents:200000},f.api.newId());c.dispose();const legacy=f.controller();await legacy.initialize();await legacy.openSale(draft.id);
  const original=f.api.confirmPayment,attempts:unknown[]=[];let fail=true;
  f.api.confirmPayment=async(id,body,key,...rest)=>{attempts.push({body,key,version:rest[0]});if(fail){fail=false;throw new InStoreSalesUiError("unavailable",503,true);}return original(id,body,key,...rest);};
  legacy.setPaymentMethod("cash");await legacy.finish();const marker=legacy.getSnapshot().recovery!;
  assert.equal(marker.contractVersion,2);assert.equal(marker.paymentMethod,"cash");legacy.dispose();
  const next=f.controller();await next.initialize();await next.recover(true);
  assert.equal(next.getSnapshot().sale?.paymentMethod,"cash");assert.equal(next.getSnapshot().sale?.status,"payment_received");
  assert.deepEqual(attempts.map(x=>(x as {body:unknown}).body),[{expectedVersion:draft.version+1,slipReference:null,paymentMethod:"cash"},{expectedVersion:draft.version+1,slipReference:null,paymentMethod:"cash"}]);
  assert.equal((attempts[1] as {version:number}).version,2);next.dispose();
});
test("v2 screen replays an old payment key with version1 and no invented method",async()=>{
  const f=fixture("000123",true),c=f.controller();await c.initialize();await c.addProduct(f.p);c.setPaymentMethod("card");await c.prepare();c.dispose();
  const sale=f.getServer()!,operationId=f.api.newId();writeRecoveryMarker(f.storage,{scopeKey:"fixture-actor",kind:"payment",saleId:sale.id,operationId,expectedVersion:sale.version,expectedTotalCents:sale.totals.totalCents});
  let seen:unknown;const original=f.api.confirmPayment;f.api.confirmPayment=async(id,body,key,...rest)=>{seen={body,key,version:rest[0]};return original(id,body,key,...rest);};
  const next=f.controller();await next.initialize();await next.recover(true);
  assert.deepEqual(seen,{body:{expectedVersion:sale.version,slipReference:null},key:operationId,version:1});next.dispose();
});
test("price edits require permission and cannot lower a protected product",async()=>{
  const f=fixture("000123",true),c=f.controller();const bootstrap=f.api.bootstrap;
  f.api.bootstrap=async()=>{const b=await bootstrap();return {...b,permissions:{...b.permissions,canEditPrice:false}};};
  await c.initialize();await c.addProduct(f.p);c.setUnitPrice(f.p.variantId,1);assert.equal(c.getSnapshot().cart[0].unitPriceCents,200000);c.dispose();
  const g=fixture("000123",true),d=g.controller();Object.assign(g.p,{discountEligible:false});await d.initialize();await d.addProduct(g.p);d.setUnitPrice(g.p.variantId,1);assert.equal(d.getSnapshot().cart[0].unitPriceCents,200000);d.dispose();
});

test("obsolete prepare recovery can load an advanced unpaid v2 basket without replaying it",async()=>{
  const f=fixture("000123",true),c=f.controller();await c.initialize();await c.addProduct(f.p);c.setPaymentMethod("cash");await c.flush();c.dispose();
  const sale=f.getServer()!,operationId=f.api.newId();writeRecoveryMarker(f.storage,{scopeKey:"fixture-actor",kind:"prepare",saleId:sale.id,operationId,expectedVersion:1,expectedTotalCents:200000});
  f.api.prepareSale=async()=>{throw new InStoreSalesUiError("client_upgrade_required",409,false);};
  const next=f.controller();await next.initialize();await next.recover(true);assert.equal(next.getSnapshot().canAcceptRecovery,true);await next.acceptRecoveryCurrentSale();
  assert.equal(next.getSnapshot().recovery,null);assert.equal(next.getSnapshot().paymentMethod,"cash");assert.equal(next.getSnapshot().sale?.status,"draft");next.dispose();
});

function creditFixture(collectionCents:number|null=0,creditPermission=true){
  const date="2026-09-26T00:00:00.000Z";
  const f=fixture("000123",true),api=f.api as MutableClient;
  (api as {contractVersion:number}).contractVersion=3;
  const customer={id:LOCATION,name:"Ayşe Kaya",firstName:"Ayşe",lastName:"Kaya",phone:"05550001122",email:null,archived:false};
  const bootstrap=api.bootstrap;api.bootstrap=async()=>{const value=await bootstrap();return{...value,permissions:{...value.permissions,canSellOnCredit:creditPermission,canCollectReceivables:false}};};
  let server:InStoreSale|null=null;const originalCreate=api.createSale,originalUpdate=api.updateSale;
  api.createSale=async(input,key)=>{const value=await originalCreate(input,key);server={...value.sale,contractVersion:3,customerId:input.intent.customerId??null,customer:input.intent.customerId?customer:null,initialCollectionCents:input.intent.initialCollectionCents??value.sale.totals.totalCents,dueDate:input.intent.dueDate??null,finance:null};return{...value,sale:server!};};
  api.updateSale=async(id,input,key)=>{const value=await originalUpdate(id,input,key);server={...value.sale,contractVersion:3,customerId:input.intent.customerId??null,customer:input.intent.customerId?customer:null,initialCollectionCents:input.intent.initialCollectionCents??value.sale.totals.totalCents,dueDate:input.intent.dueDate??null,finance:null};return{...value,sale:server!};};
  const originalDiscard=api.discardSale;
  api.discardSale=async(id,input,key,version)=>{const value=await originalDiscard(id,input,key,version);server={...server!,status:"cancelled",version:input.expectedVersion+1};return{...value,sale:server!};};
  api.prepareSale=async()=>{server={...server!,status:"payment_pending",version:server!.version+1};return{sale:server,replayed:false,priceChanged:false};};
  api.getSale=async()=>server!;
  api.completeSale=async()=>{const collected=server!.initialCollectionCents!,due=server!.totals.totalCents-collected;server={...server!,status:"completed",version:server!.version+1,completedAt:date,finance:{status:due?collected?"partial":"unpaid":"paid",collectedCents:collected,dueCents:due,refundDueCents:0,version:1,receipts:[]}};return{sale:server,replayed:false,priceChanged:false};};
  const controller=f.controller();return{...f,controller,customer,collectionCents};
}

test("V3 zero collection freezes a named customer and completes without a payment attestation",async()=>{
  const f=creditFixture();await f.controller.initialize();await f.controller.addProduct(f.p);
  assert.equal(typeof f.controller.setCreditTerms,"function","credit terms must be supported before prepare");
  f.controller.selectCustomer(f.customer);f.controller.setCreditTerms(0,"2026-11-02");await f.controller.prepare();
  const prepared=f.controller.getSnapshot().sale!;assert.equal(prepared.customerId,LOCATION);assert.equal(prepared.initialCollectionCents,0);assert.equal(prepared.dueDate,"2026-11-02");
  f.controller.setCreditTerms(1,null);assert.equal(f.controller.getSnapshot().initialCollectionCents,0,"prepared amount is frozen");
  await f.controller.finish();assert.equal(f.calls.filter(call=>call.kind==="payment").length,0);assert.equal(f.controller.getSnapshot().sale!.finance!.dueCents,200000);f.controller.dispose();
});
test("V3 partial collection requires credit permission, CRM contact and a positive collection method",async()=>{
  const f=creditFixture(50000,false);await f.controller.initialize();await f.controller.addProduct(f.p);
  assert.equal(typeof f.controller.setCreditTerms,"function");f.controller.selectCustomer(f.customer);f.controller.setCreditTerms(50000,null);f.controller.setPaymentMethod("cash");await f.controller.prepare();
  assert.equal(f.controller.getSnapshot().sale?.status,"draft");assert.match(f.controller.getSnapshot().error??"",/veresiye.*yetki/i);f.controller.dispose();
  const permitted=creditFixture();await permitted.controller.initialize();await permitted.controller.addProduct(permitted.p);permitted.controller.setCreditTerms(50000,null);permitted.controller.setPaymentMethod("cash");await permitted.controller.prepare();
  assert.match(permitted.controller.getSnapshot().error??"",/müşteri.*telefon/i);
  permitted.controller.selectCustomer(permitted.customer);permitted.controller.setPaymentMethod(null);await permitted.controller.prepare();assert.match(permitted.controller.getSnapshot().error??"",/yöntem/i);permitted.controller.dispose();
});
test("V3 default full collection follows the cart until prepared and rejects overpayment",async()=>{
  const f=creditFixture();await f.controller.initialize();await f.controller.addProduct(f.p);
  assert.equal(f.controller.getSnapshot().initialCollectionCents,null,"default means collect full current total");
  f.controller.setCreditTerms(200001,null);f.controller.setPaymentMethod("cash");await f.controller.prepare();assert.match(f.controller.getSnapshot().error??"",/toplam/i);
  f.controller.setCreditTerms(null,null);await f.controller.prepare();assert.equal(f.controller.getSnapshot().sale!.initialCollectionCents,200000);f.controller.dispose();
});

test("discarding an editable sale clears customer, credit, payment, discount and note before a new sale",async()=>{
  const f=creditFixture(),controller=f.controller;await controller.initialize();await controller.addProduct(f.p);
  controller.selectCustomer(f.customer);controller.setCreditTerms(50000,"2026-11-02");controller.setPaymentMethod("cash");
  controller.setDiscount({kind:"percentage",percentageBps:1000});controller.setCustomer(f.customer.name,"Önceki sepet notu");await controller.flush();
  const oldId=controller.getSnapshot().sale!.id;
  try{
    await controller.discardSale();
    const next=controller.getSnapshot();
    assert.equal(f.getServer()?.status,"cancelled");assert.equal(next.sale,null);assert.deepEqual(next.cart,[]);
    assert.equal(next.customer,null);assert.equal(next.customerId,null);assert.equal(next.customerName,"");
    assert.equal(next.initialCollectionCents,null);assert.equal(next.dueDate,null);assert.equal(next.paymentMethod,null);
    assert.equal(next.discount,null);assert.equal(next.note,"");assert.equal(next.dirty,false);assert.equal(next.recovery,null);
    await controller.addProduct(f.p);assert.notEqual(controller.getSnapshot().sale!.id,oldId);
    assert.equal(controller.getSnapshot().sale!.customerId,null);assert.equal(controller.getSnapshot().sale!.note,null);
  }finally{controller.dispose();}
});

test("removing the last saved item discards the sale instead of submitting an invalid empty update",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);
  const update=f.api.updateSale;
  f.api.updateSale=async(id,input,key,version)=>{
    if(!input.intent.items.length)throw new InStoreSalesUiError("invalid_input",400,false);
    return update(id,input,key,version);
  };
  try{
    controller.setQuantity(f.p.variantId,0);await controller.flush();
    assert.equal(f.getServer()?.status,"cancelled");assert.deepEqual(f.calls.map(call=>call.kind),["create","discard"]);
    assert.equal(controller.getSnapshot().sale,null);assert.equal(controller.getSnapshot().dirty,false);
    const reloaded=f.controller();try{await reloaded.initialize();assert.equal(reloaded.getSnapshot().bootstrap?.activeDraft,null);assert.deepEqual(reloaded.getSnapshot().cart,[]);}finally{reloaded.dispose();}
  }finally{controller.dispose();}
});

test("unknown discard reload retries the same command and stays fenced until cancellation is verified",async()=>{
  const f=fixture("000123",true),first=f.controller();await first.initialize();await first.addProduct(f.p);
  const discard=f.api.discardSale,attempts:{key:string;body:unknown;version:number|undefined}[]=[];let phase=0;
  f.api.discardSale=async(id,input,key,version=f.api.contractVersion)=>{
    attempts.push({key,body:input,version});
    if(phase++===0)throw new InStoreSalesUiError("unavailable",503,true);
    if(phase===2)return {sale:f.getServer()!,replayed:false,priceChanged:false};
    return discard(id,input,key,version);
  };
  let second:InStoreRegisterController|undefined;
  try{
    await first.discardSale();const marker=first.getSnapshot().recovery!;
    assert.equal(marker.kind,"discard");assert.equal(readRecoveryMarker(f.storage,"fixture-actor")?.operationId,marker.operationId);
    await first.newSale();assert.equal(first.getSnapshot().sale?.id,marker.saleId);first.dispose();
    second=f.controller();await second.initialize();assert.equal(second.getSnapshot().recovery?.operationId,marker.operationId);
    await second.recover(true);assert.equal(second.getSnapshot().recovery?.operationId,marker.operationId,"a draft response does not prove terminal cancellation");
    assert.equal(second.getSnapshot().sale?.id,marker.saleId);await second.newSale();assert.equal(second.getSnapshot().sale?.id,marker.saleId);
    await second.recover(true);
    assert.deepEqual(attempts,[{key:marker.operationId,body:{expectedVersion:1,confirmUnpaid:true},version:2},{key:marker.operationId,body:{expectedVersion:1,confirmUnpaid:true},version:2},{key:marker.operationId,body:{expectedVersion:1,confirmUnpaid:true},version:2}]);
    assert.equal(f.getServer()?.status,"cancelled");assert.equal(second.getSnapshot().recovery,null);assert.equal(second.getSnapshot().sale,null);
    assert.equal(readRecoveryMarker(f.storage,"fixture-actor"),null);assert.equal(f.calls.filter(call=>call.kind==="discard").length,1);
  }finally{first.dispose();second?.dispose();}
});

test("discard cannot reset payment stages or an unresolved draft operation",async()=>{
  for(const status of ["payment_pending","payment_received","completed"] as const){
    const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);await controller.prepare();
    if(status==="payment_received"){
      const sale=f.getServer()!;await f.api.confirmPayment(sale.id,{expectedVersion:sale.version,slipReference:null},f.api.newId());
      controller.dispose();const reopened=f.controller();try{await reopened.initialize();await reopened.openSale(sale.id);await reopened.discardSale();assert.equal(reopened.getSnapshot().sale?.status,status);assert.equal(f.calls.some(call=>call.kind==="discard"),false);}finally{reopened.dispose();}
    }else{
      try{if(status==="completed")await controller.finish();await controller.discardSale();assert.equal(controller.getSnapshot().sale?.status,status);assert.equal(f.calls.some(call=>call.kind==="discard"),false);}finally{controller.dispose();}
    }
  }
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);
  f.api.updateSale=async()=>{throw new InStoreSalesUiError("unavailable",503,true);};
  try{
    controller.setQuantity(f.p.variantId,2);await assert.rejects(controller.flush());const marker=controller.getSnapshot().recovery!;
    await controller.discardSale();await controller.newSale();
    assert.equal(controller.getSnapshot().recovery?.operationId,marker.operationId);assert.equal(controller.getSnapshot().cart[0].quantity,2);
    assert.equal(f.calls.some(call=>call.kind==="discard"),false);
  }finally{controller.dispose();}
});

test("discard waits for an in-flight save and uses its returned sale version",async()=>{
  const f=fixture(),controller=f.controller();await controller.initialize();await controller.addProduct(f.p);
  let started!:()=>void,release!:()=>void;const start=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const update=f.api.updateSale;f.api.updateSale=async(...args)=>{started();await gate;return update(...args);};
  try{
    controller.setQuantity(f.p.variantId,2);const saving=controller.flush();await start;const abandoning=controller.discardSale();
    await Promise.resolve();assert.equal(f.calls.some(call=>call.kind==="discard"),false);assert.equal(controller.getSnapshot().cart[0].quantity,2);
    release();await Promise.all([saving,abandoning]);
    assert.deepEqual(f.calls.map(call=>call.kind),["create","update","discard"]);assert.equal(f.calls.at(-1)?.version,2);
    assert.equal(f.getServer()?.status,"cancelled");assert.equal(controller.getSnapshot().sale,null);assert.deepEqual(controller.getSnapshot().cart,[]);
  }finally{release();controller.dispose();}
});

test("deselecting the credit customer clears credit terms while keeping the products",async()=>{
  const f=creditFixture(),controller=f.controller;await controller.initialize();await controller.addProduct(f.p);
  try{
    controller.selectCustomer(f.customer);controller.setCreditTerms(0,"2026-11-02");controller.selectCustomer(null);
    assert.equal(controller.getSnapshot().customerId,null);assert.equal(controller.getSnapshot().customerName,"");
    assert.equal(controller.getSnapshot().initialCollectionCents,null);assert.equal(controller.getSnapshot().dueDate,null);
    assert.equal(controller.getSnapshot().cart[0].variantId,f.p.variantId);assert.equal(controller.getSnapshot().cart[0].quantity,1);
    await controller.flush();assert.equal(controller.getSnapshot().sale?.customerId,null);assert.equal(controller.getSnapshot().sale?.initialCollectionCents,200000);
  }finally{controller.dispose();}
});

function splitDraftFixture(){
  const id=(value:number)=>`9e000000-0000-4000-8000-${String(value).padStart(12,"0")}`;
  const at="2026-10-07T00:00:00.000Z";
  const parts:readonly UiPaymentPart[]=[{partId:id(3),paymentMethod:"cash",amountCents:60000},{partId:id(4),paymentMethod:"card",amountCents:40000}];
  const unpaid=(part:UiPaymentPart)=>({...part,receiptId:null,receivedAt:null,actorMembershipId:null,refundEventId:null,returnedAt:null});
  let sequence=10,server:InStoreSale={
    id:id(1),saleNumber:"POS-1",status:"draft",version:1,contractVersion:4,locationId:LOCATION,locationName:"Mağaza",ownerMembershipId:LOCATION,ownerLabel:"Kasiyer",
    customerName:null,customerId:null,customer:null,initialCollectionCents:0,dueDate:null,finance:null,paymentMethod:null,note:null,discount:null,
    salesChannel:"manual",socialPlatform:null,socialReference:null,fulfillmentMethod:"pickup",shippingAddress:null,billingAddress:null,shippingCents:0,paymentParts:[],prepareOperationId:null,abortRequested:false,
    items:[{productId:id(1),variantId:id(5),productName:"Ürün",variantName:"M",sku:null,barcode:"123",imageUrl:null,unitPriceCents:100000,catalogUnitPriceCents:100000,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null,discountEligible:true,quantity:1,lineSubtotalCents:100000,allocatedDiscountCents:0,lineNetCents:100000}],
    totals:{subtotalCents:100000,eligibleSubtotalCents:100000,discountCents:0,shippingCents:0,totalCents:100000},createdAt:at,updatedAt:at,paymentReceivedAt:null,completedAt:null,orderId:null,orderNumber:null,
  };
  const calls:{method:string;body:unknown}[]=[];
  const bootstrap=():InStoreBootstrap=>({
    scopeKey:"split-draft-actor",locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],
    permissions:{canSell:true,canEditPrice:true,canDiscount:true,discountLimitBps:9999,canSellOnCredit:true,canCollectReceivables:true,creditSalesAvailable:true,canResolve:true,canManageStaff:false,manualSalesV4Available:true},
    activeDraft:server.status==="draft"?server:null,heldSales:[],pendingSales:server.status==="payment_pending"?[server]:[],recentSales:[],
    summary:{completedCount:0,grossCents:0,discountCents:0,netCents:0,pendingPaymentCount:server.status==="payment_pending"?1:0},
  });
  const api=createInStoreSalesUiClient({contractVersion:4,randomUUID:()=>id(sequence++),fetch:async(url,init)=>{
    const path=String(url),method=init?.method??"GET";
    if(path==="/api/orders/in-store/bootstrap")return Response.json({data:bootstrap()});
    const body=JSON.parse(String(init?.body));calls.push({method,body});
    if(method==="PATCH"&&path===`/api/orders/in-store/sales/${server.id}`){
      const intent=body.intent as InStoreSaleIntent;
      server={...server,...intent,items:server.items,version:server.version+1,initialCollectionCents:100000,paymentMethod:null,paymentParts:intent.paymentParts!.map(unpaid)};
    }else if(method==="POST"&&path===`/api/orders/in-store/sales/${server.id}/prepare`){
      server={...server,status:"payment_pending",version:server.version+1,prepareOperationId:new Headers(init?.headers).get("idempotency-key")};
    }else throw new Error(`unexpected request ${method} ${path}`);
    return Response.json({data:{sale:server,replayed:false,priceChanged:false}});
  }});
  return{parts,calls,controller:()=>new InStoreRegisterController(api),getServer:()=>server};
}

test("an autosaved V4 split payment plan can prepare with its persisted receipt fields",async()=>{
  const f=splitDraftFixture(),controller=f.controller();
  try{
    await controller.initialize();controller.setPaymentParts(f.parts);await controller.flush();
    const savedParts=controller.getSnapshot().paymentParts;
    assert.equal(Object.hasOwn(savedParts[0],"receiptId"),true);
    await controller.prepare();
    assert.equal(controller.getSnapshot().error,null);
    assert.equal(controller.getSnapshot().sale?.status,"payment_pending");
    assert.deepEqual(controller.getSnapshot().paymentParts,savedParts,"preparing keeps each persisted receipt field");
    assert.equal(f.calls.filter(call=>call.method==="POST").length,1);
  }finally{controller.dispose();}
});

test("a reopened V4 split payment draft can prepare without rewriting its saved plan",async()=>{
  const f=splitDraftFixture(),first=f.controller();let reopened:InStoreRegisterController|undefined;
  try{
    await first.initialize();first.setPaymentParts(f.parts);await first.flush();first.dispose();
    reopened=f.controller();await reopened.initialize();await reopened.prepare();
    assert.equal(reopened.getSnapshot().error,null);
    assert.equal(reopened.getSnapshot().sale?.status,"payment_pending");
    assert.deepEqual(reopened.getSnapshot().paymentParts,f.getServer().paymentParts);
    assert.deepEqual(f.calls.map(call=>call.method),["PATCH","POST"]);
  }finally{first.dispose();reopened?.dispose();}
});
