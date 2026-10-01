import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import {act,createElement} from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {Window} from "happy-dom";
import ts from "typescript";
import {ProductVariantMediaApiError} from "../../lib/catalog-ui/variant-media-client.ts";

async function compile(file:string,imports:Record<string,unknown>){
 const source=await readFile(new URL(file,import.meta.url),"utf8");const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const compiled={exports:{} as Record<string,unknown>};Function("require","module","exports",output)((name:string)=>{if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;if(name.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_t,key)=>String(key)})};if(Object.hasOwn(imports,name))return imports[name];throw new Error(`unexpected_import:${name}`);},compiled,compiled.exports);return compiled.exports;
}

test("existing gallery uses ordered assignment thumbnail and keeps local order through conflict reload with a fresh version key",async()=>{
 const browser=new Window({url:"https://panel.test/products/one"});const globals=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLButtonElement:browser.HTMLButtonElement,IS_REACT_ACT_ENVIRONMENT:true})){globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const calls:any[]=[];let reads=0;const api={list:async()=>({productId:"product",version:++reads===1?7:8,assignments:[{variantId:"red",mediaIds:["second"]}]}),save:async(_id:string,input:any)=>{calls.push(input);if(calls.length===1)throw new ProductVariantMediaApiError("version_conflict",409);return {gallery:{productId:"product",version:9,assignments:input.assignments},replayed:false};}};
 const dialog=await compile("./VariantGalleryDialog.tsx",{});const editor=await compile("./ProductVariantGalleryEditor.tsx",{"./VariantGalleryDialog":dialog,"@/lib/catalog-ui/variant-media-client":{productVariantMediaApi:api,ProductVariantMediaApiError}});
 const {createRoot}=await import("react-dom/client");const container=browser.document.createElement("div") as unknown as HTMLElement;browser.document.body.append(container as never);const root=createRoot(container as unknown as Parameters<typeof createRoot>[0]);
 const click=async(label:string)=>{const button=container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)??[...container.querySelectorAll("button")].find(item=>item.textContent===label);assert.ok(button,label);await act(async()=>button.click());};
 try{
  await act(async()=>root.render(createElement(editor.ProductVariantGalleryEditor as React.ComponentType<any>,{productId:"product",media:[{id:"first",url:"https://images.test/first.png",altText:"Bir"},{id:"second",url:"https://images.test/second.png",altText:"İki"}],variants:[{id:"red",title:"Kırmızı",attributes:{renk:"Kırmızı"}}],children:({thumbnail}:any)=>createElement("div",{},thumbnail("red"),createElement("input",{"aria-label":"Bağımsız varyant fiyatı",defaultValue:"149,90"}))})));
  assert.equal(container.querySelector('button img')?.getAttribute("src"),"https://images.test/second.png");
  const trigger=container.querySelector<HTMLButtonElement>('button[aria-label="Kırmızı görsellerini seç"]')!;trigger.focus();
  await click("Kırmızı görsellerini seç");await click("Bir görselini seç");await click("2. görseli öne taşı");await click("Uygula");
  assert.match(container.querySelector('[role="alert"]')?.textContent??"",/Seçiminiz korunuyor/);assert.equal(calls[0].expectedVersion,7);
  await click("Güncel sürümü yükle");assert.equal(container.querySelector('[data-cover="true"] img')?.getAttribute("src"),"https://images.test/first.png");
  await click("Uygula");assert.equal(container.querySelector('[role="dialog"]'),null);assert.equal(calls[1].expectedVersion,8);assert.notEqual(calls[0].operationId,calls[1].operationId);assert.deepEqual(calls[0].assignments,calls[1].assignments);assert.equal(browser.document.activeElement,trigger);
  assert.equal(container.querySelector<HTMLInputElement>('input[aria-label="Bağımsız varyant fiyatı"]')?.value,"149,90");
 }finally{await act(async()=>root.unmount());for(const[key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
});
