import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

async function dialog(verify: (container: HTMLElement, browser: Window, calls: readonly unknown[]) => Promise<void>, fail = false) {
  const browser = new Window({url: "https://panel.test/products/one"});
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLButtonElement:browser.HTMLButtonElement,Event:browser.Event,IS_REACT_ACT_ENVIRONMENT:true})) {
    globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key)); Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const source = await readFile(new URL("./VariantGalleryDialog.tsx",import.meta.url),"utf8");
  const output = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const compiled = {exports:{} as Record<string,unknown>};
  Function("require","module","exports",output)((name:string)=> {
    if (name==="react") return React;
    if (name==="react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".module.css")) return {__esModule:true,default:new Proxy({},{get:(_t,key)=>String(key)})};
    throw new Error(`unexpected_import:${name}`);
  },compiled,compiled.exports);
  const calls: unknown[]=[];
  const {createRoot}=await import("react-dom/client");
  const container=browser.document.createElement("div"); browser.document.body.append(container);
  const root=createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async()=>root.render(createElement(compiled.exports.VariantGalleryDialog as React.ComponentType<any>,{
      variant:{id:"red-small",title:"Kırmızı S",attributes:{renk:"Kırmızı",beden:"S"}},
      variants:[{id:"red-small",title:"Kırmızı S",attributes:{renk:"Kırmızı",beden:"S"}},{id:"red-large",title:"Başka isim",attributes:{renk:"Kırmızı",beden:"L"}},{id:"blue-red-title",title:"Kırmızı XL",attributes:{renk:"Mavi",beden:"XL"}}],
      media:[{id:"one",url:"https://images.test/one.png",altText:"Bir"},{id:"two",url:"https://images.test/two.png",altText:"İki"}],selectedIds:["one"],
      onClose:()=>calls.push("cancel"),onApply:async(assignments:unknown,operationId:string)=>{calls.push({assignments,operationId});if(fail&&calls.filter(x=>typeof x==="object").length===1)throw new Error("Bağlantı kesildi. Tekrar deneyin.");},
    })));
    await verify(container as unknown as HTMLElement,browser,calls);
  } finally {await act(async()=>root.unmount());for(const[key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}
async function click(container:HTMLElement,label:string) {const button=container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)??[...container.querySelectorAll("button")].find(b=>b.textContent===label);assert.ok(button,label);await act(async()=>button.click());}

test("modal orders selected images, declares cover, and applies only explicitly checked matching attribute targets",async()=>dialog(async(container,browser,calls)=>{
  assert.equal(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal"),"true");
  await click(container,"İki görselini seç");
  await click(container,"2. görseli öne taşı");
  assert.equal(container.querySelector('[data-cover="true"] img')?.getAttribute("src"),"https://images.test/two.png");
  const attr=container.querySelector<HTMLSelectElement>('select[aria-label="Ortak nitelik"]')!;
  await act(async()=>{attr.value="renk";attr.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event);});
  assert.equal(container.querySelector('input[value="blue-red-title"]'),null,"titles must never supply batch membership");
  const target=container.querySelector<HTMLInputElement>('input[value="red-large"]')!;
  assert.equal(target.checked,false,"batch targets require explicit consent");
  await act(async()=>target.click());
  await click(container,"Uygula");
  assert.deepEqual((calls[0]as any).assignments,[{variantId:"red-small",mediaIds:["two","one"]},{variantId:"red-large",mediaIds:["two","one"]}]);
}));

test("failed apply keeps order and reuses its operation key on retry; changing selection creates a new key",async()=>dialog(async(container,_browser,calls)=>{
  await click(container,"İki görselini seç");await click(container,"Uygula");
  assert.match(container.querySelector('[role="alert"]')?.textContent??"",/Bağlantı kesildi/);
  assert.equal(container.querySelectorAll('[data-selected="true"]').length,2);
  await click(container,"Uygula");
  assert.equal((calls[0]as any).operationId,(calls[1]as any).operationId);
  await click(container,"Ürün görsellerini kullan");await click(container,"Uygula");
  assert.notEqual((calls[1]as any).operationId,(calls[2]as any).operationId);
  assert.deepEqual((calls[2]as any).assignments,[{variantId:"red-small",mediaIds:[]}]);
},true));

test("cancel does not save and Escape closes while focus stays inside the modal",async()=>dialog(async(container,browser,calls)=>{
  const modal=container.querySelector<HTMLElement>('[role="dialog"]')!;
  assert.ok(modal.contains(browser.document.activeElement as unknown as Node));
  const buttons=[...modal.querySelectorAll<HTMLButtonElement>('button')];buttons.at(-1)!.focus();
  await act(async()=>buttons.at(-1)!.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}) as unknown as Event));
  assert.equal(browser.document.activeElement,modal.querySelector("button"));
  await click(container,"Vazgeç");assert.deepEqual(calls,["cancel"]);
  await act(async()=>modal.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}) as unknown as Event));
  assert.deepEqual(calls,["cancel","cancel"]);
}));
