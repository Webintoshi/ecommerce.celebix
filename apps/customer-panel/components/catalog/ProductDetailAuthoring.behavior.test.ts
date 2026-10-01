import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement, useState } from "react";
import * as jsx from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as forms from "../../lib/catalog-ui/forms.ts";
import * as measurements from "../../lib/catalog-ui/product-measurements.ts";
import * as money from "../../lib/catalog-ui/money.ts";
import * as writingPreferences from "../../lib/content-authoring-ui/store-writing-preferences.ts";
import * as authoringState from "../../lib/content-authoring-ui/state.ts";
import * as attributeChoices from "../../lib/catalog-onboarding-ui/attribute-variants.ts";
import * as authoringClient from "../../lib/content-authoring-ui/client.ts";
import * as descriptionRenderer from "../../lib/server-content-authoring/render.ts";
import * as dirty from "../../lib/catalog-ui/dirty-navigation.ts";

const product = {id:"50000000-0000-4000-8000-000000000001",title:"Saved product",description:"Saved description",slug:"saved",currency:"TRY",status:"active",version:7,updatedAt:"2026-09-29T00:00:00Z"};
const priorOrigin = {generationId:"60000000-0000-4000-8000-000000000001",draftId:"60000000-0000-4000-8000-000000000002"};
const generatedOrigin = {generationId:"40000000-0000-4000-8000-000000000001",draftId:"40000000-0000-4000-8000-000000000002"};
class ApiError extends Error { constructor(public code:string) {super(code);} }

async function withDetail(verify:(h:{container:HTMLElement;browser:Window;requests:any[];variantRequests:any[];generationRequests:any[];authoring():any;seoDraft():any;resolveGeneration():void;fail(code:string|null):void;failReload(code:string|null):void;click(text:string):Promise<void>;save():Promise<void>})=>Promise<void>, variants:any[]=[],canArchive=false) {
 const browser=new Window({url:"https://panel.example.test/products/"+product.id}); Reflect.set(browser,"confirm",()=>true);
 const globals=new Map<string,PropertyDescriptor|undefined>();
 for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLButtonElement:browser.HTMLButtonElement,Event:browser.Event,FormData:browser.FormData,IS_REACT_ACT_ENVIRONMENT:true})) {globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 let descriptionAuthoring:any,productCapture:any;const requests:any[]=[],variantRequests:any[]=[],generationRequests:any[]=[];let resolveGeneration!:(value:any)=>void; let failure:string|null=null;let reloadFailure:string|null=null;
 const compile=async(file:string,imports:Record<string,unknown>)=>{
  const source=await readFile(new URL(file,import.meta.url),"utf8");const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{} as Record<string,any>};Function("require","module","exports",output)((name:string)=>name==="react"?React:name==="react/jsx-runtime"?jsx:name==="lucide-react"?new Proxy({},{get:()=>()=>null}):name.endsWith(".css")?{default:{}}:imports[name],module,module.exports);return module.exports;
 };
 const panel=await compile("../content-authoring/ContentAuthoringPanel.tsx",{"@/components/panel/PanelLayoutClient":{usePanelChromeModel:()=>({activeStoreSelectionKey:"fixture-store"})},"@/lib/content-authoring-ui/store-writing-preferences":writingPreferences,"@/lib/content-authoring-ui/client":authoringClient,"@/lib/content-authoring-ui/state":authoringState,"@/lib/server-content-authoring/render":descriptionRenderer});
 const measurementFields=await compile("./ProductMeasurementFields.tsx",{"@/lib/catalog-ui/product-measurements":measurements});
 const preferencesApi={records:async()=>[]};
 const generationApi={generate:(request:any)=>{generationRequests.push(request);return new Promise<any>(resolve=>{resolveGeneration=resolve;});},get:async()=>{throw Error("unexpected");}};
 const Description=({defaultValue,initialOrigin,onOriginChange,onValueChange,authoring}:any)=>{
  descriptionAuthoring=authoring;
  const [text,setText]=useState(defaultValue);const [aiOpen,setAiOpen]=useState(false);
  const bridge={capture:()=>{const capture=authoring.capture();return {request:capture.request,lifecycle:{sessionId:capture.sessionId,draftRevision:capture.draftRevision,selection:null}};},canApply:(field:string,generation:any)=>field==="description"||authoring.canApplyField(field,generation),apply:(field:string,generation:any)=>{if(field!=="description")return authoring.applyField(field,generation);setText("Generated description");onOriginChange({generationId:generation.id,draftId:generation.draftId});onValueChange("Generated description");return true;}};
  return createElement("div",{"data-description-origin":JSON.stringify(initialOrigin)},createElement("textarea",{name:"description",value:text,onChange:(e:any)=>{setText(e.currentTarget.value);onValueChange(e.currentTarget.value);}}),createElement("button",{type:"button",onClick:()=>{setText("Generated description");onOriginChange(generatedOrigin);onValueChange("Generated description");}},"Apply description fixture"),createElement("button",{type:"button",onClick:()=>setAiOpen(true)},"Open authoring preview"),aiOpen?createElement(panel.ContentAuthoringPanel,{bridge,fields:authoring.fields,api:generationApi,preferencesApi,onClose:()=>setAiOpen(false)}):null);
 };
 const Sales=({onDirtyChange,onUpdated,onAuthoringBridgeChange,captureProductAuthoringDraft}:any)=>{
  productCapture=captureProductAuthoringDraft;
  const [seoDescription,setSeoDescription]=useState("Unsaved SEO summary");
  React.useEffect(()=>{
   onAuthoringBridgeChange?.({capture:()=>({request:{currentDraft:{...captureProductAuthoringDraft().currentDraft,seoTitle:"Unsaved SEO title",seoDescription,categoryIds:[],brandId:null}},lifecycle:{draftRevision:seoDescription}}),canApply:(field:string,generation:any)=>field==="seoDescription"&&typeof generation.draft?.seoDescription==="string",apply:(field:string,generation:any)=>{if(field!=="seoDescription")return false;setSeoDescription(generation.draft.seoDescription);onDirtyChange(true);return true;}});
   return ()=>onAuthoringBridgeChange?.(null);
  },[onAuthoringBridgeChange,captureProductAuthoringDraft,seoDescription]);
  return createElement("div",null,createElement("span",{"data-seo-description":true},seoDescription),
   createElement("button",{type:"button",onClick:()=>onDirtyChange(true)},"Apply SEO fixture"),
   createElement("button",{type:"button",onClick:()=>{onDirtyChange(false);onUpdated({});}},"Save SEO fixture"));
 };
 const api={archiveVariant:async(_product:string,id:string,version:number)=>{variantRequests.push({archive:id,expectedVersion:version});return {};},updateVariant:async(_productId:string,_id:string,input:any)=>{variantRequests.push(input);return {variant:{...variants[0],...input.variant,version:4}};},getProduct:async()=>{if(reloadFailure)throw new ApiError(reloadFailure);return {product,variants};},updateProduct:async (_id:string,input:any)=>{requests.push(input);if(failure)throw new ApiError(failure);return {product:{...product,description:input.product.description,version:8}};}};
 const imports:Record<string,unknown>={
  "@/lib/catalog-admin-ui/client":{catalogAdminApi:{resources:async()=>[{id:"30000000-0000-4000-8000-000000000001",kind:"attribute",name:"Beden",slug:"beden",status:"active",config:{values:["M","S"]}}]}},
  "@/lib/catalog-onboarding-ui/attribute-variants":attributeChoices,
  "./ProductMeasurementFields":measurementFields,
  "@/components/catalog/SkuInput":{SkuInput:(props:any)=>createElement("input",{name:props.name,defaultValue:props.value})},
  "@/components/catalog/BarcodeInput":{BarcodeInput:(props:any)=>createElement("input",{name:props.name,defaultValue:props.defaultValue})},
  "next/link":({children,...props}:any)=>createElement("a",props,children),
  "@/lib/catalog-ui/client":{CatalogApiError:ApiError,catalogApi:api},
  "@/lib/catalog-ui/forms":forms,"@/lib/catalog-ui/money":money,"@/lib/catalog-ui/dirty-navigation":dirty,"@/lib/catalog-ui/product-measurements":measurements,
  "@/lib/catalog-onboarding-ui/client":{CatalogOnboardingApiError:ApiError,catalogOnboardingClient:{getOptions:async()=>({categories:[],resources:[],channels:[]}),getProductEditor:async()=>({product,variants:[],profile:{version:9,productType:"physical",minimumPurchaseQuantity:1},categoryIds:[],channelIds:[],resourceIds:{collections:[],tags:[],attributes:["30000000-0000-4000-8000-000000000001"]},contentOrigins:{description:priorOrigin}})}},
  "./ProductDescriptionField":{ProductDescriptionField:Description,ProductDescriptionPreview:()=>null},
  "./ProductVariantGalleryEditor": {ProductVariantGalleryEditor:({children}:any)=>children({thumbnail:()=>null})},
  "./ProductMediaManager":{ProductMediaManager:()=>null,restoreArchiveFocus(){}},
  "@/components/catalog-onboarding/ProductAdvancedEditor":{ProductAdvancedEditor:Sales},
  "@/components/panel/PanelTopbarChrome":{usePanelTopbarChrome(){}},
 };
 const source=await readFile(new URL("./ProductDetailConsole.tsx",import.meta.url),"utf8");
 const output=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{} as Record<string,unknown>};
 Function("require","module","exports",output)((name:string)=>name==="react"?React:name==="react/jsx-runtime"?jsx:name==="lucide-react"?new Proxy({},{get:()=>()=>null}):name.endsWith(".css")?{default:{}}:imports[name]??new Proxy({},{get:()=>()=>null}),module,module.exports);
 const {createRoot}=await import("react-dom/client"); const container=browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as never);const root=createRoot(container);
 const button=(text:string)=>{const result=[...container.querySelectorAll("button")].find(b=>b.textContent?.trim()===text);assert.ok(result,text+" available="+[...container.querySelectorAll("button")].map(b=>b.textContent).join("|"));return result;};
 try {await act(async()=>root.render(createElement(module.exports.ProductDetailConsole as React.ComponentType<any>,{productId:product.id,canManage:true,canArchive})));
 await verify({container,browser,requests,variantRequests,generationRequests,authoring:()=>descriptionAuthoring,seoDraft:()=>productCapture(),resolveGeneration:()=>{const request=generationRequests.at(-1);resolveGeneration({id:generatedOrigin.generationId,draftId:request.draftId,productId:product.id,status:"completed",draft:{description:[{type:"paragraph",children:[{type:"text",text:"Generated description"}]}],suggestions:[],claims:[],sourceFingerprint:"a".repeat(64)},sourceFingerprint:"a".repeat(64)});},fail:(code)=>{failure=code;},failReload:(code)=>{reloadFailure=code;},click:async(text)=>{await act(async()=>button(text).click());},save:async()=>{await act(async()=>button("Bilgileri kaydet").closest("form")!.dispatchEvent(new browser.SubmitEvent("submit",{bubbles:true,cancelable:true}) as unknown as Event));}});
 }finally{await act(async()=>root.unmount());for(const[key,value]of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}
}

test("normal description save preserves CAS, description-only origin, conflict text and independent SEO dirty state",async()=>withDetail(async h=>{
 assert.doesNotMatch(h.container.textContent??"",/Kaydedilmemiş ürün bilgileri/);
 await h.click("Apply description fixture");await h.click("Apply SEO fixture");assert.equal(h.requests.length,0);
 h.fail("version_conflict");await h.save();assert.equal(h.requests[0].expectedVersion,7);assert.deepEqual(h.requests[0].contentOrigins,{description:generatedOrigin});
 assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Generated description");assert.match(h.container.textContent??"",/Kaydedilmemiş ürün bilgileri/);
 await h.click("Save SEO fixture");assert.match(h.container.textContent??"",/Kaydedilmemiş ürün bilgileri/,"SEO success must not clear product dirty state");
 h.fail(null);await h.save();assert.equal(h.requests[1].expectedVersion,7);assert.deepEqual(h.requests[1].contentOrigins,{description:generatedOrigin});assert.doesNotMatch(h.container.textContent??"",/Kaydedilmemiş ürün bilgileri/);
 assert.equal(h.container.querySelector('[data-description-origin]')!.getAttribute("data-description-origin"),JSON.stringify(generatedOrigin),"successful save must remount with the saved field origin rather than stale onboarding origin");
}));

test("discarding an applied description clears its pending origin before an ordinary title save",async()=>withDetail(async h=>{
 await h.click("Apply description fixture");await h.click("Vazgeç");
 const title=h.container.querySelector<HTMLInputElement>('[name="title"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(h.browser.HTMLInputElement.prototype,"value")!.set!.call(title,"Manual title");title.dispatchEvent(new h.browser.Event("input",{bubbles:true}) as unknown as Event);});
 await h.save();assert.equal(h.requests[0].expectedVersion,7);assert.equal(h.requests[0].product.description,"Saved description");assert.equal(Object.hasOwn(h.requests[0],"contentOrigins"),false,"discarded AI must not create provenance for saved manual text");
}));


test("product save success preserves an independently dirty SEO editor",async()=>withDetail(async h=>{
 await h.click("Apply description fixture");await h.click("Apply SEO fixture");await h.save();
 assert.doesNotMatch(h.container.textContent??"",/Kaydedilmemiş ürün bilgileri/);
 const before=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(before);assert.equal(before.defaultPrevented,true,"unsaved SEO must retain navigation protection after product success");
 await h.click("Save SEO fixture");const after=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(after);assert.equal(after.defaultPrevented,false);
}));


test("failed server reload retains unsaved description origin and navigation guard; successful reload clears them",async()=>withDetail(async h=>{
 await h.click("Apply description fixture");h.fail("version_conflict");await h.save();
 h.failReload("unavailable");await h.click("Sunucudaki sürümü yükle");
 assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Generated description");
 const failedGuard=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(failedGuard);assert.equal(failedGuard.defaultPrevented,true);
 Reflect.set(h.browser,"confirm",()=>false);
 const leave=new h.browser.MouseEvent("click",{bubbles:true,cancelable:true,button:0});h.container.querySelector<HTMLAnchorElement>('a[href="/products"]')!.dispatchEvent(leave as unknown as Event);assert.equal(leave.defaultPrevented,true,"declining close navigation must retain the local editor");
 h.fail(null);await h.save();assert.deepEqual(h.requests[1].contentOrigins,{description:generatedOrigin},"failed reload must retain pending provenance for later save");
 await h.click("Apply description fixture");h.fail("version_conflict");await h.save();h.failReload(null);await h.click("Sunucudaki sürümü yükle");
 assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Saved description");
 const successGuard=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(successGuard);assert.equal(successGuard.defaultPrevented,false);
 assert.equal(h.container.querySelector('[data-description-origin]')!.getAttribute("data-description-origin"),JSON.stringify(priorOrigin));
 const title=h.container.querySelector<HTMLInputElement>('[name="title"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(h.browser.HTMLInputElement.prototype,"value")!.set!.call(title,"Manual title after reload");title.dispatchEvent(new h.browser.Event("input",{bubbles:true}) as unknown as Event);});
 h.fail(null);await h.save();assert.equal(Object.hasOwn(h.requests.at(-1),"contentOrigins"),false,"successful server replacement must clear the abandoned applied origin");
}));


test("existing detail offers one three-field bundle with current unsaved SEO capture and selected apply preserving independent saves",async()=>withDetail(async h=>{
 const title=h.container.querySelector<HTMLInputElement>('[name="title"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(h.browser.HTMLInputElement.prototype,"value")!.set!.call(title,"Unsaved general title");title.dispatchEvent(new h.browser.Event("input",{bubbles:true}) as unknown as Event);});
 const bridge=h.authoring();assert.deepEqual(bridge.fields,["description","seoTitle","seoDescription"]);
 const captured=bridge.capture();assert.deepEqual(captured.request.fields,bridge.fields);assert.equal(captured.request.productVersion,7);assert.equal(captured.request.profileVersion,9);
 assert.equal(captured.request.currentDraft.title,"Unsaved general title");assert.equal(captured.request.currentDraft.description,"Saved description");assert.equal(captured.request.currentDraft.seoTitle,"Unsaved SEO title");assert.equal(captured.request.currentDraft.seoDescription,"Unsaved SEO summary");
 assert.equal(bridge.canApplyField("seoTitle",{draft:{seoTitle:"Missing controller"}}),false);assert.equal(bridge.canApplyField("seoDescription",{draft:{seoDescription:"Chosen AI summary"}}),true);assert.equal(h.container.querySelector('[data-seo-description]')!.textContent,"Unsaved SEO summary");
 await act(async()=>assert.equal(bridge.applyField("seoDescription",{id:generatedOrigin.generationId,draftId:generatedOrigin.draftId,draft:{seoDescription:"Chosen AI summary"}}),true));
 assert.equal(h.container.querySelector('[data-seo-description]')!.textContent,"Chosen AI summary");assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Saved description");assert.equal(h.requests.length,0);
 assert.notEqual(h.authoring().capture().draftRevision,captured.draftRevision,"SEO changes invalidate a prior bundled snapshot");
 await h.save();assert.equal(Object.hasOwn(h.requests[0],"contentOrigins"),false);const guard=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(guard);assert.equal(guard.defaultPrevented,true,"product save must leave chosen SEO apply dirty");
 await h.click("Save SEO fixture");const saved=new h.browser.Event("beforeunload",{cancelable:true});h.browser.dispatchEvent(saved);assert.equal(saved.defaultPrevented,false);
}));


const existingVariant={id:"70000000-0000-4000-8000-000000000001",title:"Saved M",status:"active",version:3,attributes:{beden:"M"},measurements:{weight:{valueMilli:14890,unit:"g"}},priceCents:10000,stockQuantity:7,stockTracking:true};
async function typeVariant(h:any,name:string,text:string){const input=h.container.querySelector(`.catalog-form input[name="${name}"]`);assert.ok(input,name);await act(async()=>{Object.getOwnPropertyDescriptor(h.browser.HTMLInputElement.prototype,"value")!.set!.call(input,text);input.dispatchEvent(new h.browser.Event("input",{bubbles:true}));});}
async function openVariant(h:any){const button=h.container.querySelector('button[aria-label="Saved M varyantını düzenle"]');assert.ok(button);await act(async()=>button.click());}

test("both existing authoring entry points capture unsaved inline variant content, clears and verified UUID attributes",async()=>withDetail(async h=>{
 await openVariant(h);await typeVariant(h,"title","Current M");await typeVariant(h,"measurement-weight","20");
 const current=h.authoring().capture().request.currentDraft.variants;
 assert.deepEqual(current,[{id:existingVariant.id,title:"Current M",attributes:[{attributeId:"30000000-0000-4000-8000-000000000001",value:"M"}],measurements:{weight:{valueMilli:20000,unit:"g"}}}]);
 assert.deepEqual(h.seoDraft().currentDraft.variants,current);assert.equal(h.variantRequests.length,0);
 await typeVariant(h,"measurement-weight","");assert.equal(h.authoring().capture().request.currentDraft.variants[0].measurements,null);assert.deepEqual(h.seoDraft().currentDraft.variants,h.authoring().capture().request.currentDraft.variants);
 await typeVariant(h,"measurement-weight","invalid");assert.throws(()=>h.authoring().capture(),/invalid_measurements/);assert.throws(()=>h.seoDraft(),/invalid_measurements/);
 await typeVariant(h,"measurement-weight","20");await typeVariant(h,"title","");assert.throws(()=>h.authoring().capture(),/invalid_variant_draft/);
 await typeVariant(h,"title","Current M");await h.click("Varyantı kaydet");assert.equal(h.variantRequests.length,1);assert.equal(h.variantRequests[0].expectedVersion,3);assert.deepEqual(h.variantRequests[0].variant.measurements,{weight:{valueMilli:20000,unit:"g"}});assert.deepEqual(h.variantRequests[0].variant.attributes,{beden:"M"});assert.equal(h.variantRequests[0].variant.priceCents,10000);assert.equal(h.variantRequests[0].variant.stockQuantity,7);
},[existingVariant]));

for(const phase of ["pending","completed"] as const)test(`variant edits after ${phase} generation block actual preview apply without changing text or origin`,async()=>withDetail(async h=>{
 await openVariant(h);await typeVariant(h,"measurement-weight","20");await h.click("Open authoring preview");await h.click("İçerik oluştur");assert.equal(h.generationRequests[0].currentDraft.variants[0].measurements.weight.valueMilli,20000);
 if(phase==="completed")await act(async()=>h.resolveGeneration());
 await typeVariant(h,"measurement-weight","");
 if(phase==="pending")await act(async()=>h.resolveGeneration());
 await h.click("Açıklama alanına uygula");assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Saved description");assert.equal(h.container.querySelector('[data-description-origin]')!.getAttribute("data-description-origin"),JSON.stringify(priorOrigin));assert.match(h.container.textContent??"",/Alanlar değişti/);assert.equal(h.requests.length,0);assert.equal(h.variantRequests.length,0);
},[existingVariant]));

test("unsaved new variant facts are explicit and cancelling their form invalidates the prior snapshot",async()=>withDetail(async h=>{
 const original=h.authoring().capture();await h.click("Varyant ekle");assert.throws(()=>h.authoring().capture(),/invalid_variant_draft/);
 await typeVariant(h,"title","New draft");await typeVariant(h,"measurement-weight","20");const next=h.authoring().capture();assert.equal(next.request.currentDraft.variants.length,2);assert.deepEqual(next.request.currentDraft.variants[1],{title:"New draft",attributes:[],measurements:{weight:{valueMilli:20000,unit:"g"}}});assert.notEqual(next.draftRevision,original.draftRevision);
 const cancel=h.container.querySelector<HTMLButtonElement>('.catalog-form button[type="button"]')!;await act(async()=>cancel.click());assert.equal(h.authoring().capture().request.currentDraft.variants.length,1);assert.notEqual(h.authoring().capture().draftRevision,next.draftRevision);
},[existingVariant]));


test("variant removal uses normal archive CAS and invalidates an earlier actual AI preview",async()=>withDetail(async h=>{
 await h.click("Open authoring preview");await h.click("İçerik oluştur");await act(async()=>h.resolveGeneration());assert.equal(h.authoring().capture().request.currentDraft.variants.length,1);
 const archive=h.container.querySelector<HTMLButtonElement>('[role="list"] .text-danger-button')!;assert.ok(archive);await act(async()=>archive.click());await h.click("Varyantı arşivle");
 assert.deepEqual(h.variantRequests,[{archive:existingVariant.id,expectedVersion:3}]);assert.deepEqual(h.authoring().capture().request.currentDraft.variants,[]);assert.deepEqual(h.seoDraft().currentDraft.variants,[]);
 await h.click("Açıklama alanına uygula");assert.equal(h.container.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,"Saved description");assert.equal(h.container.querySelector('[data-description-origin]')!.getAttribute("data-description-origin"),JSON.stringify(priorOrigin));assert.match(h.container.textContent??"",/Alanlar değişti/);assert.equal(h.requests.length,0);
},[existingVariant],true));

test("unresolved existing variant attribute metadata never falls back to invented UUIDs or saved content",async()=>withDetail(async h=>{
 assert.throws(()=>h.authoring().capture(),/attribute_metadata_unavailable/);assert.throws(()=>h.seoDraft(),/attribute_metadata_unavailable/);assert.equal(h.generationRequests.length,0);
},[{...existingVariant,attributes:{unresolved:"M"}}]));
