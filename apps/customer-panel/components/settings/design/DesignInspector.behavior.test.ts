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
