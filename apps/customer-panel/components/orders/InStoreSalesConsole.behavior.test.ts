import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as model from "../../lib/in-store-sales-ui/model.ts";
import { type InStoreSalesUiClient } from "../../lib/in-store-sales-ui/client.ts";
import type { InStoreBootstrap, InStoreSale } from "@celebix/saas-contracts";

const ID="9e000000-0000-4000-8000-000000000001", LOCATION="9e000000-0000-4000-8000-000000000003", date="2026-09-26T00:00:00.000Z";
type MutableClient={-readonly[K in keyof InStoreSalesUiClient]:InStoreSalesUiClient[K]};
function fixture(status:InStoreSale["status"]="draft"){
  let count=10;
  let sale:InStoreSale={id:ID,saleNumber:"MS-101",status,version:1,locationId:LOCATION,locationName:"Mağaza",ownerMembershipId:LOCATION,ownerLabel:"Kasiyer",customerName:null,note:null,discount:null,
    items:[{productId:LOCATION,variantId:LOCATION,productName:"Ürün",variantName:"Siyah M",sku:null,barcode:"000123",imageUrl:null,unitPriceCents:200000,quantity:1,discountEligible:true,lineSubtotalCents:200000,allocatedDiscountCents:0,lineNetCents:200000}],totals:{subtotalCents:200000,eligibleSubtotalCents:200000,discountCents:0,totalCents:200000},createdAt:date,updatedAt:date,paymentReceivedAt:status==="payment_received"?date:null,completedAt:null,orderId:null,orderNumber:null};
  const bootstrap=():InStoreBootstrap=>({scopeKey:"behavior-actor",locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],permissions:{canSell:true,canDiscount:true,discountLimitBps:9999,canResolve:false,canManageStaff:false},activeDraft:sale,heldSales:[],pendingSales:[],recentSales:[],summary:{completedCount:0,grossCents:0,discountCents:0,netCents:0,pendingPaymentCount:0}});
  const api={newId:()=>`9e000000-0000-4000-8000-${String(count++).padStart(12,"0")}`,bootstrap:async()=>bootstrap(),getOperation:async()=>null,getSale:async()=>sale,
    updateSale:async(_id:string,input:{expectedVersion:number;intent:{discount:InStoreSale["discount"];items:{quantity:number}[]}})=>{const quantity=input.intent.items[0]?.quantity??0;const totals=model.previewTotals(quantity?[{unitPriceCents:200000,quantity,discountEligible:true}]:[],input.intent.discount);sale={...sale,version:sale.version+1,discount:input.intent.discount,items:quantity?[{...sale.items[0],quantity,lineSubtotalCents:200000*quantity,allocatedDiscountCents:totals.discountCents,lineNetCents:totals.totalCents}]:[],totals};return{sale,replayed:false,priceChanged:false};},
    listSales:async()=>({sales:[],nextCursor:null}),searchProducts:async()=>[],
    prepareSale:async()=>{sale={...sale,status:"payment_pending",version:sale.version+1};return{sale,replayed:false,priceChanged:false};},
  } as unknown as MutableClient;
  return api;
}
async function mounted(verify:(container:HTMLElement,browser:Window)=>Promise<void>,status:InStoreSale["status"]="draft",customize?:(api:MutableClient)=>Promise<void>|void){
  const api=fixture(status);await customize?.(api);
  const browser=new Window({url:"https://panel.example.test/orders/quick-links"});
  const globals=new Map<string,PropertyDescriptor|undefined>();
  for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLDialogElement:browser.HTMLDialogElement,Event:browser.Event,MouseEvent:browser.MouseEvent,requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(Date.now()),0),IS_REACT_ACT_ENVIRONMENT:true})){
    globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const source=await readFile(new URL("./InStoreSalesConsole.tsx",import.meta.url),"utf8");
  const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const compiled:{exports:Record<string,unknown>}={exports:{}};
  Function("require","module","exports",output)((name:string)=>{
    if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;
    if(name==="lucide-react")return new Proxy({},{get:()=>()=>createElement("svg",{"aria-hidden":true})});
    if(name==="@/components/panel/PanelPageShell")return {PanelPageShell:({children}:{children:React.ReactNode})=>createElement("section",null,children),PanelPageHeader:()=>null,PanelStatusBadge:({children}:{children:React.ReactNode})=>createElement("span",null,children)};
    if(name==="@/lib/in-store-sales-ui/client")return {inStoreSalesUi:api};
    if(name==="@/lib/in-store-sales-ui/model")return model;
    if(name==="./in-store-sales.module.css")return {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};
    throw new Error(`unexpected_import:${name}`);
  },compiled,compiled.exports);
  const Component=compiled.exports.InStoreSalesConsole as React.ComponentType;
  const container=browser.document.createElement("main");browser.document.body.append(container);const root=createRoot(container as unknown as HTMLElement);
  try{await act(async()=>{root.render(createElement(Component));await new Promise(r=>setTimeout(r,20));});await act(async()=>{await new Promise(r=>setTimeout(r,20));});await verify(container as unknown as HTMLElement,browser);}
  finally{await act(async()=>root.unmount());for(const[key,descriptor]of globals)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
const button=(container:HTMLElement,label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(x=>x.textContent?.trim()===label)!;

test("native discount dialog is labelled and blank Enter cannot apply a discount",async()=>{
  await mounted(async(container,browser)=>{
    const trigger=button(container,"İndirim uygula");trigger.focus();await act(async()=>{trigger.click();});
    await act(async()=>{await new Promise(r=>setTimeout(r,10));});
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    assert.equal(dialog.open,true);assert.ok(dialog.getAttribute("aria-labelledby"));assert.equal(browser.document.activeElement?.tagName,"INPUT");
    const apply=button(dialog,"Uygula");assert.equal(apply.disabled,true);
    await act(async()=>{dialog.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event);});
    assert.equal(dialog.open,true);assert.equal(container.querySelector(".totalBlock strong")?.textContent,"₺2.000,00");
    await act(async()=>{button(dialog,"Vazgeç").click();});
    await act(async()=>{await new Promise(r=>setTimeout(r,10));});
    assert.equal(dialog.open,false);assert.equal(browser.document.activeElement?.textContent?.trim(),"İndirim uygula");
  });
});
test("quantity button keeps keyboard focus after a cart update",async()=>{
  await mounted(async(container,browser)=>{
    const increase=container.querySelector<HTMLButtonElement>('button[aria-label="Ürün adedini artır"]')!;increase.focus();
    await act(async()=>increase.click());assert.equal(browser.document.activeElement,increase);
    assert.equal(container.querySelector(".quantity span")?.textContent,"2");
  });
});
test("payment-ready screen locks scanner, quantity and discount, exposes one payment action",async()=>{
  await mounted(async(container)=>{
    assert.equal(container.querySelector<HTMLInputElement>('#in-store-scan')?.disabled,true);
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="Ürün adedini artır"]')?.disabled,true);
    assert.equal(button(container,"İndirim uygula").disabled,true);
    assert.ok(button(container,"Ödemeyi aldım — Satışı tamamla"));
    assert.equal(container.querySelectorAll(".checkoutFooter .primary").length,1);
  },"payment_pending");
});
test("received-payment screen never offers unpaid cancellation",async()=>{
  await mounted(async(container)=>{
    assert.equal(button(container,"Ödeme alınmadı — Sepete dön"),undefined);
    assert.ok(button(container,"Satışı kaydetmeyi yeniden dene"));
    assert.match(container.textContent??"",/Yeniden tahsilat yapma/);
  },"payment_received");
});
// Happy DOM does not synthesize React's browser input tracking. Invoke the rendered
// input's actual React change handler, then exercise native form submit and rerender.
async function fill(container:HTMLElement,value:string){
  const input=container.querySelector<HTMLInputElement>('#in-store-scan')!;
  const key=Object.keys(input).find(key=>key.startsWith('__reactProps$'))!;
  const props=(input as unknown as Record<string,{onChange:(event:{target:{value:string}})=>void}>)[key];
  await act(async()=>props.onChange({target:{value}}));
}
test("fresh prepare gives POS entry instructions and resumed pending sale checks the slip first",async()=>{
  await mounted(async(container)=>{
    await act(async()=>button(container,"Ödemeye geç").click());
    assert.match(container.textContent??"",/Bu tutarı fiziksel POS’a gir/);
    assert.equal((container.textContent??"").includes("Bekleyen ödeme yeniden açıldı"),false);
  });
  await mounted(async(container)=>{
    await act(async()=>button(container,"Bekleyen satışlar1").click());
    await act(async()=>button(container,"Satışa dön").click());
    assert.match(container.textContent??"",/Önce fiziksel POS slipini kontrol et/);
    assert.match(container.textContent??"",/Ödeme alındıysa tekrar tahsilat yapma/);
    assert.match(container.textContent??"",/Kontrol edilecek tutar/);
    assert.equal((container.textContent??"").includes("Bu tutarı fiziksel POS’a gir"),false);
  },"draft",async(api)=>{
    const pending={...await api.getSale(ID),status:"payment_pending" as const};const bootstrap=await api.bootstrap();
    api.bootstrap=async()=>({...bootstrap,activeDraft:null,pendingSales:[pending]});api.listSales=async()=>({sales:[pending],nextCursor:null});api.getSale=async()=>pending;
  });
});
test("Enter on an alphanumeric barcode performs exact barcode lookup and adds its registered variant",async()=>{
  const requests:unknown[]=[];
  await mounted(async(container,browser)=>{
    await fill(container,"ABC-123");await act(async()=>container.querySelector(".scanCard")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));
    assert.deepEqual(requests,[{locationId:LOCATION,barcode:"ABC-123"}]);assert.equal(container.querySelector(".quantity span")?.textContent,"2");
  },"draft",async(api)=>{
    const sale=await api.getSale(ID),line=sale.items[0];
    api.searchProducts=async input=>{requests.push(input);return input.barcode==="ABC-123"?[{...line,barcode:"ABC-123",pricingUnavailable:false,stockTracking:true,availableQuantity:10}]:[];};
  });
});
test("changing a query clears the old single result before Enter can choose it",async()=>{
  const requests:string[]=[];
  await mounted(async(container,browser)=>{
    await fill(container,"Old");await act(async()=>{await new Promise(resolve=>setTimeout(resolve,230));});
    assert.match(container.querySelector(".results")?.textContent??"",/Old product/);
    await fill(container,"New product");
    await act(async()=>container.querySelector(".scanCard")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));
    assert.equal(container.querySelector(".quantity span")?.textContent,"1");assert.ok(requests.includes("barcode:New product"));
    assert.equal(container.querySelector(".results")?.textContent?.includes("Old product")??false,false);
  },"draft",async(api)=>{
    const line=(await api.getSale(ID)).items[0];
    api.searchProducts=async input=>{requests.push(input.barcode?`barcode:${input.barcode}`:`query:${input.query}`);return input.query==="Old"?[{...line,productName:"Old product",pricingUnavailable:false,stockTracking:true,availableQuantity:10}]:[];};
  });
});
