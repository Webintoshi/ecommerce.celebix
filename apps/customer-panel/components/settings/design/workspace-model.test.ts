import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStorefrontDesignDocumentV5 } from "@celebix/saas-contracts";
import { DESIGN } from "./design-editor-test-utils.ts";
import { applyDesignEdit, beginDesignApply, cancelDesignEdit, compareDesignDrafts, completeDesignApply, createDesignEditorState, editorAssetOptions, failDesignApply, undoDesignEdit, redoDesignEdit } from "./workspace-model.ts";
const design=()=>normalizeStorefrontDesignDocumentV5(DESIGN);
test("editor assets retain their actual purpose and never convert product media into theme assets",()=>{
 const option={id:"40000000-0000-4000-8000-000000000001",url:"https://fixture.invalid/image.webp",altText:"One",mediaType:"image/webp" as const,width:1200,height:800};
 const assets=editorAssetOptions([{...option,reference:{kind:"asset",assetId:option.id},assetKind:"category"},{...option,id:"40000000-0000-4000-8000-000000000002",reference:{kind:"asset",assetId:"40000000-0000-4000-8000-000000000002"},assetKind:"hero"},{...option,reference:{kind:"media",mediaId:option.id}}]);
 assert.deepEqual(assets.map(({id,kind})=>({id,kind})),[{id:option.id,kind:"category"},{id:"40000000-0000-4000-8000-000000000002",kind:"hero"}]);
});
test("published baseline changes only after direct Apply; Cancel discards local input",()=>{
 const baseline=design();const state=createDesignEditorState({design:baseline,publishedVersion:4});
 const local=applyDesignEdit(state,{...baseline,brand:{...baseline.brand,primaryColor:"#123456"}});
 assert.equal(state.design.brand.primaryColor,baseline.brand.primaryColor);assert.equal(local.publishedVersion,4);
 assert.deepEqual(cancelDesignEdit(local).design,baseline);
 const request=beginDesignApply(local,"operation-a");assert.equal(request.token.expectedPublishedVersion,4);
 const complete=completeDesignApply(request.state,request.token,{design:normalizeStorefrontDesignDocumentV5(local.design),publishedVersion:5,publishedAt:"2026-09-30T10:00:00Z",published:{} as never});
 assert.equal(complete.publishedVersion,5);assert.equal(complete.status,"applied");assert.deepEqual(complete.baseline,local.design);
});
test("uncertain retry retains identical operation and payload; a later edit starts a new operation",()=>{
 const original=createDesignEditorState({design:design(),publishedVersion:4});const edit=applyDesignEdit(original,{...original.design,promotion:{...original.design.promotion,headline:"Local"}});
 const first=beginDesignApply(edit,"operation-a");const failed=failDesignApply(first.state,"error");
 assert.equal(failed.design.promotion.headline,"Local");const retry=beginDesignApply(failed,"operation-b");
 assert.equal(retry.token.operationId,"operation-a");assert.equal(retry.token.design,first.token.design);
 const changed=applyDesignEdit(failed,{...failed.design,promotion:{...failed.design.promotion,headline:"Corrected"}});assert.equal(beginDesignApply(changed,"operation-b").token.operationId,"operation-b");
 const conflict=failDesignApply(first.state,"conflict");assert.equal(conflict.publishedVersion,4);assert.equal(conflict.design.promotion.headline,"Local");
});

test("conflict comparison uses destination and image names without exposing routes or resource IDs",()=>{
 const base=design(),first="40000000-0000-4000-8000-000000000001",second="40000000-0000-4000-8000-000000000002";
 const local={...base,brand:{...base.brand,logo:{kind:"media" as const,mediaId:first}},promotion:{...base.promotion,destination:{kind:"collection" as const,resourceId:first}},composition:{...base.composition,announcement:{...base.composition.announcement,destination:"/categories/earrings"}}};
 const remote={...base,brand:{...base.brand,logo:{kind:"legacy_https" as const,url:"https://cdn.fixture.invalid/logo.webp"}},promotion:{...base.promotion,destination:{kind:"collection" as const,resourceId:second}},composition:{...base.composition,announcement:{...base.composition.announcement,destination:"/products"}}};
 const destinations=[{kind:"collection" as const,resourceId:first,label:"Küpeler",path:"/categories/earrings"},{kind:"collection" as const,resourceId:second,label:"Bileklikler",path:"/categories/bracelets"}];
 const resources={destinations,media:[{id:first,url:"https://cdn.fixture.invalid/new-logo.webp",altText:"Yeni logo",mediaType:"image/webp" as const,width:100,height:100},{id:second,url:"https://cdn.fixture.invalid/logo.webp",altText:"Mağaza logosu",mediaType:"image/webp" as const,width:100,height:100}]};
 const rows=compareDesignDrafts(local,remote,{local:resources,remote:resources});
 assert.deepEqual(rows,[{field:"Marka · Logo",local:"Yeni logo",remote:"Mağaza logosu"},{field:"Kampanya · Bağlantı",local:"Küpeler",remote:"Bileklikler"},{field:"Tema · Duyuru · Bağlantı",local:"Küpeler",remote:"Ürünler"}]);
 assert.doesNotMatch(JSON.stringify(rows),/40000000|https:|\/categories|\/products/);
 assert.equal(local.promotion.destination.resourceId,first);assert.equal(remote.composition.announcement.destination,"/products");
});

test("unknown selections remain visibly different and section text changes are not collapsed into an image reference",()=>{
 const base=design();
 const local={...base,composition:{...base.composition,announcement:{...base.composition.announcement,destination:"/pages/legacy-a"},sections:[{kind:"brand_story" as const,sectionId:"home_story" as const,enabled:true,heading:"Yerel başlık",body:"Yerel açıklama",assetId:"40000000-0000-4000-8000-000000000001"}]}};
 const remote={...base,composition:{...base.composition,announcement:{...base.composition.announcement,destination:"/pages/legacy-b"},sections:[{kind:"brand_story" as const,sectionId:"home_story" as const,enabled:true,heading:"Yayındaki başlık",body:"Yayındaki açıklama",assetId:"40000000-0000-4000-8000-000000000002"}]}};
 const rows=compareDesignDrafts(local,remote);
 const link=rows.find(row=>row.field==="Tema · Duyuru · Bağlantı")!;
 assert.equal(link.local,"Mevcut bağlantı (bu çalışma)");assert.equal(link.remote,"Mevcut bağlantı (güncel sürüm)");
 assert.ok(rows.some(row=>row.local==="Yerel başlık"&&row.remote==="Yayındaki başlık"));
 assert.ok(rows.some(row=>row.local==="Yerel açıklama"&&row.remote==="Yayındaki açıklama"));
 assert.ok(rows.some(row=>row.local==="Görsel seçildi (bu çalışma)"&&row.remote==="Görsel seçildi (güncel sürüm)"));
 assert.doesNotMatch(JSON.stringify(rows),/legacy-a|legacy-b|40000000|assetId/);
 assert.deepEqual(compareDesignDrafts(local,structuredClone(local)),[]);
});

test("conflict comparison keeps category order and social account changes understandable",()=>{
 const base=design(),first="40000000-0000-4000-8000-000000000001",second="40000000-0000-4000-8000-000000000002";
 const local={...base,composition:{...base.composition,navigation:{...base.composition.navigation,rootCategoryIds:[first,second]},footer:{...base.composition.footer,social:[{network:"instagram" as const,url:"https://www.instagram.com/yenihesap"}]}}};
 const remote={...base,composition:{...base.composition,navigation:{...base.composition.navigation,rootCategoryIds:[second,first]},footer:{...base.composition.footer,social:[{network:"instagram" as const,url:"https://www.instagram.com/eski"}]}}};
 const resources={media:[],destinations:[{kind:"collection" as const,resourceId:first,label:"Küpeler",path:"/categories/earrings"},{kind:"collection" as const,resourceId:second,label:"Bileklikler",path:"/categories/bracelets"}]};
 const rows=compareDesignDrafts(local,remote,{local:resources,remote:resources});
 assert.ok(rows.some(row=>row.field==="Tema · Menü · Menü kategorileri · 1. öğe"&&row.local==="Küpeler"&&row.remote==="Bileklikler"));
 assert.ok(rows.some(row=>row.local.includes("yenihesap")&&row.remote.includes("eski")));
 assert.doesNotMatch(JSON.stringify(rows),/40000000|https:|instagram\.com/);
});


test("undo restores brand, text and section removal; redo returns the exact local design without publishing",()=>{
 const initial=createDesignEditorState({design:design(),publishedVersion:4});
 const branded=applyDesignEdit(initial,{...initial.design,brand:{...initial.design.brand,primaryColor:"#123456"}});
 const text=applyDesignEdit(branded,{...branded.design,promotion:{...branded.design.promotion,headline:"New campaign"}});
 const removed=applyDesignEdit(text,{...text.design,composition:{...text.design.composition,sections:[]}});
 const one=undoDesignEdit(removed),two=undoDesignEdit(one),three=undoDesignEdit(two);
 assert.equal(one.design.composition.sections.length,initial.design.composition.sections.length);
 assert.equal(two.design.promotion.headline,"Fixture");assert.equal(two.design.brand.primaryColor,"#123456");
 assert.equal(three.design.brand.primaryColor,"#FF5A00");assert.equal(three.status,"applied");assert.equal(three.publishedVersion,4);
 assert.deepEqual(redoDesignEdit(redoDesignEdit(redoDesignEdit(three))).design,removed.design);
 assert.equal(removed.baseline.brand.primaryColor,"#FF5A00");
});
test("typing bursts are one undo step while another field, a pause or a discrete action remain separate",()=>{
 let state=createDesignEditorState({design:design(),publishedVersion:4});
 const headline=(text:string,key:string|undefined,now:number)=>{state=applyDesignEdit(state,{...state.design,promotion:{...state.design.promotion,headline:text}},undefined,{group:key,now});};
 headline("A","headline",1000);headline("AB","headline",1200);headline("ABC","headline",1400);
 assert.equal(undoDesignEdit(state).design.promotion.headline,"Fixture");
 headline("Paused","headline",3000);assert.equal(undoDesignEdit(state).design.promotion.headline,"ABC");
 headline("Different field","other",3100);assert.equal(undoDesignEdit(state).design.promotion.headline,"Paused");
 headline("Button action",undefined,3200);assert.equal(undoDesignEdit(state).design.promotion.headline,"Different field");
});
test("editing after undo drops redo; Cancel and successful Apply reset the editing history",()=>{
 const initial=createDesignEditorState({design:design(),publishedVersion:4});
 const edited=applyDesignEdit(initial,{...initial.design,promotion:{...initial.design.promotion,headline:"Local"}});
 const undone=undoDesignEdit(edited),branched=applyDesignEdit(undone,{...undone.design,promotion:{...undone.design.promotion,headline:"Branch"}});
 assert.equal(redoDesignEdit(branched),branched);
 const cancelled=cancelDesignEdit(edited);assert.equal(redoDesignEdit(cancelled),cancelled);assert.equal(undoDesignEdit(cancelled),cancelled);
 const request=beginDesignApply(edited,"operation-a");assert.equal(undoDesignEdit(request.state),request.state);
 const done=completeDesignApply(request.state,request.token,{design:normalizeStorefrontDesignDocumentV5(edited.design),publishedVersion:5,publishedAt:"2026-10-18T10:00:00Z",published:{} as never});
 assert.equal(undoDesignEdit(done),done);assert.equal(redoDesignEdit(done),done);
});
test("history is bounded and redo does not retain a failed operation for another design",()=>{
 let state=createDesignEditorState({design:design(),publishedVersion:4});
 for(let i=1;i<=70;i++)state=applyDesignEdit(state,{...state.design,promotion:{...state.design.promotion,headline:String(i)}});
 let count=0,next=undoDesignEdit(state);while(next!==state){count++;state=next;next=undoDesignEdit(state);}
 assert.equal(count,30);assert.equal(state.design.promotion.headline,"40");
 const first=beginDesignApply(redoDesignEdit(state),"failed-operation"),failed=failDesignApply(first.state,"error");
 const changed=undoDesignEdit(failed);assert.equal(changed.pending,undefined);
 assert.equal(beginDesignApply(redoDesignEdit(changed),"new-operation").token.operationId,"new-operation");
});
