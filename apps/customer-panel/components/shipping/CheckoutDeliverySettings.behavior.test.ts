import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { createCheckoutDeliveryClient } from "../../lib/checkout-delivery-ui/client.ts";
import { createMerchantAdminApi } from "../../lib/merchant-admin-ui/client.ts";
import * as model from "../../lib/checkout-delivery-ui/model.ts";
import * as presentation from "../../lib/checkout-delivery-ui/presentation.ts";
import type { MerchantAdminRecord } from "@celebix/saas-contracts";
const ID="71000000-0000-4000-8000-000000000001",DATE="2026-09-27T00:00:00.000Z";
const record:MerchantAdminRecord={id:ID,kind:"shipping_setting",name:"Teslimat",config:{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:1000,estimatedDays:2},status:"active",version:7,createdAt:DATE,updatedAt:DATE};
type Options={canRead?:boolean;canManage?:boolean;empty?:boolean;failure?:409|503};
async function mounted(options:Options,verify:(element:HTMLElement,browser:Window,writes:{body:Record<string,unknown>;key:string|null}[])=>Promise<void>){
 let saved:MerchantAdminRecord|null=options.empty?null:structuredClone(record),failure=options.failure;
 const writes:{body:Record<string,unknown>;key:string|null}[]=[];
 const api=createCheckoutDeliveryClient(createMerchantAdminApi(async(_path,init)=>{
  if(init?.method!=="POST")return Response.json({items:saved?[saved]:[]});
  const body=JSON.parse(String(init.body));writes.push({body,key:new Headers(init.headers).get("idempotency-key")});
  if(failure){const status=failure;failure=undefined;return Response.json({code:status===409?"version_conflict":"unavailable"},{status});}
  saved={...(saved??record),name:body.name,config:body.config,status:body.status,version:(saved?.version??0)+1};
  return Response.json({id:ID,kind:"shipping_setting",status:saved.status,version:saved.version,updatedAt:DATE,replayed:false});
 }));
 const browser=new Window({url:"https://panel.example.test/settings/shipping"});const globals=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Event:browser.Event,MouseEvent:browser.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const source=await readFile(new URL("./CheckoutDeliverySettings.tsx",import.meta.url),"utf8");const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const compiled:{exports:Record<string,unknown>}={exports:{}};
 Function("require","module","exports",output)((name:string)=>{if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;if(name==="@/lib/checkout-delivery-ui/client")return{checkoutDeliveryApi:api};if(name==="@/lib/checkout-delivery-ui/model")return model;if(name==="@/lib/checkout-delivery-ui/presentation")return presentation;if(name==="../checkout-delivery-ui/client")return{checkoutDeliveryApi:api};if(name==="./checkout-delivery-settings.module.css")return{__esModule:true,default:new Proxy({},{get:(_t,k)=>String(k)})};throw new Error(`unexpected_import:${name}`);},compiled,compiled.exports);
 const Component=compiled.exports.CheckoutDeliverySettings as React.ComponentType<{canRead:boolean;canManage:boolean}>;const element=browser.document.createElement("main");browser.document.body.append(element);const root=createRoot(element as unknown as HTMLElement);
 try{await act(async()=>{root.render(createElement(Component,{canRead:options.canRead??true,canManage:options.canManage??true}));});await act(async()=>{await new Promise(r=>setTimeout(r,10));});await verify(element as unknown as HTMLElement,browser,writes);}
 finally{await act(async()=>root.unmount());for(const[key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
async function input(element:HTMLElement,browser:Window,name:string,value:string){const field=element.querySelector<HTMLInputElement>(`input[name="${name}"]`);assert.ok(field);await act(async()=>{const setter=Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!;setter.call(field,value);field.dispatchEvent(new browser.Event("input",{bubbles:true}) as unknown as Event);});}
const button=(element:HTMLElement,label:string)=>Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(x=>x.textContent?.trim()===label)!;
test("editor submits exact Turkish cents and preserves legacy config and version",async()=>{await mounted({},async(element,browser,writes)=>{
 await input(element,browser,"price","14,89");await input(element,browser,"days","365");await act(async()=>button(element,"Kaydet ve etkinleştir").click());
 assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{recordId:ID,expectedVersion:7,name:"Teslimat",config:{regions:"Türkiye",freeShippingThresholdCents:50000,shippingPriceCents:1489,estimatedDays:365},status:"active"});assert.match(element.textContent??"",/14,89 TL/);assert.match(element.textContent??"",/Etkin/);
});});
test("empty fee is rejected and explicit zero can be saved as an inactive draft",async()=>{await mounted({empty:true},async(element,browser,writes)=>{
 await act(async()=>button(element,"Teslimatı etkinleştir").click());assert.equal(writes.length,0);assert.ok(element.querySelector('[role="alert"]'));
 await input(element,browser,"price","0");await act(async()=>button(element,"Taslağı kaydet").click());assert.equal(writes[0].body.status,"draft");assert.deepEqual(writes[0].body.config,{shippingPriceCents:0});assert.match(element.textContent??"",/Ücretsiz teslimat/);assert.match(element.textContent??"",/Taslak/);
});});
test("read-only permissions prevent even a programmatically submitted mutation",async()=>{await mounted({canManage:false},async(element,browser,writes)=>{
 const field=element.querySelector<HTMLInputElement>('input[name="price"]');assert.ok(field?.disabled);await act(async()=>element.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}) as unknown as Event));assert.equal(writes.length,0);
});await mounted({canRead:false},async(element,_browser,writes)=>{assert.equal(element.querySelector("form"),null);assert.match(element.textContent??"",/yetkiniz yok/);assert.equal(writes.length,0);});});
test("stale version keeps entered values until the merchant explicitly reloads",async()=>{await mounted({failure:409},async(element,browser,writes)=>{
 await input(element,browser,"price","14,89");await act(async()=>button(element,"Kaydet ve etkinleştir").click());assert.equal(writes.length,1);assert.equal(element.querySelector<HTMLInputElement>('input[name="price"]')?.value,"14,89");assert.match(element.textContent??"",/güncellendi/);assert.ok(button(element,"Güncel ayarı yükle"));
});});
test("uncertain save retries the same payload and operation without allowing input changes",async()=>{await mounted({failure:503},async(element,browser,writes)=>{
 await input(element,browser,"price","14,89");await act(async()=>button(element,"Kaydet ve etkinleştir").click());assert.equal(element.querySelector<HTMLInputElement>('input[name="price"]')?.disabled,true);await act(async()=>button(element,"Yeniden dene").click());assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.match(element.textContent??"",/14,89 TL/);
});});
