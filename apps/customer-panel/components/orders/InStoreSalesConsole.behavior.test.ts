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
import type { InStoreBootstrap, InStoreSale, InStoreSaleIntent } from "@celebix/saas-contracts";

const ID="9e000000-0000-4000-8000-000000000001", LOCATION="9e000000-0000-4000-8000-000000000003", date="2026-09-26T00:00:00.000Z";
type MutableClient={-readonly[K in keyof InStoreSalesUiClient]:InStoreSalesUiClient[K]};
function fixture(status:InStoreSale["status"]="draft"){
  let count=10;
  let sale:InStoreSale={id:ID,saleNumber:"MS-101",status,version:1,locationId:LOCATION,locationName:"Mağaza",ownerMembershipId:LOCATION,ownerLabel:"Kasiyer",customerName:null,note:null,discount:null,paymentMethod:null,
    items:[{productId:LOCATION,variantId:LOCATION,productName:"Ürün",variantName:"Siyah M",sku:null,barcode:"000123",imageUrl:null,unitPriceCents:200000,catalogUnitPriceCents:200000,unitPriceOverrideCents:null,quantity:1,discountEligible:true,lineSubtotalCents:200000,allocatedDiscountCents:0,lineNetCents:200000}],totals:{subtotalCents:200000,eligibleSubtotalCents:200000,discountCents:0,totalCents:200000},createdAt:date,updatedAt:date,paymentReceivedAt:status==="payment_received"?date:null,completedAt:null,orderId:null,orderNumber:null};
  const bootstrap=():InStoreBootstrap=>({scopeKey:"behavior-actor",locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],permissions:{canSell:true,canEditPrice:true,canDiscount:true,discountLimitBps:9999,canResolve:false,canManageStaff:false},activeDraft:sale,heldSales:[],pendingSales:[],recentSales:[],summary:{completedCount:0,grossCents:0,discountCents:0,netCents:0,pendingPaymentCount:0}});
  const api={contractVersion:2,newId:()=>`9e000000-0000-4000-8000-${String(count++).padStart(12,"0")}`,bootstrap:async()=>bootstrap(),getOperation:async()=>null,getSale:async()=>sale,
    updateSale:async(_id:string,input:{expectedVersion:number;intent:InStoreSaleIntent})=>{const quantity=input.intent.items[0]?.quantity??0,override=input.intent.items[0]?.unitPriceOverrideCents??null,applied=override??200000;const totals=model.previewTotals(quantity?[{unitPriceCents:applied,quantity,discountEligible:sale.items[0]?.discountEligible??true}]:[],input.intent.discount);sale={...sale,version:sale.version+1,discount:input.intent.discount,paymentMethod:input.intent.paymentMethod??null,items:quantity?[{...sale.items[0],unitPriceCents:applied,catalogUnitPriceCents:200000,unitPriceOverrideCents:override,quantity,lineSubtotalCents:applied*quantity,allocatedDiscountCents:totals.discountCents,lineNetCents:totals.totalCents}]:[],totals};return{sale,replayed:false,priceChanged:false};},
    listSales:async()=>({sales:[],nextCursor:null}),searchProducts:async()=>[],
    prepareSale:async()=>{sale={...sale,status:"payment_pending",version:sale.version+1};return{sale,replayed:false,priceChanged:false};},
  } as unknown as MutableClient;
  return api;
}
async function mounted(verify:(container:HTMLElement,browser:Window)=>Promise<void>,status:InStoreSale["status"]="draft",customize?:(api:MutableClient)=>Promise<void>|void){
  const api=fixture(status);await customize?.(api);
  const browser=new Window({url:"https://panel.example.test/orders/quick-links"});
  const globals=new Map<string,PropertyDescriptor|undefined>();
  for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLDialogElement:browser.HTMLDialogElement,Event:browser.Event,MouseEvent:browser.MouseEvent,FormData:browser.FormData,requestAnimationFrame:(fn:FrameRequestCallback)=>setTimeout(()=>fn(Date.now()),0),IS_REACT_ACT_ENVIRONMENT:true})){
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

test("completed receipt and checkout footer show the order code while preserving legacy and missing-order fallbacks",async()=>{
  for(const [orderNumber,expected] of [["POS-0000001","POS-0000001"],["S-101","S-101"],[null,`POS-${ID}`]] as const){
    await mounted(async(container)=>{
      await act(async()=>button(container,"Satışı kaydetmeyi yeniden dene").click());
      assert.match(container.querySelector(".receipt p")?.textContent??"",new RegExp(`^${expected}`));
      assert.equal(container.querySelector(".saleId")?.textContent,`${expected} · Kasiyer`);
    },"payment_received",async(api)=>{
      const paid={...await api.getSale(ID),saleNumber:`POS-${ID}`};
      const completed:InStoreSale={...paid,status:"completed",version:2,completedAt:date,orderId:LOCATION,orderNumber};
      const bootstrap=await api.bootstrap();
      api.bootstrap=async()=>({...bootstrap,activeDraft:paid,recentSales:[completed]});
      api.completeSale=async()=>({sale:completed,replayed:false,priceChanged:false});
    });
  }
});
test("recent completed sales expose their order code even when a customer name is present",async()=>{
  await mounted(async(container)=>{
    await act(async()=>button(container,"Son satışlar").click());
    const entries=Array.from(container.querySelectorAll(".listEntry header strong:first-child"),element=>element.textContent);
    assert.deepEqual(entries,["Ayşe · POS-0000001","Deniz · S-101",`POS-${ID}`]);
  },"draft",async(api)=>{
    const draft=await api.getSale(ID);
    const completed:InStoreSale={...draft,saleNumber:`POS-${ID}`,status:"completed",completedAt:date,paymentReceivedAt:date,orderId:LOCATION,orderNumber:"POS-0000001",customerName:"Ayşe"};
    const legacy:InStoreSale={...completed,id:LOCATION,saleNumber:"MS-101",orderNumber:"S-101",customerName:"Deniz"};
    const fallback:InStoreSale={...completed,id:"9e000000-0000-4000-8000-000000000004",orderNumber:null,customerName:null};
    api.listSales=async()=>({sales:[completed,legacy,fallback],nextCursor:null});
  });
});
test("draft and pending checkout labels retain the stable sale code and held lists retain their fallback",async()=>{
  for(const status of ["draft","payment_pending"] as const){
    await mounted(async(container)=>{
      assert.equal(container.querySelector(".saleId")?.textContent,`POS-${ID} · Kasiyer`);
      await act(async()=>button(container,"Bekletilenler1").click());
      assert.equal(container.querySelector(".listEntry header strong")?.textContent,`POS-${ID}`);
    },status,async(api)=>{
      const sale={...await api.getSale(ID),saleNumber:`POS-${ID}`};
      const held:InStoreSale={...sale,status:"held"};
      const bootstrap=await api.bootstrap();
      api.bootstrap=async()=>({...bootstrap,activeDraft:sale,heldSales:[held]});
      api.listSales=async()=>({sales:[held],nextCursor:null});
    });
  }
});

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
async function fillInput(input:HTMLInputElement,value:string){
  const key=Object.keys(input).find(key=>key.startsWith('__reactProps$'))!;
  const props=(input as unknown as Record<string,{onChange:(event:{target:{value:string}})=>void}>)[key];
  await act(async()=>props.onChange({target:{value}}));
}
async function fill(container:HTMLElement,value:string){await fillInput(container.querySelector<HTMLInputElement>('#in-store-scan')!,value);}
test("fresh prepare gives POS entry instructions and resumed pending sale checks the slip first",async()=>{
  await mounted(async(container)=>{
    assert.ok(button(container,"Kart"),"card selection is available before prepare");
    await act(async()=>button(container,"Kart").click());
    await act(async()=>button(container,"Ödemeye geç").click());
    assert.match(container.textContent??"",/Bu tutarı fiziksel POS’a gir/);
    assert.equal((container.textContent??"").includes("Bekleyen ödeme yeniden açıldı"),false);
  });
  await mounted(async(container)=>{
    await act(async()=>button(container,"Bekleyen satışlar1").click());
    await act(async()=>button(container,"Satışa dön").click());
    await act(async()=>button(container,"Kart").click());
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


test("unit price dialog validates decimal input, applies one price to all quantity, and restores catalog price",async()=>{
  await mounted(async(container,browser)=>{
    const trigger=container.querySelector<HTMLButtonElement>('button[aria-label="Ürün birim fiyatını düzenle"]');
    assert.ok(trigger,"price action is available with permission");trigger.focus();await act(async()=>trigger.click());
    await act(async()=>{await new Promise(r=>setTimeout(r,10));});
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!,input=dialog.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
    assert.equal(dialog.open,true);assert.equal(browser.document.activeElement,input);assert.match(dialog.textContent??"",/Katalog fiyatı.*₺2.000,00/);
    for(const invalid of ["","0","-10","1,005","1e3"]){await fillInput(input,invalid);assert.equal(button(dialog,"Uygula").disabled,true,invalid);}
    await act(async()=>dialog.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));assert.equal(dialog.open,true);
    await fillInput(input,"1800,50");await act(async()=>button(dialog,"Uygula").click());await act(async()=>{await new Promise(r=>setTimeout(r,10));});
    assert.equal(dialog.open,false);assert.equal(browser.document.activeElement,trigger);assert.match(container.querySelector(".identity")?.textContent??"",/Satışa özel fiyat/);assert.equal(container.querySelector(".lineTotal")?.textContent,"₺1.800,50");
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Ürün adedini artır"]')!.click());assert.equal(container.querySelector(".lineTotal")?.textContent,"₺3.601,00");
    await act(async()=>trigger.click());await act(async()=>button(dialog,"Katalog fiyatına dön").click());assert.equal(container.querySelector(".lineTotal")?.textContent,"₺4.000,00");
    assert.equal(container.querySelector(".identity")?.textContent?.includes("Satışa özel fiyat"),false);
  });
});
test("unit price action is absent without price permission and in a prepared sale",async()=>{
  for(const status of ["draft","payment_pending"] as const)await mounted(async(container)=>{
    assert.equal(container.querySelector('button[aria-label="Ürün birim fiyatını düzenle"]'),null);
  },status,async(api)=>{const bootstrap=await api.bootstrap();api.bootstrap=async()=>({...bootstrap,permissions:{...bootstrap.permissions,canEditPrice:status!=="draft"}});});
});
test("price reductions and cart discount share the catalog based permission budget",async()=>{
  await mounted(async(container)=>{
    const price=container.querySelector<HTMLButtonElement>('button[aria-label="Ürün birim fiyatını düzenle"]')!;
    assert.ok(price,"price action is available with permission");await act(async()=>price.click());let dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    await fillInput(dialog.querySelector("input")!,"1800");await act(async()=>button(dialog,"Uygula").click());
    await act(async()=>button(container,"İndirim uygula").click());dialog=container.querySelector("dialog")!;
    await act(async()=>button(dialog,"TL Tutar").click());await fillInput(dialog.querySelector("input")!,"1");
    assert.equal(button(dialog,"Uygula").disabled,true);assert.match(dialog.querySelector('[role="alert"]')?.textContent??"",/sınır/);
    await act(async()=>button(dialog,"Vazgeç").click());await act(async()=>price.click());await fillInput(dialog.querySelector("input")!,"2100");await act(async()=>button(dialog,"Uygula").click());
    await act(async()=>button(container,"İndirim uygula").click());await fillInput(dialog.querySelector("input")!,"10");assert.equal(button(dialog,"Uygula").disabled,true,"10% of increased price cannot enlarge catalog budget");
    await act(async()=>button(dialog,"TL Tutar").click());await fillInput(dialog.querySelector("input")!,"200");assert.equal(button(dialog,"Uygula").disabled,false);
  },"draft",async(api)=>{const bootstrap=await api.bootstrap();api.bootstrap=async()=>({...bootstrap,permissions:{...bootstrap.permissions,discountLimitBps:1000}});});
});
test("an ineligible product can increase in price but cannot reduce in price",async()=>{
  await mounted(async(container)=>{
    const price=container.querySelector<HTMLButtonElement>('button[aria-label="Ürün birim fiyatını düzenle"]');assert.ok(price,"price action is available with permission");await act(async()=>price.click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    await fillInput(dialog.querySelector("input")!,"1999");assert.equal(button(dialog,"Uygula").disabled,true);assert.match(dialog.querySelector('[role="alert"]')?.textContent??"",/indirim/);
    await fillInput(dialog.querySelector("input")!,"2001");assert.equal(button(dialog,"Uygula").disabled,false);
  },"draft",async(api)=>{const bootstrap=await api.bootstrap(),sale=await api.getSale(ID);api.bootstrap=async()=>({...bootstrap,activeDraft:{...sale,items:sale.items.map(row=>({...row,discountEligible:false}))}});});
});
test("draft payment has no default and choosing cash prepares a frozen cash collection",async()=>{
  await mounted(async(container)=>{
    assert.equal(button(container,"Ödemeye geç").disabled,true);assert.equal(button(container,"Kart").getAttribute("aria-pressed"),"false");assert.equal(button(container,"Nakit").getAttribute("aria-pressed"),"false");
    await act(async()=>button(container,"Nakit").click());assert.equal(button(container,"Ödemeye geç").disabled,false);
    await act(async()=>button(container,"Nakit").click());assert.equal(button(container,"Ödemeye geç").disabled,true);assert.equal(button(container,"Nakit").getAttribute("aria-pressed"),"false");
    await act(async()=>button(container,"Nakit").click());assert.equal(button(container,"Ödemeye geç").disabled,false);
    await act(async()=>button(container,"Ödemeye geç").click());assert.equal(button(container,"Kart").disabled,true);assert.equal(button(container,"Nakit").disabled,true);assert.match(container.textContent??"",/nakit.*tahsil/i);assert.equal(container.textContent?.includes("Bu tutarı fiziksel POS’a gir"),false);
  });
});
test("legacy pending sale requires method choice, while a received legacy payment remains immutable",async()=>{
  await mounted(async(container)=>{
    assert.equal(button(container,"Ödemeyi aldım — Satışı tamamla").disabled,true);assert.equal(button(container,"Kart").disabled,false);
    await act(async()=>button(container,"Kart").click());assert.equal(button(container,"Kart ödemesini aldım — Satışı tamamla").disabled,false);assert.match(container.textContent??"",/POS slipini kontrol et/);
  },"payment_pending");
  await mounted(async(container)=>{assert.equal(button(container,"Kart"),undefined);assert.match(container.textContent??"",/Eski kayıt · Harici POS/);},"payment_received");
});
test("receipt and recent sales display their saved payment method with a legacy fallback",async()=>{
  await mounted(async(container)=>{
    await act(async()=>button(container,"Satışı kaydetmeyi yeniden dene").click());assert.match(container.querySelector(".receipt")?.textContent??"",/Nakit · Kasiyer beyanı/);
    await act(async()=>button(container,"Son satışlar").click());const rows=Array.from(container.querySelectorAll(".listEntry"),row=>row.textContent??"");assert.match(rows[0],/Kart · Harici POS/);assert.match(rows[1],/Nakit/);assert.match(rows[2],/Eski kayıt · Harici POS/);
  },"payment_received",async(api)=>{const paid={...await api.getSale(ID),paymentMethod:"cash" as const},bootstrap=await api.bootstrap();api.bootstrap=async()=>({...bootstrap,activeDraft:paid});const completed={...paid,status:"completed" as const,completedAt:date};api.completeSale=async()=>({sale:completed,replayed:false,priceChanged:false});api.listSales=async()=>({sales:[{...completed,paymentMethod:"card"},{...completed,id:LOCATION},{...completed,id:"9e000000-0000-4000-8000-000000000004",paymentMethod:null}],nextCursor:null});});
});
test("staff price permission is editable and included in the saved grant",async()=>{
  let saved:unknown;
  await mounted(async(container)=>{
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Satış yetkileri"]')!.click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!,checkbox=dialog.querySelector<HTMLInputElement>('input[name="canEditPrice"]');assert.ok(checkbox);assert.match(checkbox.closest("label")?.textContent??"",/Fiyat düzenleyebilir/);assert.equal(checkbox.checked,false);await act(async()=>checkbox.click());
    await act(async()=>button(dialog,"Yetkiyi kaydet").click());assert.equal((saved as {canEditPrice:boolean}).canEditPrice,true);
  },"draft",async(api)=>{const bootstrap=await api.bootstrap();api.bootstrap=async()=>({...bootstrap,permissions:{...bootstrap.permissions,canManageStaff:true}});const grant={membershipId:ID,label:"Çalışan",role:"cashier" as const,enabled:true,locationIds:[LOCATION],discountLimitBps:1000,canEditPrice:false,version:1};api.listStaff=async()=>[grant];api.setStaffGrant=async(_id,input)=>{saved=input;return {...grant,...input,version:2};};});
});
test("cash pending confirmation and unpaid recovery name cash collection",async()=>{
  await mounted(async(container)=>{
    assert.ok(button(container,"Nakit ödemeyi aldım — Satışı tamamla"),"cash confirmation identifies its collection method");assert.match(container.textContent??"",/Önce nakit tahsilatını kontrol et/);
    await act(async()=>button(container,"Ödeme alınmadı — Sepete dön").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;assert.match(dialog.textContent??"",/Nakit tahsil edilmediyse/);assert.equal(dialog.textContent?.includes("POS cihazından"),false);
  },"payment_pending",async(api)=>{const bootstrap=await api.bootstrap(),sale=await api.getSale(ID);api.bootstrap=async()=>({...bootstrap,activeDraft:{...sale,paymentMethod:"cash"}});});
});
