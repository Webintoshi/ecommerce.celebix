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
import { InStoreSalesUiError, type InStoreSalesUiClient } from "./client.ts";
import type { InStoreBootstrap, InStoreProduct, InStoreSale, InStoreSaleIntent, InStoreSaleResult } from "@celebix/saas-contracts";
const LOCATION="9e000000-0000-4000-8000-000000000003";
type MutableClient={-readonly[K in keyof InStoreSalesUiClient]:InStoreSalesUiClient[K]};
function fixture(barcode="000123"){
  let sequence=10,server:InStoreSale|null=null,completeFailures=0,price=200000;
  const calls:{kind:string;key:string;version?:number;total?:number}[]=[],operations=new Map<string,InStoreSaleResult>();
  const p:InStoreProduct={productId:"9e000000-0000-4000-8000-000000000004",variantId:"9e000000-0000-4000-8000-000000000005",productName:"Ürün",variantName:"Siyah M",sku:null,barcode,imageUrl:null,unitPriceCents:200000,pricingUnavailable:false,availableQuantity:10,stockTracking:true,discountEligible:true};
  const date="2026-09-26T00:00:00.000Z";
  function sale(intent:InStoreSaleIntent,version:number,status:InStoreSale["status"],id=server?.id??"9e000000-0000-4000-8000-000000000001"):InStoreSale{
    const totals=previewTotals(intent.items.map(x=>({unitPriceCents:price,quantity:x.quantity,discountEligible:true})),intent.discount);
    return {id,saleNumber:"MS-101",status,version,locationId:intent.locationId,locationName:"Mağaza",ownerMembershipId:LOCATION,ownerLabel:"Kasiyer",customerName:intent.customerName,note:intent.note,discount:intent.discount,
      items:intent.items.map(x=>({...p,unitPriceCents:price,quantity:x.quantity,lineSubtotalCents:price*x.quantity,allocatedDiscountCents:totals.discountCents,lineNetCents:price*x.quantity-totals.discountCents})),totals,createdAt:date,updatedAt:date,paymentReceivedAt:["payment_received","completed"].includes(status)?date:null,completedAt:status==="completed"?date:null,orderId:status==="completed"?LOCATION:null,orderNumber:status==="completed"?"S-101":null};
  }
  const intent=()=>({locationId:LOCATION,items:server?.items.map(x=>({variantId:x.variantId,quantity:x.quantity}))??[],discount:server?.discount??null,customerName:server?.customerName??null,note:server?.note??null});
  function result(key:string){const r={sale:server!,replayed:false,priceChanged:false};operations.set(key,r);return r;}
  const bootstrap=():InStoreBootstrap=>({scopeKey:"fixture-actor",locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],permissions:{canSell:true,canDiscount:true,discountLimitBps:9999,canResolve:true,canManageStaff:false},activeDraft:server?.status==="draft"?server:null,heldSales:server?.status==="held"?[server]:[],pendingSales:server&&["payment_pending","payment_received"].includes(server.status)?[server]:[],recentSales:server?.status==="completed"?[server]:[],summary:{completedCount:0,grossCents:0,discountCents:0,netCents:0,pendingPaymentCount:0}});
  const api={newId:()=>`9e000000-0000-4000-8000-${String(sequence++).padStart(12,"0")}`,bootstrap:async()=>bootstrap(),searchProducts:async()=>[p],getSale:async()=>{if(!server)throw new InStoreSalesUiError("not_found",404,false);return server;},getOperation:async(key:string)=>operations.get(key)??null,
    createSale:async(input:{saleId:string;intent:InStoreSaleIntent},key:string)=>{calls.push({kind:"create",key});server=sale(input.intent,1,"draft",input.saleId);return result(key);},
    updateSale:async(_id:string,input:{expectedVersion:number;intent:InStoreSaleIntent},key:string)=>{assert.equal(input.expectedVersion,server!.version);calls.push({kind:"update",key,version:input.expectedVersion});server=sale(input.intent,input.expectedVersion+1,"draft");return result(key);},
    holdSale:async(_id:string,input:{expectedVersion:number;held:boolean},key:string)=>{calls.push({kind:"hold",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,input.held?"held":"draft");return result(key);},
    prepareSale:async(_id:string,input:{expectedVersion:number;expectedTotalCents:number},key:string)=>{if(input.expectedVersion!==server!.version)throw new InStoreSalesUiError("version_conflict",409,false);calls.push({kind:"prepare",key,total:input.expectedTotalCents});const changed=input.expectedTotalCents!==server!.totals.totalCents;server=sale(intent(),input.expectedVersion+1,changed?"draft":"payment_pending");const r={...result(key),priceChanged:changed};operations.set(key,r);return r;},
    confirmPayment:async(_id:string,input:{expectedVersion:number;slipReference:null},key:string)=>{assert.equal(input.slipReference,null);calls.push({kind:"payment",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,"payment_received");return result(key);},
    cancelSale:async(_id:string,input:{expectedVersion:number;confirmUnpaid:true},key:string)=>{calls.push({kind:"cancel",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,"draft");return result(key);},
    takeoverSale:async(_id:string,input:{expectedVersion:number},key:string)=>{calls.push({kind:"takeover",key,version:input.expectedVersion});server=sale(intent(),input.expectedVersion+1,server!.status);return result(key);},
    completeSale:async(_id:string,input:{expectedVersion:number},key:string)=>{calls.push({kind:"complete",key,version:input.expectedVersion});if(completeFailures-->0)throw new InStoreSalesUiError("unavailable",503,true);server=sale(intent(),input.expectedVersion+1,"completed");return result(key);},
  } as unknown as MutableClient;
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  return {api,p,calls,storage,getServer:()=>server,failCompletion:()=>{completeFailures=1;},changePrice:(newPrice:number)=>{price=newPrice;},controller:()=>new InStoreRegisterController(api,()=>storage)};
}

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
