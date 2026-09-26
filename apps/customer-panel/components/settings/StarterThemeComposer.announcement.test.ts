import assert from "node:assert/strict";
import test from "node:test";
import React,{type ReactNode} from "react";
import * as composerModel from "../../lib/starter-theme-composer-model.ts";
import {compile,DESIGN,withEditor} from "./design/design-editor-test-utils.ts";
const {StarterThemeComposer}=compile<{StarterThemeComposer:(props:Record<string,unknown>)=>ReactNode}>(new URL("./StarterThemeComposer.tsx",import.meta.url),{
 "@/components/settings/StarterThemePreview":{StarterThemePreview:()=>null},
 "@/components/settings/StarterFooterEditor":{StarterFooterEditor:()=>null},
 "@/components/settings/StarterRetailSectionEditors":{StarterRetailSectionEditor:()=>null},
 "@/lib/catalog-onboarding-ui/client":{catalogOnboardingClient:{listCategories:async()=>[]}},
 "@/lib/catalog-ui/client":{catalogApi:{listProducts:async()=>({items:[]})}},
 "@/lib/merchant-admin-ui/client":{merchantAdminApi:{records:async()=>[]}},
 "@/lib/starter-theme-composer-model":composerModel,
});

test("simple announcement keeps a temporary blank entry with an adjacent error and last valid draft",async()=>withEditor(async({container,render,change})=>{
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({assets:[]}),{status:200});const changes:unknown[]=[];
 try{
 await render(React.createElement(StarterThemeComposer,{activePanel:"navigation",canManage:true,showPreview:false,value:{...DESIGN.composition,announcement:{enabled:true,items:["Geçerli mesaj"]}},onChange:(value:unknown)=>changes.push(value)}));
 await React.act(async()=>{await Promise.resolve();await Promise.resolve();});
 const field=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Duyuru metni"))?.querySelector<HTMLInputElement|HTMLTextAreaElement>("input,textarea");assert.ok(field);await change(field,"");
 assert.equal(changes.length,0);assert.equal(field.value,"");assert.equal(field.getAttribute("aria-invalid"),"true");assert.match(container.textContent??"",/en fazla 120 karakter/);
 await change(field,"Yeni mesaj");assert.equal(changes.length,1);assert.equal(field.getAttribute("aria-invalid"),"false");
 }finally{globalThis.fetch=previousFetch;}
}));
