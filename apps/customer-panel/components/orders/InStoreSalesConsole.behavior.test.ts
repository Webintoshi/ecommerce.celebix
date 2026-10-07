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
import { InStoreSalesUiError, type InStoreSalesUiClient } from "../../lib/in-store-sales-ui/client.ts";
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
  const thumbnailSource=await readFile(new URL("../shared/ProductThumbnail.tsx",import.meta.url),"utf8");
  const thumbnailOutput=ts.transpileModule(thumbnailSource,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const thumbnail:{exports:Record<string,unknown>}={exports:{}};
  Function("require","module","exports",thumbnailOutput)((name:string)=>{
    if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;
    if(name==="lucide-react")return new Proxy({},{get:()=>()=>createElement("svg",{"aria-hidden":true})});
    if(name.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};
    throw new Error(`unexpected_import:${name}`);
  },thumbnail,thumbnail.exports);
  const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const compiled:{exports:Record<string,unknown>}={exports:{}};
  Function("require","module","exports",output)((name:string)=>{
    if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;
    if(name==="lucide-react")return new Proxy({},{get:()=>()=>createElement("svg",{"aria-hidden":true})});
    if(name==="@/components/panel/PanelPageShell")return {PanelPageShell:({children}:{children:React.ReactNode})=>createElement("section",null,children),PanelPageHeader:()=>null,PanelStatusBadge:({children}:{children:React.ReactNode})=>createElement("span",null,children)};
    if(name==="@/components/shared/ProductThumbnail")return thumbnail.exports;if(name==="@/components/accounting/CustomerCollectionForm")return{CustomerCollectionForm:({orderId}:{orderId:string})=>createElement("div",{"data-collection-order":orderId})};
    if(name==="@/lib/in-store-sales-ui/client")return {inStoreSalesUi:api,InStoreSalesUiError};
    if(name==="@/lib/in-store-sales-ui/model")return model;
    if(name==="./in-store-sales.module.css")return {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};
    throw new Error(`unexpected_import:${name}`);
  },compiled,compiled.exports);
  const Component=compiled.exports.InStoreSalesConsole as React.ComponentType;
  const container=browser.document.createElement("main");browser.document.body.append(container);const root=createRoot(container as unknown as HTMLElement);
  try{await act(async()=>{root.render(createElement(Component));await new Promise(r=>setTimeout(r,20));});await act(async()=>{await new Promise(r=>setTimeout(r,20));});await verify(container as unknown as HTMLElement,browser);}
  finally{await act(async()=>root.unmount());for(const[key,descriptor]of globals)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
const button=(container:HTMLElement,label:string)=>Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(x=>(x.textContent?.trim()===label||x.getAttribute("aria-label")===label))!;

test("an unpaid cart can be abandoned through one confirmation and starts a clean sale",async()=>{
  let discarded=0;
  await mounted(async(container)=>{
    const abandon=button(container,"Satıştan vazgeç");assert.ok(abandon);
    await act(async()=>abandon.click());
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    assert.equal(dialog.open,true);
    await act(async()=>button(dialog,"Satışta kal").click());
    assert.equal(discarded,0);assert.ok(container.querySelector(".cartRow"));
    await act(async()=>button(container,"Satıştan vazgeç").click());
    await act(async()=>button(dialog,"Vazgeç ve yeni satış aç").click());
    assert.equal(discarded,1);assert.equal(dialog.open,false);
    assert.equal(Boolean(container.querySelector(".cartRow")),false);
    assert.equal(container.querySelector(".customerInfo strong")?.textContent,"Müşteri ve satış notu");
    assert.equal(container.querySelector(".customerInfo small")?.textContent,"İsteğe bağlı");
    assert.equal(Boolean(container.querySelector(".saleId")),false);
    assert.equal(button(container,"Ödemeye geç").disabled,true);
  },"draft",async(api)=>{
    const initial=await api.getSale(ID),base=await api.bootstrap();
    api.discardSale=async(_id,input)=>{assert.equal(input.confirmUnpaid,true);discarded++;return{sale:{...initial,status:"cancelled",version:initial.version+1},replayed:false,priceChanged:false};};
    api.bootstrap=async()=>({...base,activeDraft:discarded?null:initial});
  });
});

test("a collected sale never offers the abandon-cart command",async()=>{
  await mounted(async(container)=>{assert.equal(button(container,"Satıştan vazgeç"),undefined);},"payment_received");
});

test("a cart product whose photo fails keeps its thumbnail frame and shows the package fallback",async()=>{
  await mounted(async(container,browser)=>{
    const thumbnail=container.querySelector<HTMLElement>(".cartRow .thumbnail")!;
    const image=thumbnail.querySelector("img")!;
    assert.equal(image.getAttribute("src"),"https://media.example.test/product.webp");
    await act(async()=>image.dispatchEvent(new browser.Event("error") as unknown as Event));
    assert.equal(thumbnail.querySelector("img")===null,true,"broken photos should not show a browser image error");
    assert.ok(thumbnail.querySelector("svg"),"the existing package fallback stays available");
    assert.equal(thumbnail.textContent,"","the product name is already spoken from its adjacent text");
    assert.equal(container.querySelector(".cartRow .identity strong")?.textContent,"Ürün");
  },"draft",async(api)=>{
    const bootstrap=await api.bootstrap();
    api.bootstrap=async()=>({...bootstrap,activeDraft:{...bootstrap.activeDraft!,items:bootstrap.activeDraft!.items.map(item=>({...item,imageUrl:"https://media.example.test/product.webp"}))}});
  });
});

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

test("V3 customer search selects CRM contact without losing the cart and zero collection freezes terms",async()=>{
 await mounted(async(container,browser)=>{await act(async()=>button(container,"Müşteri / not ekle").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;assert.ok(dialog.querySelector('input[name="customerSearch"]'),"customer lookup is in the existing dialog");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="customerSearch"]')!,"Ayşe");await act(async()=>{await new Promise(r=>setTimeout(r,230));});assert.ok(button(dialog,"Ayşe Kaya+905550001122"));await act(async()=>button(dialog,"Ayşe Kaya+905550001122").click());assert.equal(container.querySelector(".quantity span")?.textContent,"1");await act(async()=>button(dialog,"Kaydet").click());await act(async()=>button(container,"Veresiye").click());assert.equal(button(container,"Ödemeye geç").disabled,false);await act(async()=>button(container,"Ödemeye geç").click());assert.ok(button(container,"Veresiye satışı tamamla"));assert.match(container.textContent??"",/Kalan borç/);assert.equal(container.querySelector<HTMLInputElement>('input[name="initialCollection"]')?.disabled,true);},"draft",async(api)=>{(api as {contractVersion:number}).contractVersion=3;const contact={id:LOCATION,name:"Ayşe Kaya",firstName:"Ayşe",lastName:"Kaya",phone:"+905550001122",email:null,archived:false};const base=await api.bootstrap();api.bootstrap=async()=>({...base,permissions:{...base.permissions,canSellOnCredit:true,canCollectReceivables:false,creditSalesAvailable:true}});api.searchCustomers=async()=>[contact];const update=api.updateSale;api.updateSale=async(id,input,key)=>{const value=await update(id,input,key);return{...value,sale:{...value.sale,contractVersion:3,customerId:input.intent.customerId,customer:input.intent.customerId?contact:null,initialCollectionCents:input.intent.initialCollectionCents??value.sale.totals.totalCents,dueDate:input.intent.dueDate??null,finance:null}};};let prepared:InStoreSale;api.prepareSale=async()=>{const state=await api.bootstrap();void state;const sale=await api.getSale(ID);prepared={...sale,contractVersion:3,status:"payment_pending",customerId:LOCATION,customer:contact,initialCollectionCents:0,dueDate:null,finance:null};return{sale:prepared,replayed:false,priceChanged:false};};});
});
test("removing the selected customer returns collection to full while retaining a customer preserves partial choice",async()=>{
  await mounted(async(container)=>{
    await act(async()=>button(container,"Kısmi").click());
    await act(async()=>button(container,"Müşteri / not ekle").click());
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    await act(async()=>button(dialog,"Kaydet").click());
    assert.equal(button(container,"Kısmi").getAttribute("aria-pressed"),"true","saving a retained customer keeps the partial choice");
    assert.equal(container.querySelector<HTMLInputElement>('input[name="initialCollection"]')?.value,"1000");
    await act(async()=>button(container,"Veresiye").click());
    assert.equal(button(container,"Veresiye").getAttribute("aria-pressed"),"true");
    await act(async()=>button(container,"Müşteri / not ekle").click());
    await act(async()=>button(dialog,"Seçimi kaldır").click());
    await act(async()=>button(dialog,"Kaydet").click());
    assert.equal(button(container,"Tamamı").getAttribute("aria-pressed"),"true");
    assert.equal(button(container,"Veresiye").getAttribute("aria-pressed"),"false");
    assert.equal(container.querySelector(".totalBlock strong")?.textContent,"₺2.000,00");
    assert.equal(container.querySelector(".customerInfo strong")?.textContent,"Müşteri ve satış notu");
    assert.equal(Boolean(container.querySelector(".balanceLine")),false);
    assert.equal(container.querySelectorAll(".cartRow").length,1);
    assert.equal(container.querySelector(".quantity span")?.textContent,"1");
  },"draft",async(api)=>{
    (api as {contractVersion:number}).contractVersion=3;
    const base=await api.bootstrap(),initial=await api.getSale(ID);
    const contact={id:LOCATION,name:"Ayşe Kaya",firstName:"Ayşe",lastName:"Kaya",phone:"+905550001122",email:null,archived:false};
    const sale:InStoreSale={...initial,contractVersion:3,customerId:contact.id,customer:contact,customerName:contact.name,initialCollectionCents:0,dueDate:"2026-11-02",finance:null};
    api.getSale=async()=>sale;
    api.bootstrap=async()=>({...base,activeDraft:sale,permissions:{...base.permissions,canSellOnCredit:true,creditSalesAvailable:true}});
  });
});
test("V3 customer creation keeps the form and original key when its result is uncertain",async()=>{const keys:string[]=[];await mounted(async(container,browser)=>{await act(async()=>button(container,"Müşteri / not ekle").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;assert.ok(button(dialog,"Yeni müşteri"));await act(async()=>button(dialog,"Yeni müşteri").click());await fillInput(dialog.querySelector<HTMLInputElement>('input[name="firstName"]')!,"Ayşe");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="lastName"]')!,"Kaya");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="phone"]')!,"05550001122");for(let n=0;n<2;n++)await act(async()=>dialog.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(dialog.querySelector<HTMLInputElement>('input[name="phone"]')?.value,"05550001122");assert.equal(dialog.open,true);},"draft",async(api)=>{(api as{contractVersion:number}).contractVersion=3;api.searchCustomers=async()=>[];api.createCustomer=async(_input,key)=>{keys.push(key);throw new InStoreSalesUiError("unavailable",503,true);};});});
test("V3 staff credit and collection permissions are individually editable",async()=>{let saved:unknown;await mounted(async(container)=>{await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Satış yetkileri"]')!.click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;const credit=dialog.querySelector<HTMLInputElement>('input[name="canSellOnCredit"]'),collect=dialog.querySelector<HTMLInputElement>('input[name="canCollectReceivables"]');assert.ok(credit);assert.ok(collect);assert.equal(credit.checked,false);assert.equal(collect.checked,false);await act(async()=>credit.click());await act(async()=>button(dialog,"Yetkiyi kaydet").click());assert.equal((saved as{canSellOnCredit:boolean}).canSellOnCredit,true);assert.equal((saved as{canCollectReceivables:boolean}).canCollectReceivables,false);},"draft",async(api)=>{(api as{contractVersion:number}).contractVersion=3;const bootstrap=await api.bootstrap();api.bootstrap=async()=>({...bootstrap,permissions:{...bootstrap.permissions,canManageStaff:true}});const grant={membershipId:ID,label:"Çalışan",role:"cashier",enabled:true,locationIds:[LOCATION],discountLimitBps:1000,canEditPrice:false,canSellOnCredit:false,canCollectReceivables:false,version:1};api.listStaff=async()=>[grant];api.setStaffGrant=async(_id,input)=>{saved=input;return{...grant,...input,version:2};};});});

test("granted cashier can collect a completed credit sale through the same POS dialog",async()=>{await mounted(async(container)=>{assert.ok(button(container,"Tahsilat ekle"));await act(async()=>button(container,"Tahsilat ekle").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-collection-order]')?.getAttribute('data-collection-order'),ID);assert.equal(container.querySelectorAll('dialog[open]').length,1);},"completed",async(api)=>{const base=await api.bootstrap(),sale=await api.getSale(ID);api.bootstrap=async()=>({...base,permissions:{...base.permissions,canCollectReceivables:true},activeDraft:{...sale,contractVersion:3,customerId:LOCATION,orderId:ID,finance:{status:"partial",collectedCents:50000,dueCents:150000,refundDueCents:0,version:1,receipts:[]}}});});});

test("clearing an in-flight customer search releases busy state and allows closing the popup",async()=>{await mounted(async(container)=>{await act(async()=>button(container,"Müşteri / not ekle").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!,input=dialog.querySelector<HTMLInputElement>('input[name="customerSearch"]')!;await fillInput(input,"Ayşe");await act(async()=>{await new Promise(r=>setTimeout(r,230));});assert.match(dialog.textContent??"",/Müşteriler aranıyor/);await fillInput(input,"");assert.equal(dialog.querySelector<HTMLButtonElement>('button[aria-label="Pencereyi kapat"]')!.disabled,false);await act(async()=>button(dialog,"Vazgeç").click());assert.equal(dialog.open,false);},"draft",async(api)=>{(api as{contractVersion:number}).contractVersion=3;api.searchCustomers=async()=>new Promise(()=>{});});});

test("V3 bank transfer selection describes bank collection in its payment summary",async()=>{await mounted(async(container)=>{await act(async()=>button(container,"Havale").click());await act(async()=>{await new Promise(r=>setTimeout(r,450));});assert.match(container.textContent??"",/Banka havalesi · Manuel tahsilat/);assert.match(container.textContent??"",/Banka hesabına geçen tutarı kontrol edeceksin/);},"draft",async(api)=>{(api as{contractVersion:number}).contractVersion=3;});});


test("V3 partial collection keeps the amount editable at zero and full mode clears a hidden validation error",async()=>{
  await mounted(async(container,browser)=>{
    await act(async()=>button(container,"Kart").click());
    const full=button(container,"Tamamı"),partial=button(container,"Kısmi");
    assert.equal(full.getAttribute("aria-pressed"),"true");
    await act(async()=>partial.click());
    const input=container.querySelector<HTMLInputElement>('input[name="initialCollection"]')!;
    assert.equal(partial.getAttribute("aria-pressed"),"true");
    assert.equal(input.value,"1000");
    assert.equal(input.closest("label")!.hidden,false);
    const fill=async(value:string)=>fillInput(input,value);
    await fill("0");assert.equal(input.closest("label")!.hidden,false,"zero can be edited while partial mode remains selected");
    await fill("3000");assert.equal(input.getAttribute("aria-invalid"),"true");assert.equal(button(container,"Ödemeye geç").disabled,true);
    await act(async()=>full.click());assert.equal(input.closest("label")!.hidden,true);assert.equal(input.getAttribute("aria-invalid"),"false");assert.equal(button(container,"Ödemeye geç").disabled,false);
  },"draft",async(api)=>{(api as {contractVersion:number}).contractVersion=3;const base=await api.bootstrap();api.bootstrap=async()=>({...base,permissions:{...base.permissions,canSellOnCredit:true,creditSalesAvailable:true}});});
});


test("V3 reopened partial collection remains visible and blocks prepare after the cart drops below the amount",async()=>{
  await mounted(async(container)=>{
    const input=container.querySelector<HTMLInputElement>('input[name="initialCollection"]')!;
    assert.equal(input.closest("label")!.hidden,false);
    assert.equal(button(container,"Kısmi").getAttribute("aria-pressed"),"true");
    await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Ürün birim fiyatını düzenle"]')!.click());
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!;
    await fillInput(dialog.querySelector("input")!,"1000");
    await act(async()=>button(dialog,"Uygula").click());
    assert.equal(input.closest("label")!.hidden,false);
    assert.equal(input.getAttribute("aria-invalid"),"true");
    assert.equal(button(container,"Ödemeye geç").disabled,true);
    await fillInput(input,"500");assert.equal(input.getAttribute("aria-invalid"),"false");
  },"draft",async(api)=>{(api as {contractVersion:number}).contractVersion=3;const base=await api.bootstrap();api.bootstrap=async()=>({...base,activeDraft:{...base.activeDraft!,initialCollectionCents:150000,paymentMethod:"card"},permissions:{...base.permissions,canSellOnCredit:true,creditSalesAvailable:true}});});
});


test("V3 completed summary shows current collected finance rather than the initial collection",async()=>{
  await mounted(async(container)=>{
    assert.match(container.querySelector(".receiptTotals")?.textContent??"",/₺1.500,00/);
    assert.match(container.querySelector(".totalBlock")?.textContent??"",/Tahsil edilen₺1.500,00/);
    assert.match(container.querySelector(".mobileTotal")?.textContent??"",/Tahsil edilen₺1.500,00/);
    assert.match(container.querySelector(".checkoutNote")?.textContent??"",/Yeni satış/);
  },"completed",async(api)=>{(api as{contractVersion:number}).contractVersion=3;const base=await api.bootstrap();api.bootstrap=async()=>({...base,activeDraft:{...base.activeDraft!,initialCollectionCents:0,finance:{status:"partial",collectedCents:150000,dueCents:50000,refundDueCents:0,version:2,receipts:[]}}});});
});

test("owner and administrator show their inherent rights and all active depots without a misleading grant form",async()=>{
  for(const role of ["store_owner","admin"]){
    let writes=0;
    await mounted(async(container)=>{
      await act(async()=>button(container,"Satış yetkileri").click());
      const dialog=container.querySelector<HTMLDialogElement>("dialog")!,entry=dialog.querySelector<HTMLElement>(".staffEntry")!;
      assert.equal(entry.tagName,"ARTICLE");
      assert.equal(entry.querySelector("input,form,button"),null,"inherent rights are not mutable staff grants");
      assert.match(entry.textContent??"",/Rolünden gelen yetkiler/);
      assert.match(entry.textContent??"",/Manuel satış etkin/);
      assert.match(entry.textContent??"",/Fiyat düzenleyebilir/);
      assert.match(entry.textContent??"",/Veresiye satış yapabilir/);
      assert.match(entry.textContent??"",/Müşteri borcu tahsil edebilir/);
      assert.match(entry.textContent??"",/Ana Depo/);
      assert.match(entry.textContent??"",/Mağaza/);
      assert.match(entry.textContent??"",/99,99/);
      assert.equal(writes,0);
    },"draft",async(api)=>{
      (api as{contractVersion:number}).contractVersion=3;
      const base=await api.bootstrap();api.bootstrap=async()=>({...base,locations:[{id:LOCATION,name:"Ana Depo",isDefault:true},{id:ID,name:"Mağaza",isDefault:false}],permissions:{...base.permissions,canManageStaff:true}});
      const grant={membershipId:ID,label:"Yönetici",role,enabled:false,locationIds:[],discountLimitBps:0,canEditPrice:true,canSellOnCredit:true,canCollectReceivables:true,version:0};
      api.listStaff=async()=>[grant];api.setStaffGrant=async()=>{writes++;return grant;};
    });
  }
});

test("enabled cashier needs a selected depot before saving and the corrected grant retains every V3 right",async()=>{
  let writes=0,saved:Parameters<InStoreSalesUiClient["setStaffGrant"]>[1]|undefined;
  await mounted(async(container)=>{
    await act(async()=>button(container,"Satış yetkileri").click());
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!,enabled=dialog.querySelector<HTMLInputElement>('input[name="enabled"]')!;
    await act(async()=>enabled.click());
    await act(async()=>button(dialog,"Yetkiyi kaydet").click());
    assert.equal(writes,0,"invalid enabled grant is caught before the request");
    assert.match(dialog.querySelector('[role="alert"]')?.textContent??"",/en az bir satış deposu seç/);
    assert.equal(enabled.checked,true,"the entered rights stay in the form");
    await act(async()=>dialog.querySelector<HTMLInputElement>('input[name="location"]')!.click());
    await act(async()=>dialog.querySelector<HTMLInputElement>('input[name="canSellOnCredit"]')!.click());
    await act(async()=>button(dialog,"Yetkiyi kaydet").click());
    assert.equal(writes,1);assert.deepEqual(saved?.locationIds,[LOCATION]);assert.equal(saved?.enabled,true);
    assert.equal(saved?.canEditPrice,true);assert.equal(saved?.canSellOnCredit,true);assert.equal(saved?.canCollectReceivables,false);
    assert.equal(dialog.querySelector('[role="alert"]'),null);
  },"draft",async(api)=>{
    (api as{contractVersion:number}).contractVersion=3;
    const base=await api.bootstrap();api.bootstrap=async()=>({...base,permissions:{...base.permissions,canManageStaff:true}});
    const grant={membershipId:ID,label:"Kasiyer",role:"cashier",enabled:false,locationIds:[],discountLimitBps:0,canEditPrice:true,canSellOnCredit:false,canCollectReceivables:false,version:0};
    api.listStaff=async()=>[grant];api.setStaffGrant=async(_id,input)=>{writes++;saved=input;return {...grant,...input,version:1};};
  });
});

test("returning to the selected paid sale only closes the drawer and preserves recovery while other sale switches stay blocked",async()=>{
  let payments=0,completions=0,reads=0;
  await mounted(async(container,browser)=>{
    await act(async()=>button(container,"Satışı kaydetmeyi yeniden dene").click());
    assert.equal(completions,1);assert.equal(payments,0);
    assert.equal(browser.localStorage.length,1);
    const markerKey=browser.localStorage.key(0)!,marker=browser.localStorage.getItem(markerKey);
    assert.equal(JSON.parse(marker!).kind,"complete");
    const primary=button(container,"Aynı satışın durumunu kontrol et");
    assert.ok(primary);assert.equal(primary.disabled,false);
    await act(async()=>button(container,"Bekleyen satışlar2").click());
    const dialog=container.querySelector<HTMLDialogElement>("dialog")!,current=button(dialog,"Mevcut satışa dön"),other=button(dialog,"Satışa dön");
    assert.ok(current);assert.equal(current.disabled,false);assert.equal(other.disabled,true);
    const explanation=browser.document.getElementById(other.getAttribute("aria-describedby")!);
    assert.match(explanation?.textContent??"",/Önce mevcut satışın durumunu doğrula/);
    const readsBefore=reads;
    await act(async()=>current.click());
    await act(async()=>{await new Promise(r=>setTimeout(r,10));});
    assert.equal(dialog.open,false);assert.equal(browser.document.activeElement,primary);
    assert.equal(reads,readsBefore,"returning to the current sale sends no lookup or mutation");
    assert.equal(browser.localStorage.getItem(markerKey),marker,"the pending immutable operation stays intact");
    assert.equal(completions,1);assert.equal(payments,0,"navigation never attests or collects another payment");
    assert.equal(container.querySelector<HTMLInputElement>("#in-store-scan")?.disabled,true);
  },"payment_received",async(api)=>{
    const current={...await api.getSale(ID),paymentMethod:"card" as const},other={...current,id:LOCATION,saleNumber:"Diğer satış"};
    const base=await api.bootstrap();api.bootstrap=async()=>({...base,activeDraft:current,pendingSales:[current,other]});
    api.listSales=async()=>({sales:[current,other],nextCursor:null});api.getSale=async()=>{reads++;return current;};
    api.completeSale=async()=>{completions++;throw new InStoreSalesUiError("unavailable",503,true);};
    api.confirmPayment=async()=>{payments++;throw new Error("must not collect again");};
  });
});

async function v4Api(api:MutableClient){
  (api as {contractVersion:number}).contractVersion=4;
  const base=await api.bootstrap(),old=await api.getSale(ID),contact={id:LOCATION,name:"Ayşe Kaya",firstName:"Ayşe",lastName:"Kaya",phone:"+905550001122",email:null,archived:false};
  let sale:any={...old,contractVersion:4,customer:contact,customerId:LOCATION,customerName:contact.name,initialCollectionCents:200000,dueDate:null,finance:null,salesChannel:"manual",socialPlatform:null,socialReference:null,fulfillmentMethod:"pickup",shippingAddress:null,billingAddress:null,shippingCents:0,paymentParts:[],prepareOperationId:null,abortRequested:false};
  api.bootstrap=async()=>({...base,activeDraft:sale,permissions:{...base.permissions,canSellOnCredit:true,canResolve:true,creditSalesAvailable:true,manualSalesV4Available:true}});
  api.getSale=async()=>sale;api.searchCustomers=async()=>[contact];
  api.updateSale=async(_id,input)=>{sale={...sale,...input.intent,version:sale.version+1,initialCollectionCents:(input.intent as any).paymentParts.reduce((s:number,p:any)=>s+p.amountCents,0),totals:{...sale.totals,totalCents:sale.totals.subtotalCents-sale.totals.discountCents+(input.intent as any).shippingCents}};return{sale,replayed:false,priceChanged:false};};
  api.prepareSale=async(_id,_input,key)=>{sale={...sale,status:"payment_pending",version:sale.version+1,prepareOperationId:key};return{sale,replayed:false,priceChanged:false};};
  api.confirmPayment=async(_id,input)=>{sale={...sale,paymentParts:sale.paymentParts.map((p:any)=>p.partId===input.partId?{...p,receiptId:LOCATION,receivedAt:date,actorMembershipId:LOCATION}:p),version:sale.version+1};if(sale.paymentParts.every((p:any)=>p.receivedAt))sale={...sale,status:"payment_received"};return{sale,replayed:false,priceChanged:false};};
}

test("V4 social dialog cancels locally and applies one platform plus optional reference",async()=>{await mounted(async(container)=>{assert.ok(button(container,"Satış kaynağı"));await act(async()=>button(container,"Satış kaynağı").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Instagram").click());await fillInput(dialog.querySelector<HTMLInputElement>('input[name="socialReference"]')!,"@ayse");await act(async()=>button(dialog,"Vazgeç").click());assert.match(button(container,"Satış kaynağı").textContent??"",/Sosyal medya satışı/);await act(async()=>button(container,"Satış kaynağı").click());await act(async()=>button(dialog,"Instagram").click());await fillInput(dialog.querySelector<HTMLInputElement>('input[name="socialReference"]')!,"@ayse");await act(async()=>button(dialog,"Uygula").click());assert.match(button(container,"Satış kaynağı").textContent??"",/Instagram/);},"draft",v4Api);});

test("V4 split payment confirms only the named physical receipt and keeps other parts pending",async()=>{await mounted(async(container)=>{assert.ok(button(container,"Ödeme parçaları"));await act(async()=>button(container,"Ödeme parçaları").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Parça ekle").click());await fillInput(dialog.querySelector<HTMLInputElement>('input[name="paymentAmount-0"]')!,"1200");await act(async()=>button(dialog,"Parça ekle").click());await fillInput(dialog.querySelector<HTMLInputElement>('input[name="paymentAmount-1"]')!,"800");const method=dialog.querySelector<HTMLSelectElement>('select[name="paymentMethod-1"]')!;await act(async()=>{method.value="card";method.dispatchEvent(new Event("change",{bubbles:true}));});await act(async()=>button(dialog,"Uygula").click());await act(async()=>button(container,"Ödemeye geç").click());const confirm=container.querySelectorAll<HTMLButtonElement>('[data-confirm-part]');assert.equal(confirm.length,2);await act(async()=>confirm[0].click());assert.equal(container.querySelectorAll('[data-confirm-part]').length,1);assert.match(container.textContent??"",/Tahsil edildi/);assert.ok(button(container,"Beklet ve yeni satış"));assert.equal(button(container,"Satışı tamamla")?.disabled,true);},"draft",v4Api);});

test("V4 delivery dialog keeps its fields on validation and shipping fee appears outside discount",async()=>{await mounted(async(container)=>{assert.ok(button(container,"Teslimat"));await act(async()=>button(container,"Teslimat").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Kargo").click());await act(async()=>button(dialog,"Uygula").click());assert.equal(dialog.open,true);assert.match(dialog.textContent??"",/adres/);await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-recipientName"]')!,"Ayşe Kaya");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-line1"]')!,"Örnek Sokak 1");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-city"]')!,"İstanbul");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shippingFee"]')!,"50");await act(async()=>button(dialog,"Uygula").click());assert.equal(dialog.open,false);assert.match(container.querySelector(".totals")?.textContent??"",/Kargo₺50,00/);assert.match(button(container,"Teslimat").textContent??"",/Kargo/);},"draft",v4Api);});

test("V4 zero credit replaces the plan and completes without a physical payment confirmation",async()=>{let collections=0,completed=0;await mounted(async(container)=>{await act(async()=>button(container,"Ödeme parçaları").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Veresiye").click());assert.match(dialog.textContent??"",/Kalan borç₺2.000,00/);await act(async()=>button(dialog,"Uygula").click());await act(async()=>button(container,"Ödemeye geç").click());assert.equal(container.querySelectorAll('[data-confirm-part]').length,0);assert.equal(button(container,"Veresiye satışı tamamla")?.disabled??button(container,"Satışı tamamla").disabled,false);await act(async()=>button(container,"Veresiye satışı tamamla").click());assert.equal(collections,0);assert.equal(completed,1);},"draft",async(api)=>{await v4Api(api);api.confirmPayment=async()=>{collections++;throw new Error("Zero credit must not receive funds");};api.completeSale=async()=>{completed++;const sale=await api.getSale(ID);return{sale:{...sale,status:"completed",orderId:ID,completedAt:date},replayed:false,priceChanged:false};};});});

test("a delayed native close event cannot dismiss the next open sales dialog",async()=>{await mounted(async(container,browser)=>{await act(async()=>button(container,"Satış kaynağı").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Vazgeç").click());await act(async()=>button(container,"Teslimat").click());assert.equal(dialog.open,true);await act(async()=>dialog.dispatchEvent(new browser.Event("close") as unknown as Event));assert.equal(dialog.open,true,"a queued close from the prior popup does not dismiss the reopened delivery popup");assert.match(dialog.textContent??"",/Teslimat/);},"draft",v4Api);});

test("delivery fields enforce the native address limits and retain oversized pasted input for correction",async()=>{await mounted(async(container,browser)=>{await act(async()=>button(container,"Teslimat").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;await act(async()=>button(dialog,"Kargo").click());for(const [field,max] of [["line1",300],["line2",300],["city",200],["district",200]] as const)assert.equal(dialog.querySelector<HTMLInputElement>(`input[name="shipping-${field}"]`)!.maxLength,max);await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-recipientName"]')!,"Ayşe Kaya");await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-line1"]')!,"A".repeat(301));await fillInput(dialog.querySelector<HTMLInputElement>('input[name="shipping-city"]')!,"İstanbul");await act(async()=>dialog.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));assert.equal(dialog.open,true);assert.match(dialog.textContent??"",/uzun|sınır/);},"draft",v4Api);});

test("a manager must attest the actual return before clearing an obsolete receipt fence",async()=>{let reconciled=0;await mounted(async(container)=>{const confirm=container.querySelector<HTMLButtonElement>('[data-confirm-part]')!;await act(async()=>confirm.click());assert.ok(button(container,"Fiziksel iadeyi doğrula"));await act(async()=>button(container,"Fiziksel iadeyi doğrula").click());const dialog=container.querySelector<HTMLDialogElement>("dialog")!;assert.equal(button(dialog,"Fiziksel iadeyi doğrula").disabled,true);assert.match(dialog.textContent??"",/₺400,00/);await act(async()=>dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button(dialog,"Fiziksel iadeyi doğrula").click());assert.equal(reconciled,1);assert.equal(dialog.open,false);assert.ok(button(container,"Beklet ve yeni satış"));},"payment_pending",async(api)=>{await v4Api(api);const bootstrap=await api.bootstrap(),base=await api.getSale(ID),partId="9e000000-0000-4000-8000-000000000020",prepare="9e000000-0000-4000-8000-000000000021";let current:any={...base,status:"payment_pending",prepareOperationId:prepare,paymentParts:[{partId,paymentMethod:"card",amountCents:40000,receiptId:null,receivedAt:null,actorMembershipId:null,refundEventId:null,returnedAt:null}]};api.bootstrap=async()=>({...bootstrap,activeDraft:current});api.getSale=async()=>current;api.confirmPayment=async()=>{current={...current,version:2,paymentParts:[{...current.paymentParts[0],partId:LOCATION,paymentMethod:"cash",amountCents:20000}]};throw new InStoreSalesUiError("version_conflict",409);};api.reconcileObsoletePayment=async()=>{reconciled++;return{sale:current,replayed:false,priceChanged:false};};});});
