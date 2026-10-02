import assert from "node:assert/strict";
import test from "node:test";
import React,{type ReactNode} from "react";
import type {StorefrontDesignDocument} from "@celebix/saas-contracts";
import {compile,DESIGN,withEditor} from "./design-editor-test-utils.ts";
const {DesignInspector}=compile<{DesignInspector:(props:Record<string,unknown>)=>ReactNode}>(new URL("./DesignInspector.tsx",import.meta.url));
const props={storeName:"Fixture",timezone:"Europe/Istanbul",media:[],destinations:[],canManage:true,onUpload:async()=>{throw new Error("unused");}};

test("campaign scheduling displays store local time and preserves its instant on edit",async()=>withEditor(async({container,render,change})=>{
 const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(DesignInspector,{...props,section:"promotion",design:{...DESIGN,promotion:{...DESIGN.promotion,startsAt:"2026-09-26T09:00:00.000Z",endsAt:"2026-09-26T15:00:00.000Z"}},onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 const inputs=container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');assert.equal(inputs[0]?.value,"2026-09-26T12:00");
 await change(inputs[0]!,"2026-09-26T13:00");assert.equal(changes.at(-1)?.promotion.startsAt,"2026-09-26T10:00:00.000Z");
}));

test("advanced announcement reads composition authority and synchronizes content while preserving animation and destination",async()=>withEditor(async({container,render,click})=>{
 const changes:StorefrontDesignDocument[]=[];
 const design={...DESIGN,announcement:{...DESIGN.announcement,items:["Eski metin"],animation:"step",speed:"fast"},composition:{...DESIGN.composition,announcement:{enabled:true,items:["Asıl metin"],destination:"/favorites"}}};
 await render(React.createElement(DesignInspector,{...props,section:"announcement",design,onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 const enabled=container.querySelector<HTMLInputElement>('input[type="checkbox"]');assert.ok(enabled);assert.equal(enabled.checked,true);
 assert.equal(container.querySelector("textarea")?.value,"Asıl metin");await click(enabled);
 assert.equal(changes.at(-1)?.announcement.enabled,false);assert.equal(changes.at(-1)?.composition.announcement.enabled,false);assert.deepEqual(changes.at(-1)?.announcement.items,["Asıl metin"]);assert.equal(changes.at(-1)?.announcement.animation,"step");assert.equal(changes.at(-1)?.composition.announcement.destination,"/favorites");
}));

test("banner controls describe draft visibility without claiming publication",async()=>withEditor(async({container,render})=>{
 await render(React.createElement(DesignInspector,{...props,section:"hero",design:DESIGN,onChange:()=>{}}));
 assert.doesNotMatch(container.textContent??"",/Yayında/);assert.match(container.textContent??"",/Bannerları göster/);assert.match(container.textContent??"",/Slaytı göster/);
}));

test("legacy visible hero is shown as enabled and turning banners off disables both records",async()=>withEditor(async({container,render,click})=>{
 const hero={kind:"hero",sectionId:"home_legacy_hero",enabled:true,slides:[{heading:"Eski banner",desktopAssetId:"30000000-0000-4000-8000-000000000001",destination:"/products"}]};const design={...DESIGN,composition:{...DESIGN.composition,sections:[hero]}};const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(DesignInspector,{...props,section:"hero",design,onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));const toggle=container.querySelector<HTMLInputElement>('input[type="checkbox"]');assert.ok(toggle);assert.equal(toggle.checked,true);await click(toggle);assert.equal(changes.at(-1)?.hero.enabled,false);assert.equal(changes.at(-1)?.composition.sections[0]?.enabled,false);
}));

test("staging fixed banner fields preserves visible legacy hero until an explicit visibility action",async()=>withEditor(async({container,render,change})=>{
 const hero={kind:"hero",sectionId:"home_legacy_hero",enabled:true,slides:[{heading:"Eski banner",desktopAssetId:"30000000-0000-4000-8000-000000000001",destination:"/products"}]};const design={...DESIGN,composition:{...DESIGN.composition,sections:[hero]}};const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(DesignInspector,{...props,section:"hero",design,onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));const field=Array.from(container.querySelectorAll("label")).find(label=>label.textContent==="Başlık");const input=field?.parentElement?.querySelector<HTMLInputElement>("input");assert.ok(input);await change(input,"Yeni banner");assert.equal(changes.at(-1)?.hero.enabled,false);assert.equal(changes.at(-1)?.composition.sections[0]?.enabled,true);
}));

test("retained brand HTTPS reference stays visible without requiring replacement",async()=>withEditor(async({container,render})=>{
 const changes:StorefrontDesignDocument[]=[];const logo={kind:"legacy_https" as const,url:"https://fixture.invalid/old-logo.png"};await render(React.createElement(DesignInspector,{...props,section:"brand",design:{...DESIGN,brand:{...DESIGN.brand,logo}},onChange:(next:StorefrontDesignDocument)=>changes.push(next)}));assert.equal(container.querySelectorAll("select").length,0);assert.equal(container.querySelector("img")?.getAttribute("src"),logo.url);assert.equal(changes.length,0);
}));
test("closing a global media field during upload prevents late configuration changes",async()=>withEditor(async({container,window,render})=>{
 let release:((value:unknown)=>void)|undefined;const pending=new Promise(resolve=>{release=resolve;});let updates=0;await render(React.createElement(DesignInspector,{...props,section:"brand",design:DESIGN,onChange:()=>updates++,onUpload:()=>pending}));const input=container.querySelector<HTMLInputElement>('input[type="file"]');assert.ok(input);Object.defineProperty(input,"files",{configurable:true,value:[new window.File(["fixture"],"logo.webp",{type:"image/webp"})]});await React.act(async()=>input.dispatchEvent(new window.Event("change",{bubbles:true}) as unknown as Event));await render(null);await React.act(async()=>release?.({id:"40000000-0000-4000-8000-000000000001",url:"https://fixture.invalid/logo.webp",altText:"Logo",mediaType:"image/webp",width:100,height:100}));assert.equal(updates,0);
}));

test("announcement destination selection and custom removal preserve composition authority and animation",async()=>withEditor(async({container,render,change})=>{
 const destinations=[{kind:"collection" as const,resourceId:"50000000-0000-4000-8000-000000000001",label:"Yaz koleksiyonu",path:"/collections/summer"}];
 const writes:StorefrontDesignDocument[]=[];let design:StorefrontDesignDocument={...DESIGN,announcement:{...DESIGN.announcement,items:["Legacy content"],animation:"step",speed:"fast"},composition:{...DESIGN.composition,announcement:{enabled:true,items:["Composition content"],destination:"/favorites"}}};
 const onChange=(next:StorefrontDesignDocument)=>{writes.push(next);design=next;};
 const renderCurrent=()=>render(React.createElement(DesignInspector,{...props,section:"announcement",design,destinations,onChange}));
 const link=()=>{const input=container.querySelector<HTMLSelectElement>("#design-announcement-link");assert.ok(input);return input;};
 const custom=()=>{const label=Array.from(container.querySelectorAll("label")).find(item=>item.textContent==="Özel bağlantı");return label?.parentElement?.querySelector<HTMLInputElement>("input");};
 const preserved=()=>{assert.deepEqual(design.composition.announcement.items,["Composition content"]);assert.equal(design.composition.announcement.enabled,true);assert.equal(design.announcement.animation,"step");assert.equal(design.announcement.speed,"fast");};
 await renderCurrent();assert.equal(link().value,"custom");assert.equal(custom()?.value,"/favorites");assert.equal(writes.length,0);
 await change(custom()!,"/pages/news");await renderCurrent();assert.equal(design.composition.announcement.destination,"/pages/news");preserved();
 await change(link(),destinations[0]!.path);await renderCurrent();assert.equal(design.composition.announcement.destination,"/collections/summer");assert.equal(custom(),undefined);preserved();
 await change(link(),"custom");await renderCurrent();assert.equal(design.composition.announcement.destination,"/products");assert.equal(custom()?.value,"/products");preserved();
 await change(link(),"");await renderCurrent();assert.equal(Object.hasOwn(design.composition.announcement,"destination"),false);assert.equal(link().value,"");assert.equal(custom(),undefined);preserved();
 assert.equal(writes.length,4);
}));
