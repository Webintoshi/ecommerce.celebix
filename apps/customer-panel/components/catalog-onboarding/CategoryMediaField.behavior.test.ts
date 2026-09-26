import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { parseStorefrontAsset } from "@celebix/saas-contracts";
import * as categoryImage from "../../lib/catalog-onboarding-ui/category-image.ts";

type ComponentProps = Record<string, unknown>;
async function withMedia(fetcher: typeof fetch, verify: (root: HTMLElement, browser: Window, rerender: (props: ComponentProps) => Promise<void>, events: { uploaded: unknown[]; selected: unknown[]; busy: boolean[]; pending: boolean[] }) => Promise<void>) {
  const browser = new Window({ url: "http://localhost:3400/__category-qa" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const urls = browser.URL as unknown as typeof URL;
  urls.createObjectURL = () => "blob:category-test";urls.revokeObjectURL = () => {};
  class Image {
    naturalWidth = 12;naturalHeight = 16;onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  Object.defineProperty(browser, "Image", { value: Image });
  Object.defineProperty(browser.HTMLCanvasElement.prototype, "getContext", { value: () => ({ drawImage() {} }) });
  Object.defineProperty(browser.HTMLCanvasElement.prototype, "toBlob", { value: (callback: (blob: Blob) => void) => callback(new browser.Blob([new Uint8Array([1,2,3])], { type: "image/webp" }) as unknown as Blob) });
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, Event: browser.Event, MouseEvent: browser.MouseEvent, FormData: browser.FormData, File: browser.File, URL: urls, fetch: fetcher, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{ configurable:true,writable:true,value });
  }
  const source=await readFile(new URL("./CategoryMediaField.tsx",import.meta.url),"utf8");
  const compiled={ exports:{} as Record<string,unknown> };
  Function("require","module","exports",ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)((name:string)=>{
    if(name==="react")return React;if(name==="react/jsx-runtime")return jsxRuntime;
    if(name==="lucide-react")return new Proxy({},{get:()=>()=>createElement("svg",{"aria-hidden":true})});
    if(name==="@celebix/saas-contracts")return {parseStorefrontAsset};
    if(name==="@/lib/catalog-onboarding-ui/category-image")return categoryImage;
    if(name.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_target,key)=>String(key)})};
    throw new Error(`unexpected_import:${name}`);
  },compiled,compiled.exports);
  const Component=compiled.exports.CategoryMediaField as React.ComponentType<ComponentProps>;
  const container=browser.document.createElement("div");browser.document.body.append(container);
  const {createRoot}=await import("react-dom/client");const root=createRoot(container as unknown as HTMLElement);
  const events={uploaded:[] as unknown[],selected:[] as unknown[],busy:[] as boolean[],pending:[] as boolean[]};
  let props:ComponentProps={assets:[],altText:"Pantolon",onAssetUploaded:(value:unknown)=>events.uploaded.push(value),onChange:(value:unknown)=>events.selected.push(value),onBusyChange:(value:boolean)=>events.busy.push(value),onPendingChange:(value:boolean)=>events.pending.push(value)};
  try {
    await act(async()=>root.render(createElement(Component,props)));
    await verify(container as unknown as HTMLElement,browser,async(next)=>{props={...props,...next};await act(async()=>root.render(createElement(Component,props)));},events);
  } finally {
    await act(async()=>root.unmount());for(const [key,descriptor]of globals)descriptor?Object.defineProperty(globalThis,key,descriptor):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();
  }
}

test("category media retry reuses exact upload proof while preserving updated category alt text", async()=>{
  const requests:RequestInit[]=[];
  const fetcher=async(_input:unknown,init?:RequestInit)=>{
    requests.push(init!);
    if(requests.length===1)return {ok:false,status:503} as Response;
    const operationId=(init!.headers as Record<string,string>)["idempotency-key"]!;
    return {ok:true,status:201,json:async()=>({asset:{id:operationId,storeId:"10000000-0000-4000-8000-000000000001",kind:"category",objectKey:`stores/10000000-0000-4000-8000-000000000001/storefront/category/${operationId}.webp`,publicUrl:`https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/category/${operationId}.webp`,mediaType:"image/webp",altText:"Pantolon",width:12,height:16,byteSize:3,status:"active",createdAt:"2026-09-26T00:00:00.000Z",updatedAt:"2026-09-26T00:00:00.000Z",version:1}})} as Response;
  };
  await withMedia(fetcher as typeof fetch,async(container,browser,rerender,events)=>{
    const input=container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input,"files",{configurable:true,value:[new browser.File([new Uint8Array([1,2,3])],"pantolon.png",{type:"image/png"})]});
    await act(async()=>input.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event));
    assert.match(container.textContent!,/Seçiminiz korundu/);assert.equal(events.selected.length,0);assert.equal(events.pending.at(-1),true);
    await rerender({altText:"Yeni alt metin"});
    const retry=[...container.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Tekrar dene")!;
    await act(async()=>retry.click());
    assert.equal(requests.length,2);assert.deepEqual(requests[0]!.headers,requests[1]!.headers);
    assert.equal((requests[0]!.body as FormData).get("altText"),(requests[1]!.body as FormData).get("altText"));
    assert.equal(events.uploaded.length,1);assert.deepEqual(events.selected[0],{assetId:(requests[1]!.headers as Record<string,string>)["idempotency-key"],altText:"Yeni alt metin"});
    assert.deepEqual(events.busy,[true,false,true,false]);assert.equal(events.pending.at(-1),false);
  });
});
test("category media rejects unsupported file without an HTTP request",async()=>{
  let requests=0;
  await withMedia((async()=>{requests++;throw new Error("unexpected request");}) as typeof fetch,async(container,browser)=>{
    const input=container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input,"files",{value:[new browser.File(["<svg/>"],"category.svg",{type:"image/svg+xml"})]});
    await act(async()=>input.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event));
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "",/JPG, PNG veya WebP/);assert.equal(requests,0);
  });
});
