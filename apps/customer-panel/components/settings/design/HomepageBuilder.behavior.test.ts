import assert from "node:assert/strict";
import test from "node:test";
import React, {type ReactNode} from "react";
import {normalizeStarterThemeCompositionV3, type StorefrontDesignDocument} from "@celebix/saas-contracts";
import {compile, DESIGN, withEditor} from "./design-editor-test-utils.ts";
const HomepageBuilder=compile<{HomepageBuilder:(props:Record<string,unknown>)=>ReactNode}>(new URL("./HomepageBuilder.tsx",import.meta.url)).HomepageBuilder;
const category=(index:number)=>({kind:"collection",resourceId:`50000000-0000-4000-8000-${String(index).padStart(12,"0")}`,label:`Kategori ${index}`,path:`/kategori/${index}`});
const asset={id:"30000000-0000-4000-8000-000000000001",kind:"hero",url:"https://fixture.invalid/image.webp",altText:"Hero asset",mediaType:"image/webp",width:1200,height:800};
function fixture(section:unknown):StorefrontDesignDocument {return {...DESIGN,composition:{...DESIGN.composition,sections:[section]}} as StorefrontDesignDocument;}
const campaign={kind:"split_campaign",sectionId:"home_campaign_1",enabled:true,panels:[{heading:"Başlık",eyebrow:"Üst metin",body:"Korunacak açıklama",assetId:asset.id,destination:"/"}]};
const button=(container:HTMLElement,label:string)=>{const target=container.querySelector(`button[aria-label="${label}"]`);assert.ok(target);return target;};

test("campaign image change preserves eyebrow and body",async()=>withEditor(async({container,render,click,change})=>{
 const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(HomepageBuilder,{design:fixture(campaign),media:[{...asset,id:"30000000-0000-4000-8000-000000000003",altText:"Unrelated design media"}],assets:[asset,{...asset,id:"30000000-0000-4000-8000-000000000003"}],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 await click(button(container,"İkili kampanya bölümünü düzenle"));
 const image=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Görsel"))?.querySelector("select"); assert.ok(image);
 await change(image,"30000000-0000-4000-8000-000000000003");
 const result=changes.at(-1)?.composition.sections[0]; assert.equal(result?.kind,"split_campaign");if(result?.kind==="split_campaign") {assert.equal(result.panels[0]?.eyebrow,"Üst metin");assert.equal(result.panels[0]?.body,"Korunacak açıklama");}
 assert.doesNotMatch(image.textContent??"",/Unrelated design media/);
}));

test("editing campaign card two first keeps local incomplete input without invalid persistence",async()=>withEditor(async({container,render,click,change})=>{
 const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(HomepageBuilder,{design:fixture({...campaign,panels:[]}),media:[asset],assets:[asset],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 await click(button(container,"İkili kampanya bölümünü düzenle"));
 const fields=Array.from(container.querySelectorAll("fieldset"));const second=fields.find(field=>field.querySelector("legend")?.textContent==="2. kampanya");assert.ok(second);
 const image=Array.from(second.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Görsel"))?.querySelector("select");assert.ok(image);await change(image,asset.id);
 assert.equal(changes.length,0);assert.match(second.textContent??"",/Bağlantı seçin/);
}));

test("ninth category and fifth product duplication are disabled before invalid writes",async()=>withEditor(async({container,render,click})=>{
 const categories=Array.from({length:9},(_,i)=>category(i+1));
 await render(React.createElement(HomepageBuilder,{design:fixture({kind:"category_grid",sectionId:"home_categories_1",enabled:true,heading:"Kategoriler",layout:"grid",categoryIds:categories.slice(0,8).map(item=>item.resourceId)}),media:[],assets:[],destinations:categories,canManage:true,previewMode:"desktop",onChange:()=>{throw new Error("unexpected write");}}));
 await click(button(container,"Kategori vitrini bölümünü düzenle"));
 const checks=container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');assert.equal(checks[8]?.disabled,true);
 const row={kind:"product_row",enabled:true,heading:"Ürünler",source:"latest",limit:4};
 await render(React.createElement(HomepageBuilder,{design:{...DESIGN,composition:{...DESIGN.composition,sections:Array.from({length:4},(_,index)=>({...row,sectionId:`home_rows_${index}`}))}},media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:()=>{throw new Error("unexpected write");}}));
 assert.ok(Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label="Çoğalt"]')).every(item=>item.disabled));
}));

test("section editor uses one dialog owner and Escape closes only the section",async()=>withEditor(async({container,window,render,click})=>{
 let outerEscape=0;
 await render(React.createElement("div",{role:"dialog",onKeyDown:(event:React.KeyboardEvent)=>{if(event.key==="Escape")outerEscape++;}},React.createElement(HomepageBuilder,{design:DESIGN,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:()=>{}})));
 const trigger=button(container,"Ürün bölümü bölümünü düzenle");await click(trigger);
 assert.equal(container.querySelectorAll('[role="dialog"]').length,1);
 const editor=container.querySelector<HTMLElement>('[aria-labelledby="homepage-section-editor-heading"]');assert.ok(editor);
 await React.act(async()=>editor.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}) as unknown as Event));
 assert.equal(outerEscape,0);assert.equal(container.querySelector('[aria-labelledby="homepage-section-editor-heading"]'),null);
}));

test("empty heading stays editable with its field error and does not replace valid draft",async()=>withEditor(async({container,render,click,change})=>{
 const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(HomepageBuilder,{design:DESIGN,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const field=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Başlık"))?.querySelector("input");assert.ok(field);
 await change(field,"");assert.equal(field.value,"");assert.match(container.textContent??"",/Başlık yazın/);assert.equal(changes.length,0);assert.equal(field.getAttribute("aria-invalid"),"true");
 await change(field,"Yeni başlık");assert.equal(changes.length,1);assert.equal(field.getAttribute("aria-invalid"),"false");
}));

test("campaign second card can be completed first and both cards persist without sparse panels",async()=>withEditor(async({container,render,click,change})=>{
 const changes:StorefrontDesignDocument[]=[];
 await render(React.createElement(HomepageBuilder,{design:fixture({...campaign,panels:[]}),media:[],assets:[asset],destinations:[category(1)],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));
 await click(button(container,"İkili kampanya bölümünü düzenle"));
 for(const card of [2,1]){
  const fieldset=Array.from(container.querySelectorAll("fieldset")).find(field=>field.querySelector("legend")?.textContent===`${card}. kampanya`);assert.ok(fieldset);
  const field=(label:string)=>Array.from(fieldset.querySelectorAll("label")).find(item=>item.textContent?.startsWith(label))?.querySelector<HTMLInputElement|HTMLSelectElement>("input,select");
  await change(field("Başlık")!,`Kart ${card}`);await change(field("Görsel")!,asset.id);await change(field("Bağlantı")!,category(1).path);
  if(card===2)assert.equal(changes.length,0);
 }
 const section=changes.at(-1)?.composition.sections[0];assert.equal(section?.kind,"split_campaign");if(section?.kind==="split_campaign")assert.deepEqual(section.panels.map(panel=>panel.heading),["Kart 1","Kart 2"]);
}));

test("manual picker finds SKU and barcode, filters category, and reorders selected products",async()=>withEditor(async({container,render,click,change})=>{
 const products=[1,2,3].map(index=>({kind:"product",resourceId:`40000000-0000-4000-8000-${String(index).padStart(12,"0")}`,label:`Ürün ${index}`,path:`/urun/${index}`,searchTerms:[`SKU-${index}`,`869000000${index}`],categoryIds:[category(index===3?2:1).resourceId],priceCents:10000,available:index!==2}));
 let design=fixture({kind:"product_row",sectionId:"home_manual_1",enabled:true,heading:"Seçtiklerim",source:"manual",productIds:[],limit:12});
 const onChange=(next:StorefrontDesignDocument)=>{design=next;};
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[...products,category(1),category(2)],canManage:true,previewMode:"desktop",onChange}));
 await draw();await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const search=container.querySelector<HTMLInputElement>('input[type="search"]');assert.ok(search);await change(search,"SKU-1");assert.match(container.textContent??"",/Ürün 1/);assert.doesNotMatch(container.querySelector(".productPickerList")?.textContent??"",/Ürün 2/);
 let select=Array.from(container.querySelectorAll("button")).find(item=>item.textContent==="Seç");assert.ok(select);await click(select);await draw();
 await change(search,"8690000002");select=Array.from(container.querySelectorAll("button")).find(item=>item.textContent==="Seç");assert.ok(select);await click(select);await draw();
 await click(button(container,"Ürün 2 yukarı taşı"));await draw();const row=design.composition.sections[0];assert.equal(row?.kind,"product_row");if(row?.kind==="product_row")assert.deepEqual(row.productIds,[products[1]!.resourceId,products[0]!.resourceId]);
 await click(button(container,"Ürün 1 seçimini kaldır"));await draw();await change(search,"");const filter=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Kategori filtresi"))?.querySelector("select");assert.ok(filter);await change(filter,category(2).resourceId);assert.match(container.querySelector('ul.productPickerList')?.textContent??"",/Ürün 3/);
}));

test("category image overrides and explicit category order survive edits",async()=>withEditor(async({container,render,click,change})=>{
 const categories=[category(1),category(2)],categoryAsset={...asset,kind:"category"};let design=fixture({kind:"category_grid",sectionId:"home_categories_1",enabled:true,heading:"Kategoriler",layout:"grid",categoryIds:categories.map(item=>item.resourceId)});
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],assets:[categoryAsset],destinations:categories,canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw();await click(button(container,"Kategori vitrini bölümünü düzenle"));const image=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Kart görseli"))?.querySelector("select");assert.ok(image);await change(image,asset.id);await draw();await click(button(container,"Kategori 2 yukarı taşı"));await draw();
 const section=design.composition.sections[0];assert.equal(section?.kind,"category_grid");if(section?.kind==="category_grid"){assert.deepEqual(section.categoryIds,[categories[1]!.resourceId,categories[0]!.resourceId]);assert.deepEqual(section.categoryImages,[{categoryId:categories[0]!.resourceId,assetId:asset.id}]);}
}));

test("manual picker disables duplicates and thirteenth product and preserves selected order",async()=>withEditor(async({container,render,click})=>{
 const products=Array.from({length:13},(_,index)=>({kind:"product",resourceId:`40000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,label:`Ürün ${index+1}`,path:`/urun/${index+1}`}));const ids=products.slice(0,12).map(item=>item.resourceId);
 await render(React.createElement(HomepageBuilder,{design:fixture({kind:"product_row",sectionId:"home_manual_1",enabled:true,heading:"Seçtiklerim",source:"manual",productIds:ids,limit:12}),media:[],destinations:products,canManage:true,previewMode:"desktop",onChange:()=>{throw new Error("unexpected write");}}));await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const selectionButtons=Array.from(container.querySelectorAll("button")).filter(item=>["Seçildi","Seç"].includes(item.textContent??""));assert.equal(selectionButtons.length,13);assert.ok(selectionButtons.every(item=>item.disabled));assert.match(container.textContent??"",/12\/12/);
}));

test("value propositions support adding and removing within two-to-four item bounds",async()=>withEditor(async({container,render,click})=>{
 let design=fixture({kind:"value_propositions",sectionId:"home_values_1",enabled:true,items:[{icon:"shield",heading:"Güven",body:"Güvenli alışveriş"},{icon:"truck",heading:"Teslimat",body:"Özenli teslimat"}]});
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));await draw();await click(button(container,"Değer önerileri bölümünü düzenle"));
 assert.ok(Array.from(container.querySelectorAll("button")).filter(item=>item.textContent?.includes("Değeri kaldır")).every(item=>item.disabled));
 for(let i=0;i<2;i++){const add=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes("Değer ekle"));assert.ok(add);await click(add);await draw();}
 const add=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes("Değer ekle"));assert.equal(add?.disabled,true);
 const remove=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes("Değeri kaldır"));assert.ok(remove);await click(remove);await draw();const section=design.composition.sections[0];assert.equal(section?.kind,"value_propositions");if(section?.kind==="value_propositions")assert.equal(section.items.length,3);
 const addAgain=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes("Değer ekle"));assert.ok(addAgain);await click(addAgain);await draw();const final=design.composition.sections[0];if(final?.kind==="value_propositions")assert.equal(final.items.length,4);
}));

test("switching an automatic row to manual enables all twelve chosen products",async()=>withEditor(async({container,render,click,change})=>{
 const changes:StorefrontDesignDocument[]=[];await render(React.createElement(HomepageBuilder,{design:DESIGN,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>changes.push(value)}));await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const source=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Hangi ürünler?"))?.querySelector("select");assert.ok(source);await change(source,"manual");const row=changes.at(-1)?.composition.sections[0];assert.equal(row?.kind,"product_row");if(row?.kind==="product_row"){assert.equal(row.limit,12);assert.deepEqual(row.productIds,[]);}
}));

test("persisted legacy hero can be labeled, hidden, removed, and restored without a second banner editor",async()=>withEditor(async({container,render,click})=>{
 const legacy={kind:"hero",sectionId:"home_legacy_hero",enabled:true,slides:[{heading:"Eski banner",desktopAssetId:asset.id,destination:"/products"}]};let design=fixture(legacy);
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],assets:[asset],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));await draw();await click(button(container,"Eski banner kaydı bölümünü düzenle"));assert.match(container.textContent??"",/Önceki tasarımın banner kaydı/);assert.doesNotMatch(container.textContent??"",/undefined/);
 await click(button(container,"Bölüm düzenleyiciyi kapat"));await click(button(container,"Gizle"));await draw();assert.equal(design.composition.sections[0]?.enabled,false);await click(button(container,"Sil"));await draw();assert.equal(design.composition.sections.length,0);
 const undo=Array.from(container.querySelectorAll("button")).find(item=>item.textContent?.includes("Geri al"));assert.ok(undo);await click(undo);await draw();assert.equal(normalizeStarterThemeCompositionV3(design.composition).sections[0]?.sectionId,legacy.sectionId);assert.equal(design.composition.sections[0]?.enabled,false);
}));

test("Escape from a section field stays inside the real settings modal window listener",async()=>withEditor(async({container,window,render,click})=>{
 const {DesignSettingsModal}=compile<{DesignSettingsModal:(props:Record<string,unknown>)=>ReactNode}>(new URL("./DesignSettingsDrawer.tsx",import.meta.url));let closed=0;
 await render(React.createElement(DesignSettingsModal,{open:true,surface:{label:"Ana sayfa",hint:"Bölümler"},returnFocusRef:{current:null},onClose:()=>closed++},React.createElement(HomepageBuilder,{design:DESIGN,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:()=>{}})));
 const trigger=button(container,"Ürün bölümü bölümünü düzenle");await click(trigger);const field=container.querySelector<HTMLInputElement>('.homepageInspectorFields input');assert.ok(field);field.focus();await React.act(async()=>field.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}) as unknown as Event));
 assert.equal(closed,0);assert.equal(container.querySelector('[aria-labelledby="homepage-section-editor-heading"]'),null);assert.equal(container.querySelectorAll('[role="dialog"]').length,1);await React.act(async()=>new Promise(resolve=>setTimeout(resolve,5)));assert.equal(window.document.activeElement,trigger);
}));


test("editing an open section after hiding it preserves the hidden state", async () => withEditor(async ({ container, render, click, change }) => {
 let design=DESIGN;
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw(); await click(button(container,"Ürün bölümü bölümünü düzenle"));
 await click(button(container,"Gizle")); await draw();
 const field=container.querySelector<HTMLInputElement>('.homepageInspectorFields input'); assert.ok(field);
 await change(field,"Hidden selection"); await draw();
 const section=design.composition.sections[0]; assert.equal(section?.enabled,false);
 if(section?.kind==="product_row")assert.equal(section.heading,"Hidden selection");
}));

test("an open editor uses restored or conflict-resolved section content before the next edit", async () => withEditor(async ({ container, render, click, change }) => {
 let design=DESIGN;
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw(); await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const original=normalizeStarterThemeCompositionV3(design.composition).sections[0]; assert.equal(original?.kind,"product_row");
 if(original?.kind!=="product_row")return;
 design={...design,composition:{...design.composition,sections:[{...original,heading:"Restored heading",source:"sale",limit:8}]}}; await draw();
 const heading=container.querySelector<HTMLInputElement>('.homepageInspectorFields input'); assert.ok(heading); assert.equal(heading.value,"Restored heading");
 const count=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Ürün sayısı"))?.querySelector("select");assert.ok(count);
 await change(count,"12"); await draw(); const section=design.composition.sections[0];
 if(section?.kind==="product_row"){assert.equal(section.heading,"Restored heading");assert.equal(section.source,"sale");assert.equal(section.limit,12);}
}));

test("temporary input rebases on external changes without losing unrelated section values", async () => withEditor(async ({ container, render, click, change }) => {
 let design=DESIGN;
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw(); await click(button(container,"Ürün bölümü bölümünü düzenle"));
 const field=container.querySelector<HTMLInputElement>('.homepageInspectorFields input');assert.ok(field);await change(field,"");
 const original=normalizeStarterThemeCompositionV3(design.composition).sections[0];if(original?.kind!=="product_row")throw new Error("fixture row missing");
 design={...design,composition:{...design.composition,sections:[{...original,enabled:false,source:"sale",limit:8}]}};await draw();
 assert.equal(field.value,"");assert.equal(field.getAttribute("aria-invalid"),"true");
 await change(field,"Completed heading");await draw();const section=design.composition.sections[0];
 if(section?.kind==="product_row"){assert.equal(section.enabled,false);assert.equal(section.source,"sale");assert.equal(section.limit,8);assert.equal(section.heading,"Completed heading");}
}));

test("temporary campaign text keeps restored metadata in the same panel", async () => withEditor(async ({ container, render, click, change }) => {
 let design=fixture(campaign);
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],assets:[asset],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw();await click(button(container,"İkili kampanya bölümünü düzenle"));
 const field=container.querySelector<HTMLInputElement>('.homepageInspectorFields input');assert.ok(field);await change(field,"");
 design=fixture({...campaign,enabled:false,panels:[{...campaign.panels[0]!,body:"Restored body",eyebrow:"Restored eyebrow"}]});await draw();
 assert.equal(field.value,"");await change(field,"Completed campaign");await draw();const section=design.composition.sections[0];
 if(section?.kind==="split_campaign"){assert.equal(section.enabled,false);assert.equal(section.panels[0]?.body,"Restored body");assert.equal(section.panels[0]?.eyebrow,"Restored eyebrow");assert.equal(section.panels[0]?.heading,"Completed campaign");}
}));


test("temporary value text preserves items added by an external restored section", async () => withEditor(async ({ container, render, click, change }) => {
 const items=[{icon:"shield",heading:"Trust",body:"Original trust"},{icon:"truck",heading:"Delivery",body:"Original delivery"}];
 let design=fixture({kind:"value_propositions",sectionId:"home_values",enabled:true,items});
 const draw=()=>render(React.createElement(HomepageBuilder,{design,media:[],destinations:[],canManage:true,previewMode:"desktop",onChange:(value:StorefrontDesignDocument)=>{design=value;}}));
 await draw();await click(button(container,"Değer önerileri bölümünü düzenle"));
 const heading=Array.from(container.querySelectorAll("label")).find(label=>label.textContent?.startsWith("Başlık"))?.querySelector("input");assert.ok(heading);await change(heading,"");
 design=fixture({kind:"value_propositions",sectionId:"home_values",enabled:true,items:[{...items[0]!,body:"Restored trust"},items[1]!,{icon:"heart",heading:"Care",body:"Restored care"}]});await draw();
 await change(heading,"Completed trust");await draw();const section=design.composition.sections[0];
 if(section?.kind==="value_propositions"){assert.equal(section.items.length,3);assert.equal(section.items[0]?.body,"Restored trust");assert.equal(section.items[2]?.heading,"Care");}
}));
