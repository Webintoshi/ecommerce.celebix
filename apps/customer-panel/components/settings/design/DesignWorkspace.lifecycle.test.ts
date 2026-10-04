import assert from "node:assert/strict";
import test from "node:test";
import React,{type ReactNode} from "react";
import { normalizeStorefrontDesignDocumentV5,type StorefrontDesignDocument,type StorefrontDesignEditorWorkspace,type StorefrontDesignMediaOption } from "@celebix/saas-contracts";
import { StorefrontDesignApiError } from "../../../lib/storefront-design-ui/client.ts";
import { compile,DESIGN,withEditor } from "./design-editor-test-utils.ts";
const NOW="2026-09-30T10:00:00.000Z";
function button(container:HTMLElement,label:string){const found=Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.textContent?.trim()===label||item.getAttribute("aria-label")===label||item.querySelector("strong")?.textContent===label);assert.ok(found,`Missing ${label}: ${container.textContent}`);return found;}
const baseline=()=>normalizeStorefrontDesignDocumentV5({...DESIGN,promotion:{...DESIGN.promotion,headline:"Published"}});
const media={id:"40000000-0000-4000-8000-000000000001",url:"https://fixture.invalid/banner.webp",altText:"Banner image",mediaType:"image/webp" as const,width:1600,height:900,reference:{kind:"asset" as const,assetId:"40000000-0000-4000-8000-000000000001"},assetKind:"hero" as const};
type MediaUploadInput=Readonly<{file:File;altText:string;operationId?:string}>;
function fixture(canManage=true,uploadResponse?:(input:MediaUploadInput)=>Promise<StorefrontDesignMediaOption>){
 let live:StorefrontDesignEditorWorkspace={schemaVersion:1,publishedVersion:4,publishedAt:NOW,design:baseline(),store:{name:"Fixture",timezone:"UTC"},media:[media],destinations:[]};
 let failure:string|undefined;let hold:Promise<void>|undefined;let release:(()=>void)|undefined;
 const requests:{input:{expectedPublishedVersion:number;design:StorefrontDesignDocument};operationId:string}[]=[];
 const mediaRequests:MediaUploadInput[]=[];let uploadFromEditor:((file:File)=>Promise<StorefrontDesignMediaOption>)|undefined;
 const api={editor:async()=>structuredClone(live),uploadMedia:async(input:MediaUploadInput)=>{mediaRequests.push({...input});if(uploadResponse)return uploadResponse(input);throw new Error("Unused");},apply:async(input:typeof requests[number]["input"],options:{operationId:string})=>{requests.push({input:structuredClone(input),operationId:options.operationId});await hold;if(failure){const code=failure;failure=undefined;throw new StorefrontDesignApiError(code as never,code==="version_conflict"?409:503);}if(input.expectedPublishedVersion!==live.publishedVersion)throw new StorefrontDesignApiError("version_conflict",409);live={...live,publishedVersion:live.publishedVersion+1,design:normalizeStorefrontDesignDocumentV5(input.design)};return{publishedVersion:live.publishedVersion,publishedAt:NOW,design:live.design,published:{} as never};}};
 const {DesignWorkspace}=compile<{DesignWorkspace:(props:Record<string,unknown>)=>ReactNode}>(new URL("./DesignWorkspace.tsx",import.meta.url),{
  "@/components/panel/PanelTopbarChrome":{PanelTopbarBridge:()=>null},
  "@/lib/storefront-design-ui/client":{StorefrontDesignApiError,storefrontDesignApi:api},
  "@/lib/storefront-design-preview-ui/use-preview-resources":{useStorefrontDesignPreviewResources:()=>({})},
  "./DesignStepEditor":{DesignStepEditor:({design,onChange,canManage:allowed,onMediaBusyChange,onUpload}:{design:StorefrontDesignDocument;onChange:(value:StorefrontDesignDocument)=>void;canManage:boolean;onMediaBusyChange?:(id:string,busy:boolean)=>void;onUpload:(file:File,altText:string)=>Promise<StorefrontDesignMediaOption>})=>{uploadFromEditor=file=>onUpload(file,`${design.promotion.headline} logo`);return React.createElement(React.Fragment,null,
   React.createElement("input",{"aria-label":"Fixture heading",value:design.promotion.headline,disabled:!allowed,onInput:(event:React.FormEvent<HTMLInputElement>)=>onChange({...design,promotion:{...design.promotion,headline:event.currentTarget.value}})}),
   ...(["logo","favicon"] as const).flatMap(field=>[
    React.createElement("button",{key:`${field}-start`,type:"button",disabled:!allowed,onClick:()=>{onMediaBusyChange?.(`${field}-selection`,true);onMediaBusyChange?.(field,true);}},`${field} upload started`),
    React.createElement("button",{key:`${field}-failed`,type:"button",disabled:!allowed,onClick:()=>onMediaBusyChange?.(field,false)},`${field} upload failed`),
    React.createElement("button",{key:`${field}-resolved`,type:"button",disabled:!allowed,onClick:()=>{onMediaBusyChange?.(field,false);onMediaBusyChange?.(`${field}-selection`,false);}},`${field} selection resolved`),
   ]));}},
  "./DesignPreview":{DesignPreview:({design,onSelectSurface,onInsertSection,onSelectSection}:{design:StorefrontDesignDocument;onSelectSurface:(surface:string,trigger:HTMLElement)=>void;onInsertSection:(index:number,trigger:HTMLElement)=>void;onSelectSection:(id:string,trigger:HTMLElement)=>void})=>React.createElement(React.Fragment,null,React.createElement("output",{"data-preview":true},JSON.stringify(design)),React.createElement("button",{onClick:(event:React.MouseEvent<HTMLButtonElement>)=>onSelectSurface("brand",event.currentTarget)},"Edit brand"),React.createElement("button",{onClick:(event:React.MouseEvent<HTMLButtonElement>)=>onInsertSection(0,event.currentTarget)},"Insert start"),...design.composition.sections.map((section,index)=>React.createElement("button",{key:index,onClick:(event:React.MouseEvent<HTMLButtonElement>)=>onSelectSection("sectionId" in section?section.sectionId:"",event.currentTarget)},`Edit section ${index+1}`)))},
 });
 return {DesignWorkspace,canManage,requests,mediaRequests,upload(file:File){assert.ok(uploadFromEditor,"StepEditor must receive the actual Workspace upload callback");return uploadFromEditor(file);},get live(){return live;},fail(code="unavailable"){failure=code;},remote(){live={...live,publishedVersion:5,design:{...live.design,promotion:{...live.design.promotion,headline:"Remote"}}};},hold(){hold=new Promise<void>(resolve=>{release=resolve;});},release(){release?.();hold=undefined;}};
}
test("global popup uses published baseline, performs no implicit save, and Cancel restores preview and focus",async()=>withEditor(async({container,window,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));assert.equal(container.querySelector('[role="dialog"]'),null);
 const trigger=button(container,"Edit brand");await click(trigger);const input=container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')!;await change(input,"Local");assert.equal(app.requests.length,0);assert.match(container.querySelector("output")?.textContent??"",/Local/);
 await click(button(container,"Vazgeç"));assert.equal(container.querySelector('[role="dialog"]'),null);assert.match(container.querySelector("output")?.textContent??"",/Published/);assert.equal(app.requests.length,0);assert.equal(window.document.activeElement,trigger);assert.doesNotMatch(container.textContent??"",/Taslak|Yayınla|otomatik/);
}));
test("Apply commits once to live and a failed Apply preserves inputs and retries the same operation",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Edit brand"));await change(container.querySelector<HTMLInputElement>("input")!,"Local");app.fail();await click(button(container,"Uygula"));
 assert.equal(app.requests.length,1);assert.equal(app.live.design.promotion.headline,"Published");assert.equal(container.querySelector<HTMLInputElement>("input")?.value,"Local");assert.ok(container.querySelector('[role="dialog"]'));
 await click(button(container,"Uygula"));assert.equal(app.requests.length,2);assert.equal(app.requests[0]?.operationId,app.requests[1]?.operationId);assert.deepEqual(app.requests[0]?.input,app.requests[1]?.input);assert.equal(app.live.design.promotion.headline,"Local");assert.equal(app.live.publishedVersion,5);assert.equal(container.querySelector('[role="dialog"]'),null);
}));
test("conflict compares latest while preserving inputs and requires explicit latest-version Apply",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Edit brand"));await change(container.querySelector<HTMLInputElement>("input")!,"Local");app.remote();await click(button(container,"Uygula"));assert.equal(app.requests.length,1);assert.equal(app.live.design.promotion.headline,"Remote");assert.equal(button(container,"Uygula").disabled,true);
 await click(button(container,"Güncel sürümle karşılaştır"));assert.match(container.querySelector("table")?.textContent??"",/Remote/);assert.match(container.querySelector("table")?.textContent??"",/Local/);assert.equal(app.requests.length,1);
 await click(button(container,"Bu değişiklikleri güncel sürüme uygula"));assert.equal(app.requests.length,2);assert.equal(app.requests[1]?.input.expectedPublishedVersion,5);assert.notEqual(app.requests[1]?.operationId,app.requests[0]?.operationId);assert.equal(app.live.design.promotion.headline,"Local");
}));
test("insertion uses the same modal, preserves asset reference, and publishes only on Apply",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Insert start"));await click(button(container,"Banner"));assert.equal(container.querySelectorAll('[role="dialog"]').length,1);assert.ok(button(container,"İçerik"));assert.ok(button(container,"Görünüm"));
 const desktop=Array.from(container.querySelectorAll<HTMLElement>("section[aria-labelledby]")).find(item=>item.querySelector("strong")?.textContent==="Masaüstü görseli");assert.ok(desktop);const library=desktop.querySelector("button[aria-controls]");assert.ok(library);await click(library);const option=desktop.querySelector<HTMLButtonElement>(`button[value="asset:${media.id}"]`);assert.ok(option);await click(option);assert.equal(app.requests.length,0);
 await click(button(container,"Görünüm"));const background=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Arka plan"))?.querySelector("select");assert.ok(background);await change(background,"dark");await click(button(container,"Uygula"));assert.equal(app.requests.length,1);
 const banner=app.live.design.composition.sections[0];assert.equal(banner?.kind,"banner");if(banner?.kind==="banner"){assert.deepEqual(banner.slides[0]?.desktopImage,{kind:"asset",assetId:media.id});assert.equal(banner.style?.background,"dark");}
}));
test("ordering and section visibility remain local until Apply; Cancel discards ordering",async()=>withEditor(async({container,render,click})=>{
 const app=fixture();const second={kind:"brand_story" as const,sectionId:"home_story_fixture",enabled:true,heading:"Story",body:"Story body"};const workspace={...app.live,design:{...app.live.design,composition:{...app.live.design.composition,sections:[...app.live.design.composition.sections,second]}}};await render(React.createElement(app.DesignWorkspace,{workspace,initialPreviewResources:{},canManage:true}));
 await click(button(container,"Sıralama"));await click(button(container,"Marka hikâyesi 2 yukarı taşı"));assert.match(container.querySelector("output")?.textContent??"",/Story/);assert.equal(app.requests.length,0);await click(button(container,"Vazgeç"));const preview=JSON.parse(container.querySelector("output")!.textContent!) as StorefrontDesignDocument;assert.equal(preview.composition.sections[0]?.kind,"product_row");
 await click(button(container,"Edit section 1"));await click(button(container,"Gizle"));assert.equal(app.requests.length,0);await click(button(container,"Uygula"));assert.equal(app.live.design.composition.sections[0]?.enabled,false);
}));
test("value edits block incomplete Apply and preserve four values across a failed save and retry",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));
 await click(button(container,"Insert start"));await click(button(container,"Değer önerileri"));
 const add=()=>Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.textContent?.includes("Değer ekle"))!;
 await click(add());await click(add());assert.equal(container.querySelectorAll("fieldset").length,4);
 const heading=()=>container.querySelectorAll("fieldset")[3]!.querySelectorAll<HTMLInputElement>("input")[0]!;
 await change(heading(),"");assert.equal(button(container,"Uygula").disabled,true);assert.equal(heading().value,"");await click(button(container,"Uygula"));assert.equal(app.requests.length,0);
 await change(heading(),"Özel değer");assert.equal(button(container,"Uygula").disabled,false);
 app.fail();await click(button(container,"Uygula"));assert.equal(app.requests.length,1);assert.equal(heading().value,"Özel değer");assert.equal(container.querySelectorAll("fieldset").length,4);assert.equal(app.live.design.composition.sections.some(section=>section.kind==="value_propositions"),false);
 await click(button(container,"Uygula"));assert.equal(app.requests.length,2);assert.equal(app.requests[0]?.operationId,app.requests[1]?.operationId);assert.deepEqual(app.requests[0]?.input,app.requests[1]?.input);
 const values=app.live.design.composition.sections[0];assert.equal(values?.kind,"value_propositions");if(values?.kind==="value_propositions"){assert.equal(values.items.length,4);assert.equal(values.items[3]?.heading,"Özel değer");}
}));
test("canceling an invalid section resets validation before editing another popup",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));
 await click(button(container,"Edit section 1"));await change(container.querySelector<HTMLInputElement>('label input')!,"");assert.equal(button(container,"Uygula").disabled,true);
 await click(button(container,"Vazgeç"));await click(button(container,"Edit brand"));await change(container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')!,"After cancel");assert.equal(button(container,"Uygula").disabled,false);
 await click(button(container,"Uygula"));assert.equal(app.requests.length,1);assert.equal(app.live.design.promotion.headline,"After cancel");assert.equal(app.live.design.composition.sections[0]?.kind,"product_row");
}));
test("removing an incomplete section clears validation and applies its removal",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));
 await click(button(container,"Edit section 1"));await change(container.querySelector<HTMLInputElement>('label input')!,"");assert.equal(button(container,"Uygula").disabled,true);
 await click(button(container,"Kaldır"));assert.match(container.textContent??"",/Bölüm kaldırıldı/);assert.equal(button(container,"Uygula").disabled,false);
 await click(button(container,"Uygula"));assert.equal(app.requests.length,1);assert.equal(app.live.design.composition.sections.length,0);
}));
test("permission denial preserves input; read-only callbacks cannot create an Apply",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Edit brand"));await change(container.querySelector<HTMLInputElement>("input")!,"Preserved");app.fail("membership_denied");await click(button(container,"Uygula"));assert.equal(container.querySelector<HTMLInputElement>("input")?.value,"Preserved");assert.match(container.textContent??"",/yetkiniz yok/);
 const readonly=fixture(false);await render(React.createElement(readonly.DesignWorkspace,{workspace:readonly.live,initialPreviewResources:{},canManage:false}));await click(button(container,"Edit brand"));assert.equal(container.querySelector<HTMLInputElement>("input")?.disabled,true);assert.equal(button(container,"Uygula").disabled,true);assert.equal(readonly.requests.length,0);
}));

test("Apply waits for both independent image selections and a failed selection remains blocked until resolved",async()=>withEditor(async({container,render,click,change})=>{
 const app=fixture();await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Edit brand"));
 await change(container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')!,"Local with images");assert.equal(button(container,"Uygula").disabled,false);assert.equal(app.requests.length,0);
 await click(button(container,"logo upload started"));await click(button(container,"favicon upload started"));assert.equal(button(container,"Uygula").disabled,true);await click(button(container,"Uygula"));assert.equal(app.requests.length,0);
 await click(button(container,"logo selection resolved"));assert.equal(button(container,"Uygula").disabled,true,"finishing one image must not release the other image");assert.equal(app.requests.length,0);
 await click(button(container,"favicon upload failed"));assert.equal(button(container,"Uygula").disabled,true,"a failed pending selection still blocks Apply when upload busy ends");await click(button(container,"Uygula"));assert.equal(app.requests.length,0);assert.equal(app.live.design.promotion.headline,"Published");
 await click(button(container,"favicon selection resolved"));assert.equal(button(container,"Uygula").disabled,false);assert.equal(app.requests.length,0,"resolving uploads must not implicitly apply design changes");
 await click(button(container,"Uygula"));assert.equal(app.requests.length,1);assert.equal(app.live.design.promotion.headline,"Local with images");assert.equal(container.querySelector('[role="dialog"]'),null);
}));

test("Workspace media retry freezes the same File operation and description while a different File starts a new operation",async()=>withEditor(async({container,render,click,change})=>{
 const responses:{resolve:(value:StorefrontDesignMediaOption)=>void;reject:(error:unknown)=>void}[]=[];
 const app=fixture(true,()=>new Promise<StorefrontDesignMediaOption>((resolve,reject)=>responses.push({resolve,reject})));
 const result=(input:MediaUploadInput):StorefrontDesignMediaOption=>({id:input.operationId!,url:"https://fixture.invalid/uploaded.webp",altText:input.altText,mediaType:"image/webp",width:160,height:80});
 await render(React.createElement(app.DesignWorkspace,{workspace:app.live,initialPreviewResources:{},canManage:true}));await click(button(container,"Edit brand"));await change(container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')!,"Original title");
 const sameFile=new File(["image"],"logo.webp",{type:"image/webp"});let first!:Promise<StorefrontDesignMediaOption>;
 await React.act(async()=>{first=app.upload(sameFile);});assert.equal(button(container,"Uygula").disabled,true);assert.equal(app.mediaRequests.length,1);assert.match(app.mediaRequests[0]?.operationId??"",/^[0-9a-f-]{36}$/);
 const failed=assert.rejects(first,(error:unknown)=>error instanceof StorefrontDesignApiError&&error.code==="unavailable");await React.act(async()=>{responses[0]!.reject(new StorefrontDesignApiError("unavailable",503));await failed;});
 await change(container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')!,"Changed title");let retried!:Promise<StorefrontDesignMediaOption>;
 await React.act(async()=>{retried=app.upload(sameFile);});assert.equal(app.mediaRequests.length,2);assert.equal(app.mediaRequests[1]?.file,sameFile);assert.equal(app.mediaRequests[1]?.operationId,app.mediaRequests[0]?.operationId);assert.equal(app.mediaRequests[1]?.altText,"Original title logo");
 await React.act(async()=>{responses[1]!.resolve(result(app.mediaRequests[1]!));await retried;});
 const differentFile=new File(["other image"],"second.webp",{type:"image/webp"});let next!:Promise<StorefrontDesignMediaOption>;
 await React.act(async()=>{next=app.upload(differentFile);});assert.equal(app.mediaRequests[2]?.file,differentFile);assert.notEqual(app.mediaRequests[2]?.operationId,app.mediaRequests[1]?.operationId);assert.equal(app.mediaRequests[2]?.altText,"Changed title logo");
 await React.act(async()=>{responses[2]!.resolve(result(app.mediaRequests[2]!));await next;});
 let afterSuccess!:Promise<StorefrontDesignMediaOption>;await React.act(async()=>{afterSuccess=app.upload(sameFile);});assert.notEqual(app.mediaRequests[3]?.operationId,app.mediaRequests[0]?.operationId,"a successful attempt releases its retained operation");assert.equal(app.mediaRequests[3]?.altText,"Changed title logo");
 await React.act(async()=>{responses[3]!.resolve(result(app.mediaRequests[3]!));await afterSuccess;});
 assert.equal(app.requests.length,0);assert.equal(app.live.design.promotion.headline,"Published");assert.equal(container.querySelector<HTMLInputElement>('input[aria-label="Fixture heading"]')?.value,"Changed title");
}));
